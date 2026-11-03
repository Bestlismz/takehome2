import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ConversationStage } from '../conversation-stage.js';
import { waitForVideoFrame } from '../media.js';

function fixture(options) {
  const nodes = new Map();
  const node = () => ({ hidden: false, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; } });
  for (const selector of ['#camera-video', '#session-camera', '#camera-empty', '#camera-live-badge', '[data-action="camera-switch"]', '#camera-freeze']) nodes.set(selector, node());
  const root = { dataset: { camera: 'off' }, querySelector(selector) { return nodes.get(selector); } };
  nodes.get('#camera-video').srcObject = 'live-stream';
  return { root, stage: new ConversationStage(root, options), nodes };
}

test('opening and closing the camera reuse the same conversation stage and video element', () => {
  const { root, stage, nodes } = fixture({ reducedMotion: true });
  const video = stage.video;
  stage.requesting();
  assert.equal(root.dataset.camera, 'loading');
  assert.equal(stage.cameraRequested, true);
  stage.live({ canSwitch: true });
  assert.equal(root.dataset.camera, 'live');
  assert.equal(nodes.get('[data-action="camera-switch"]').hidden, false);
  stage.closing();
  assert.equal(root.dataset.camera, 'off');
  assert.equal(stage.video, video);
  assert.equal(root.querySelector('#camera-video'), video);
  assert.equal(video.srcObject, null);
  stage.destroy();
});

test('a fade-out cleanup cannot clear a camera that was reopened during the transition', async () => {
  const { root, stage, nodes } = fixture();
  try {
    stage.live();
    stage.closing('data:image/jpeg;base64,frame');
    assert.equal(root.dataset.camera, 'closing');
    assert.equal(nodes.get('#camera-freeze').src, 'data:image/jpeg;base64,frame');
    stage.requesting();
    stage.video.srcObject = 'new-live-stream';
    stage.live();
    await delay(500);
    assert.equal(root.dataset.camera, 'live');
    assert.equal(stage.video.srcObject, 'new-live-stream');
  } finally { stage.destroy(); }
});

test('camera permission errors leave the conversation stage present and permit another request', () => {
  const { root, stage, nodes } = fixture();
  try {
    stage.requesting();
    stage.error('ยังไม่ได้อนุญาตกล้อง');
    assert.equal(root.dataset.camera, 'error');
    assert.equal(stage.cameraRequested, false);
    assert.equal(nodes.get('#session-camera').attributes['aria-hidden'], 'true');
    assert.equal(nodes.get('#camera-empty').textContent, 'ยังไม่ได้อนุญาตกล้อง');
    stage.requesting();
    assert.equal(root.dataset.camera, 'loading');
    assert.equal(stage.cameraRequested, true);
  } finally { stage.destroy(); }
});

test('a camera is not announced as visually ready until the browser delivers a video frame', async () => {
  let onFrame;
  let ready = false;
  const video = { requestVideoFrameCallback(callback) { onFrame = callback; return 1; }, readyState: 2 };
  const frame = waitForVideoFrame(video).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  onFrame();
  await frame;
  assert.equal(ready, true);
});
