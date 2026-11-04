import test from 'node:test';
import assert from 'node:assert/strict';
import {setLanguage} from '../i18n.js';
import {calendarPageMarkup,calendarFormMarkup} from '../care-calendar.js';
import {familyDashboardMarkup} from '../family-experience.js';
import {renderPhysicianSummary,renderTrackingOverview} from '../health-tracking.js';
import {summaryPageMarkup,summaryTeaserMarkup,mealJournalMarkup} from '../luklaan-workflows.js';
import {conversationStageMarkup} from '../conversation-stage.js';
import {createPhoneExperience} from '../phone-calls.js';

const state=()=>({events:[],calendarPlans:[],profile:{},callPlan:{}});
test('English auxiliary screens translate owned copy without retaining Thai labels',()=>{
 setLanguage('en');
 try {
  const empty=state();
  const screens=[calendarPageMarkup(empty,'2026-11-04'),calendarFormMarkup('2026-11-04'),familyDashboardMarkup(empty),renderPhysicianSummary([]),renderTrackingOverview([]),summaryPageMarkup(empty),summaryTeaserMarkup(),mealJournalMarkup(empty),conversationStageMarkup('')];
  for(const markup of screens)assert.doesNotMatch(markup,/[\u0e00-\u0e7f]/);
  assert.match(screens[0],/Care calendar/);
  assert.match(screens[1],/Save appointment/);
 }finally{setLanguage('th');}
});

test('language switching preserves personal record text and appointment values',()=>{
 const saved=state();
 saved.calendarPlans=[{id:'original-id',date:'2026-11-04',at:'09:00',title:'นัดของผู้ใช้',note:'ข้อมูลผู้ใช้',planType:'appointment',status:'active'}];
 const before=JSON.stringify(saved);
 setLanguage('en');
 try{
  const markup=calendarPageMarkup(saved,'2026-11-04');
  assert.match(markup,/นัดของผู้ใช้/);
  assert.match(markup,/ข้อมูลผู้ใช้/);
  assert.match(markup,/data-id="original-id"/);
  assert.equal(JSON.stringify(saved),before);
 }finally{setLanguage('th');}
 assert.match(calendarPageMarkup(saved,'2026-11-04'),/ปฏิทินดูแลกัน/);
});

test('English demo phone prompts and spoken answers complete the same call state machine',()=>{
 setLanguage('en');
 const saved=state(),spoken=[];
 const modal={open:false,dataset:{},className:'',innerHTML:''};
 const voice={active:true,listen(){},stop(){},speak(value){spoken.push(value);}};
 const experience=createPhoneExperience({state:saved,modal,showDialog(){modal.open=true;},closeDialog(){modal.open=false;},voice,persist(){},render(){},toast(){},ringTimeoutMs:60000});
 try{
  experience.action('phone-incoming');
  assert.match(modal.innerHTML,/Incoming call demo/);
  experience.hear('answer the call');
  assert.match(spoken.at(-1),/Hello/);
  experience.hear('yes, I can talk');
  assert.match(spoken.at(-1),/morning medicine/);
  experience.hear('I have already taken it');
  assert.match(spoken.at(-1),/how you feel today/);
  experience.hear('I feel well today');
  assert.match(spoken.at(-1),/confirm/);
  experience.hear('confirm');
  assert.equal(saved.events.length,1);
  assert.equal(saved.events[0].payload.confirmed,true);
  assert.equal(saved.events[0].isDemo,true);
 }finally{experience.stop();setLanguage('th');}
});

test('active camera language refresh changes copy without replacing its video or state',async()=>{
 const {ConversationStage}=await import('../conversation-stage.js');
 const element=()=>({textContent:'',attributes:{},setAttribute(name,value){this.attributes[name]=value;}});
 const video={srcObject:{stream:'same-stream'}};
 const nodes={'#camera-video':video,'#session-camera':element(),'#camera-empty':element(),'#camera-live-badge':element(),'[data-action="camera-switch"]':element(),'#camera-freeze':element(),'.thought-label':element(),'#captured-photo':element()};
 const root={dataset:{camera:'live'},attributes:{},setAttribute(name,value){this.attributes[name]=value;},querySelector:selector=>nodes[selector] || null};
 const stage=new ConversationStage(root),before=video.srcObject;
 setLanguage('en');
 try{
  stage.refreshLanguage();
  assert.equal(stage.video,video);
  assert.equal(video.srcObject,before);
  assert.equal(root.dataset.camera,'live');
  assert.match(root.attributes['aria-label'],/Conversation area/);
  assert.equal(nodes['[data-action="camera-switch"]'].attributes['aria-label'],'Switch front and rear cameras');
 }finally{setLanguage('th');}
});

test('deterministic English alerts preserve measured values and emergency number',async()=>{
 const {alertMarkup}=await import('../family-experience.js');
 const alert={id:'reading-alert',rule:'glucose-low',title:'น้ำตาลที่วัด 60 mg/dL',action:'ตรวจสอบอาการและทำตามแผนรับมือน้ำตาลต่ำที่แพทย์ให้ ติดต่อทีมรักษา หากหมดสติ ชัก หรือกลืนไม่ได้ ให้โทร 1669 อย่าป้อนอาหารหรือน้ำ',occurredAt:'2026-11-04T00:00:00Z',evidenceId:'original-reading',severity:'attention'};
 const original=JSON.stringify(alert);
 setLanguage('en');
 try{
  const markup=alertMarkup([alert]);
  assert.match(markup,/Measured glucose 60 mg\/dL/);
  assert.match(markup,/call 1669/);
  assert.doesNotMatch(markup,/[\u0e00-\u0e7f]/);
  assert.equal(JSON.stringify(alert),original);
 }finally{setLanguage('th');}
});
