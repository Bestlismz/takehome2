import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceActivity,activityMarkup} from '../tool-activity.js';

test('task history shows actual completion and keeps only six recent calls',()=>{
  let items=[];
  for(let i=0;i<8;i++) items=reduceActivity(items,{type:'start',id:`call-${i}`,label:`งาน ${i}`});
  assert.deepEqual(items.map(item=>item.id),['call-2','call-3','call-4','call-5','call-6','call-7']);
  items=reduceActivity(items,{type:'finish',id:'call-7',status:'success',message:'เก็บในฐานข้อมูลแล้ว'});
  assert.equal(items.at(-1).status,'success');
  assert.match(activityMarkup(items),/เก็บในฐานข้อมูลแล้ว/);
  assert.equal(reduceActivity(items,{type:'start',id:'call-7',label:'retry'}),items);
  assert.deepEqual(reduceActivity(items,{type:'clear'}),[]);
});

test('confirmation reveals readable proposal but ordinary tasks hide private detail',()=>{
  let items=reduceActivity([],{type:'start',id:'edit',label:'แก้ไขนัด',detail:'นัดตรวจวันที่ 10 พฤศจิกายน เวลา 09:00'});
  assert.doesNotMatch(activityMarkup(items),/นัดตรวจวันที่/);
  items=reduceActivity(items,{type:'finish',id:'edit',status:'confirmation',message:'ขอให้พูดยืนยันก่อนบันทึกค่ะ'});
  assert.match(activityMarkup(items),/นัดตรวจวันที่ 10 พฤศจิกายน เวลา 09:00/);
  assert.match(activityMarkup(items,{collapsed:true}),/aria-expanded="false"/);
  assert.match(activityMarkup(items,{collapsed:true}),/tool-activity-body[^>]+ hidden/);
});

test('source output escapes text and includes only credential-free HTTPS citations',()=>{
  let items=reduceActivity([],{type:'start',id:'search',label:'<script>ค้นเว็บ</script>'});
  items=reduceActivity(items,{type:'finish',id:'search',status:'success',message:'<img src=x onerror=alert(1)>',sources:[{url:'javascript:alert(1)',title:'bad'},{url:'http://example.com',title:'http'},{url:'https://secret:token@example.com',title:'credential'},{url:'https://example.com/source',title:'"ข้อมูล" <source>'}]});
  assert.equal(items[0].sources.length,1);
  const markup=activityMarkup(items);
  assert.ok(markup.includes('href="https://example.com/source"'));
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(markup.includes('rel="noopener noreferrer"'));
  assert.doesNotMatch(markup,/<script>|<img|javascript:|secret:token/);
});

test('unknown completion does not invent a successful task',()=>{
  const items=reduceActivity([],{type:'finish',id:'missing',status:'success',message:'done'});
  assert.deepEqual(items,[]);
  assert.equal(activityMarkup(items),'');
});

test('actual saving progress is shown and late events cannot reopen terminal tasks',()=>{
  let items=reduceActivity([],{type:'start',id:'save',label:'เพิ่มนัด',target:'ตรวจตา · 2026-11-10 · 09:00',location:'ปฏิทินดูแลกัน'});
  items=reduceActivity(items,{type:'progress',id:'save',phase:'saving'});
  assert.deepEqual(items[0].steps,['executing','saving']);
  assert.match(activityMarkup(items),/กำลังเก็บในฐานข้อมูล/);
  assert.match(activityMarkup(items),/ตรวจตา/);
  assert.match(activityMarkup(items),/ปฏิทินดูแลกัน/);
  items=reduceActivity(items,{type:'finish',id:'save',status:'error',message:'offline'});
  const before=items[0];
  items=reduceActivity(items,{type:'progress',id:'save',phase:'executing'});
  items=reduceActivity(items,{type:'finish',id:'save',status:'success'});
  assert.equal(items[0],before);
  assert.equal(items[0].status,'error');
});

test('waiting confirmation can complete while unknown progress phases do nothing',()=>{
  let items=reduceActivity([],{type:'start',id:'proposal',label:'แก้นัด'});
  assert.equal(reduceActivity(items,{type:'progress',id:'proposal',phase:'imaginary-click'}),items);
  items=reduceActivity(items,{type:'finish',id:'proposal',status:'confirmation'});
  items=reduceActivity(items,{type:'finish',id:'proposal',status:'success',message:'ยืนยันและบันทึกแล้ว'});
  assert.deepEqual(items[0].steps,['executing','confirmation','success']);
});
