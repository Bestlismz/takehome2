import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isExplicitAppConfirmation,rejectsProposal,validateAppAction} from '../app-commands.js';
import {RealtimeVoiceSession} from '../realtime-client.js';
import {setLanguage} from '../i18n.js';
import {labels,schedules,describe,thaiDate,dateKey} from '../data.js';
const catalog=JSON.parse(readFileSync(new URL('../app-command-catalog.json',import.meta.url),'utf8'));

test('English confirmation rejects negation and binds cancellation to the intended action',()=>{
 for(const text of ['I confirm','Yes, save it','Confirm.','Go ahead'])assert.equal(isExplicitAppConfirmation(text),true,text);
 for(const text of ['I do not confirm','No, save it','Confirm but change the time','Not yet','Yes I do not confirm'])assert.equal(isExplicitAppConfirmation(text),false,text);
 assert.equal(isExplicitAppConfirmation('Confirm cancel',{action:'calendar.cancel'}),true);
 assert.equal(isExplicitAppConfirmation('Confirm cancel',{action:'calendar.add'}),false);
 assert.equal(rejectsProposal('No, do not save','calendar.add'),true);
 assert.deepEqual(validateAppAction({action:'language.set',language:'en'},catalog),{action:'language.set',language:'en'});
});

test('changing language updates the existing realtime peer without ending camera frames',async()=>{
 const oldFetch=globalThis.fetch,events=[];
 const voice=new RealtimeVoiceSession(()=>{},()=>{},()=>{},{getContext:()=>({mode:'app',audioProfile:'headset'})});
 voice.active=true;voice.ready=true;voice.peer={marker:'same-peer'};voice.frames=['last-camera-frame'];
 voice.channel={readyState:'open',send:event=>events.push(JSON.parse(event))};
 globalThis.fetch=async(path,options)=>{assert.equal(path,'/api/voice-language');assert.equal(JSON.parse(options.body).language,'en');return {ok:true,json:async()=>({instructions:'Speak English',audioInput:{transcription:{language:'en'}},greetingInstructions:'Hello',fixedSpeechDelivery:'Read English'})};};
 try {
  const peer=voice.peer;await voice.setLanguage('en');
  assert.equal(voice.peer,peer);assert.deepEqual(voice.frames,['last-camera-frame']);
  assert.equal(events[0].type,'session.update');assert.equal(events[0].session.audio.input.transcription.language,'en');
  assert.equal(voice.fixedSpeechDelivery,'Read English');
 }finally{globalThis.fetch=oldFetch;}
});

test('display dates and built-in labels switch while stored user content remains unchanged',()=>{
 try {
  setLanguage('en');assert.equal(labels.bloodPressure,'Blood pressure');assert.equal(schedules[0].name,'After-breakfast medicine');
  assert.match(thaiDate(new Date('2026-11-04T00:00:00Z')),/November 2026/);
  assert.equal(dateKey(new Date('2026-11-04T00:00:00Z')),'2026-11-04');
  assert.equal(describe({kind:'symptom',payload:{text:'บันทึกของผู้ใช้'}}),'บันทึกของผู้ใช้');
  setLanguage('th');assert.equal(labels.bloodPressure,'ความดันโลหิต');assert.equal(schedules[0].name,'ยาหลังอาหารเช้า');
 }finally{setLanguage('th');}
});
