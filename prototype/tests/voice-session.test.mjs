import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { VoiceSession, interpret } from '../media.js';
import { executeTool } from '../voice-tools.js';

const recognitions = [];
class Recognition {
  constructor() { recognitions.push(this); }
  start() { queueMicrotask(() => this.onstart?.()); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  final(text) { this.onresult({ results: [{ isFinal: true, 0: { transcript: text } }] }); }
}
const synthesis = {
  speaking: false, pending: false, current: null,
  getVoices: () => [],
  cancel() { this.speaking = false; this.current = null; },
  speak(message) { this.current = message; this.speaking = true; message.onstart?.(); },
  finish() { const message = this.current; this.current = null; this.speaking = false; message?.onend?.(); },
};
globalThis.window = { SpeechRecognition: Recognition, speechSynthesis: synthesis };
globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
globalThis.cancelAnimationFrame = () => {};
const settle = () => delay(300);

test('silence ending a recognition turn resumes listening without another user action', async () => {
  const voice = new VoiceSession(() => {}, () => {});
  const before = recognitions.length;
  try {
    voice.listen();
    await delay(0);
    recognitions.at(-1).onend();
    await settle();
    assert.equal(recognitions.length, before + 2);
    assert.equal(voice.active, true);
  } finally { voice.stop(); }
});

test('a camera tool can finish and speak, then listening resumes in the same session', async () => {
  let release;
  const toolFinished = new Promise(resolve => { release = resolve; });
  const commands = [];
  const voice = new VoiceSession(() => {}, async text => {
    commands.push(text);
    const result = await executeTool(interpret(text), { 'camera.open': async () => { await toolFinished; return 'เปิดกล้องแล้ว'; }, 'camera.close': () => 'ปิดกล้องแล้ว' });
    voice.speak(result);
  });
  const before = recognitions.length;
  try {
    voice.listen();
    await delay(0);
    recognitions.at(-1).final('เปิดกล้องหลัง');
    await settle();
    assert.deepEqual(commands, ['เปิดกล้องหลัง']);
    assert.equal(recognitions.length, before + 1);
    release();
    await delay(0);
    assert.equal(synthesis.speaking, true);
    await settle();
    assert.equal(recognitions.length, before + 1);
    synthesis.finish();
    await settle();
    assert.equal(recognitions.length, before + 2);
    recognitions.at(-1).final('ปิดกล้อง');
    await delay(0);
    assert.equal(commands.at(-1), 'ปิดกล้อง');
    assert.equal(synthesis.current.text, 'ปิดกล้องแล้ว');
  } finally { voice.stop(); }
});

test('explicit microphone pause prevents a late recognition-end event from restarting it', async () => {
  const voice = new VoiceSession(() => {}, () => {});
  try {
    voice.listen();
    await delay(0);
    const recognition = recognitions.at(-1);
    const count = recognitions.length;
    voice.stop();
    recognition.onend();
    await settle();
    assert.equal(recognitions.length, count);
    assert.equal(voice.active, false);
  } finally { voice.stop(); }
});

test('permission denial keeps the error and does not request permission repeatedly', async () => {
  const states = [];
  const voice = new VoiceSession((phase, message) => states.push({ phase, message }), () => {});
  try {
    voice.listen();
    await delay(0);
    const count = recognitions.length;
    const recognition = recognitions.at(-1);
    recognition.onerror({ error: 'not-allowed' });
    recognition.onend();
    await settle();
    assert.equal(recognitions.length, count);
    assert.equal(states.at(-1).phase, 'error');
    assert.equal(voice.active, false);
  } finally { voice.stop(); }
});

test('camera-off and end-call commands execute different tools from opening the camera', async () => {
  assert.equal(interpret('ยังไม่ยืนยัน ค่าผิด').action, 'cancel-record');
  assert.equal(interpret('ไม่ถูกต้อง').action, 'cancel-record');
  assert.equal(interpret('ไม่ต้องเปิดกล้อง').tool, 'camera.close');
  assert.deepEqual(interpret('เปิดกล้องหลัง'), { tool: 'camera.open', args: { facing: 'environment' } });
  assert.deepEqual(interpret('เปิดกล้องหน้า'), { tool: 'camera.open', args: { facing: 'user' } });
  const effects = [];
  const handlers = {
    'camera.close': () => effects.push('video-off'),
    'conversation.end': () => effects.push('session-ended'),
  };
  await executeTool(interpret('ปิดกล้องให้หน่อย'), handlers);
  await executeTool(interpret('วางสาย'), handlers);
  assert.deepEqual(effects, ['video-off', 'session-ended']);
});
