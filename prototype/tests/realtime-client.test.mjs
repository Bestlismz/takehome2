import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeVoiceSession } from '../realtime-client.js';

function transport(options = {}) {
  const events = [];
  const voice = new RealtimeVoiceSession(() => {}, () => {}, () => {}, options);
  voice.active = true;
  voice.ready = true;
  voice.channel = { readyState: 'open', send(text) { events.push(JSON.parse(text)); }, close() {} };
  return { voice, events };
}

test('camera frames are bounded to the two most recent items and stop when inactive', async () => {
  const { voice, events } = transport({ getFrame: () => 'data:image/jpeg;base64,frame' });
  for (let i = 0; i < 4; i++) await voice.pushFrame();
  assert.equal(events.filter(e => e.type === 'conversation.item.create').length, 4);
  assert.equal(events.filter(e => e.type === 'conversation.item.delete').length, 2);
  assert.equal(voice.frames.length, 2);
  voice.active = false;
  await voice.pushFrame();
  assert.equal(events.length, 6);
});

test('unconfirmed health proposals reach staging only after the current transcript', async () => {
  const calls=[];
  const { voice, events } = transport({ onTool(call) { calls.push(call);return {saved:false,requiresConfirmation:true}; } });
  await voice.handleEvent({type:'input_audio_buffer.speech_started',item_id:'health-turn'},voice.generation);
  await voice.handleEvent({type:'conversation.item.input_audio_transcription.completed',item_id:'health-turn',transcript:'วันนี้กินข้าวต้ม'},voice.generation);
  await voice.handleEvent({type:'response.function_call_arguments.done',name:'record_observation',call_id:'call1',arguments:JSON.stringify({confirmed:false,kind:'meal'})},voice.generation);
  assert.equal(calls.length,1);assert.equal(calls[0].args.confirmed,false);
  const output=events.find(e=>e.item?.type==='function_call_output');
  assert.equal(JSON.parse(output.item.output).requiresConfirmation,true);
});

test('a repeated provider tool event only executes its application action once', async () => {
  let actions = 0;
  const { voice } = transport({ onTool(call) { assert.equal(call.tool, 'camera.open'); actions++; return { ok: true }; } });
  const event = { type: 'response.function_call_arguments.done', name: 'camera_open', call_id: 'call2', arguments: '{"facing":"environment"}' };
  await voice.handleEvent(event, voice.generation);
  await voice.handleEvent(event, voice.generation);
  assert.equal(actions, 1);
});

test('phone sessions read the queued question rather than generate a second greeting', async () => {
  const { voice, events } = transport({ getContext: () => ({ mode: 'phone' }) });
  voice.pendingSpeech = 'สะดวกคุยตอนนี้ไหมคะ';
  await voice.handleEvent({ type: 'session.created' }, voice.generation);
  const responses = events.filter(e => e.type === 'response.create');
  assert.equal(responses.length, 1);
  assert.match(responses[0].response.instructions, /สะดวกคุย/);
});

test('record tools wait for the current spoken confirmation transcript and ignore older turns', async () => {
  let actions = 0;
  const transcripts = [];
  const starts = [];
  const { voice, events } = transport({ onTurnStart: id => starts.push(id), onTranscript: (text, role, meta) => transcripts.push([text, meta.itemId]), onTool() { actions++; return { saved: true }; } });
  await voice.handleEvent({ type: 'input_audio_buffer.speech_started', item_id: 'current' }, voice.generation);
  const tool = voice.handleEvent({ type: 'response.function_call_arguments.done', name: 'record_observation', call_id: 'record1', arguments: '{"confirmed":true,"kind":"symptom"}' }, voice.generation);
  await Promise.resolve();
  assert.equal(actions, 0);
  await voice.handleEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'older', transcript: 'ยืนยัน' }, voice.generation);
  assert.equal(actions, 0);
  assert.deepEqual(transcripts, []);
  await voice.handleEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'current', transcript: 'ยืนยันค่ะ' }, voice.generation);
  await tool;
  assert.equal(actions, 1);
  assert.deepEqual(starts, ['current']);
  assert.deepEqual(transcripts, [['ยืนยันค่ะ', 'current']]);
  assert.equal(JSON.parse(events.find(e => e.item?.type === 'function_call_output').item.output).saved, true);
});

test('mascot amplitude follows AI output while speaking without connecting a second playback path', () => {
  const savedWindow = globalThis.window;
  const savedRaf = globalThis.requestAnimationFrame;
  const savedCancel = globalThis.cancelAnimationFrame;
  const nodes = [];
  let nextFrame;
  const levels = [];
  class MeterContext {
    constructor() { this.destination = { output: true }; this.analysers = []; }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createAnalyser() {
      const index = this.analysers.length;
      const analyser = { disconnected: false, disconnect() { this.disconnected = true; }, getByteTimeDomainData(samples) { samples.fill(index === 0 ? 128 : 144); } };
      this.analysers.push(analyser); nodes.push(analyser); return analyser;
    }
    createMediaStreamSource(stream) {
      const source = { stream, targets: [], disconnected: false, connect(target) { this.targets.push(target); }, disconnect() { this.disconnected = true; } };
      nodes.push(source); return source;
    }
  }
  globalThis.window = { AudioContext: MeterContext };
  globalThis.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  try {
    const voice = new RealtimeVoiceSession(() => {}, () => {}, value => levels.push(value));
    voice.startMeter({ role: 'microphone' }, voice.generation);
    assert.equal(levels.at(-1), 0);
    voice.attachOutputMeter({ role: 'assistant' });
    const context = voice.context;
    voice.audioPlaying = true;
    nextFrame();
    assert.ok(levels.at(-1) > .4);
    for (const source of nodes.filter(node => node.targets)) assert.ok(!source.targets.includes(context.destination));
    voice.audioPlaying = false;
    nextFrame();
    assert.equal(levels.at(-1), 0);
    voice.release();
    assert.ok(nodes.every(node => node.disconnected));
    assert.equal(voice.outputSource, null);
    assert.equal(voice.outputAnalyser, null);
  } finally {
    globalThis.window = savedWindow;
    globalThis.requestAnimationFrame = savedRaf;
    globalThis.cancelAnimationFrame = savedCancel;
  }
});

test('a failed tool from an ended call never writes to a newly connected call',async()=>{
 let rejectOld;const {voice}=transport({onTool:()=>new Promise((_,reject)=>{rejectOld=reject;})});
 const old=voice.handleEvent({type:'response.function_call_arguments.done',name:'web_search',call_id:'old-search',arguments:'{"query":"public guidance"}'},voice.generation);
 await Promise.resolve();
 voice.generation++;voice.processing=true;const newEvents=[];voice.channel={readyState:'open',send:raw=>newEvents.push(JSON.parse(raw))};
 rejectOld(new Error('old search failed'));await old;
 assert.deepEqual(newEvents,[]);assert.equal(voice.processing,true);
});

test('tool completion waits for the active response before asking AI to speak its result',async()=>{
 const {voice,events}=transport({onTool:async()=>({ok:true,sources:[{url:'https://medlineplus.gov/'}]})});
 await voice.handleEvent({type:'response.created'},voice.generation);
 await voice.handleEvent({type:'response.function_call_arguments.done',name:'web_search',call_id:'search-busy',arguments:'{"query":"public medicine information"}'},voice.generation);
 assert.equal(events.filter(e=>e.type==='response.create').length,0);
 assert.equal(events.filter(e=>e.item?.type==='function_call_output').length,1);
 await voice.handleEvent({type:'response.done',response:{status:'completed'}},voice.generation);
 assert.equal(events.filter(e=>e.type==='response.create').length,1);
});

test('checking medicine maps to the public medication endpoint tool',async()=>{
 const calls=[];const {voice,events}=transport({onTool:call=>{calls.push(call);return {ok:true,sources:[{url:'https://medlineplus.gov/'}]};}});
 await voice.handleEvent({type:'response.function_call_arguments.done',name:'medication_lookup',call_id:'medicine-1',arguments:'{"name":"Metformin","strength":"500 มิลลิกรัม","topic":"general"}'},voice.generation);
 assert.equal(calls[0].tool,'medication.lookup');assert.equal(calls[0].args.name,'Metformin');
 const result=JSON.parse(events.find(e=>e.item?.type==='function_call_output').item.output);assert.equal(result.ok,true);
});

test('opening the camera sends its first available label image before continuing the answer',async()=>{
 let visible=false;const {voice,events}=transport({onTool:()=>{visible=true;return {ok:true};},getFrame:()=>visible?'data:image/jpeg;base64,label':null});
 await voice.handleEvent({type:'response.function_call_arguments.done',name:'camera_open',call_id:'camera-medicine',arguments:'{"facing":"environment"}'},voice.generation);
 const imageIndex=events.findIndex(e=>e.item?.content?.[0]?.type==='input_image');
 const resultIndex=events.findIndex(e=>e.item?.type==='function_call_output');
 assert.ok(imageIndex>=0);assert.ok(resultIndex>imageIndex);
 assert.ok(events.findIndex(e=>e.type==='response.create')>resultIndex);
});

test('a server-provided greeting uses its conversational instruction without adding another question',async()=>{
 const {voice,events}=transport();voice.greetingInstructions='สวัสดีค่ะ หนูเป็นผู้ช่วยลูกหลานนะคะ วันนี้เป็นยังไงบ้าง แล้วหยุดรอฟัง';
 await voice.handleEvent({type:'session.created'},voice.generation);
 const responses=events.filter(e=>e.type==='response.create');assert.equal(responses.length,1);
 assert.equal(responses[0].response.instructions,voice.greetingInstructions);
});

test('warm scripted delivery preserves the exact appointment numbers and explicit confirmation request',()=>{
 const {voice,events}=transport();voice.fixedSpeechDelivery='ใช้เสียงเป็นกันเอง รักษาตัวเลขและคำถามยืนยันทุกคำ';
 voice.speak('พรุ่งนี้ 14:00 น. ยืนยันไหมคะ');
 const instruction=events.find(e=>e.type==='response.create').response.instructions;
 assert.ok(instruction.startsWith(voice.fixedSpeechDelivery));
 assert.ok(instruction.includes(JSON.stringify('พรุ่งนี้ 14:00 น. ยืนยันไหมคะ')));
});
