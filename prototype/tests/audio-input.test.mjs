import test from 'node:test';
import assert from 'node:assert/strict';
import {microphoneConstraints,microphoneCapabilities} from '../audio-input.js';
import {RealtimeVoiceSession} from '../realtime-client.js';

test('microphone requests supported processing as preferences without rejecting quiet/older hardware',()=>{
 assert.deepEqual(microphoneConstraints({noiseSuppression:true,echoCancellation:true}),{echoCancellation:{ideal:true},noiseSuppression:{ideal:true}});
 assert.deepEqual(microphoneConstraints({}),{});
 assert.deepEqual(microphoneCapabilities({getSettings:()=>({noiseSuppression:false,echoCancellation:true,deviceId:'private-hardware'})}),{echoCancellation:true,noiseSuppression:false,autoGainControl:null});
});
test('changing noise profile updates the existing call and preserves manual mute',async()=>{
 const previous=globalThis.fetch;const sent=[];
 globalThis.fetch=async()=>({ok:true,json:async()=>({audioInput:{noise_reduction:{type:'far_field'},turn_detection:{type:'server_vad',threshold:.65}}})});
 try{
  const voice=new RealtimeVoiceSession(()=>{});const peer={};voice.peer=peer;voice.ready=true;voice.active=true;voice.inputMuted=true;
  voice.channel={readyState:'open',send:event=>sent.push(JSON.parse(event))};
  await voice.setAudioProfile('noisy');
  assert.equal(voice.peer,peer);assert.equal(voice.active,true);assert.equal(voice.inputMuted,true);
  assert.equal(sent[0].type,'session.update');assert.equal(sent[0].session.audio.input.turn_detection.threshold,.65);
 }finally{globalThis.fetch=previous;}
});
