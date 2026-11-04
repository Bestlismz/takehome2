import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceActivity,ToolActivity} from '../tool-activity.js';

test('internal task history keeps six calls and records actual completion',()=>{
  let items=[];
  for(let i=0;i<8;i++)items=reduceActivity(items,{type:'start',id:`call-${i}`,label:`งาน ${i}`});
  assert.deepEqual(items.map(item=>item.id),['call-2','call-3','call-4','call-5','call-6','call-7']);
  items=reduceActivity(items,{type:'finish',id:'call-7',status:'success',message:'เก็บในฐานข้อมูลแล้ว'});
  assert.equal(items.at(-1).message,'เก็บในฐานข้อมูลแล้ว');
  assert.equal(reduceActivity(items,{type:'start',id:'call-7'}),items);
  assert.deepEqual(reduceActivity(items,{type:'clear'}),[]);
});
test('internal sources allow only credential-free HTTPS citations',()=>{
  let items=reduceActivity([],{type:'start',id:'search'});
  items=reduceActivity(items,{type:'finish',id:'search',status:'success',sources:[{url:'javascript:alert(1)'},{url:'http://example.com'},{url:'https://secret:token@example.com'},{url:'https://example.com/source',title:'Source'}]});
  assert.deepEqual(items[0].sources,[{url:'https://example.com/source',title:'Source'}]);
});
test('late events cannot reopen terminal tasks or invent missing completion',()=>{
  assert.deepEqual(reduceActivity([],{type:'finish',id:'missing',status:'success'}),[]);
  let items=reduceActivity([],{type:'start',id:'save'});
  items=reduceActivity(items,{type:'progress',id:'save',phase:'saving'});
  assert.deepEqual(items[0].steps,['executing','saving']);
  items=reduceActivity(items,{type:'finish',id:'save',status:'error'});
  const before=items[0];
  items=reduceActivity(items,{type:'finish',id:'save',status:'success'});
  assert.equal(items[0],before);
});
test('task updates create only a screen-reader announcement and no visual popup',()=>{
  const previous=globalThis.document;
  const element=tag=>({tag,children:[],setAttribute(key,value){this[key]=value;},append(child){this.children.push(child);child.parentElement=this;},set innerHTML(value){throw new Error('Visual task markup must not be created');}});
  globalThis.document={body:element('body'),createElement:element};
  try{
    const tracker=new ToolActivity();
    tracker.start({id:'camera',label:'เปิดกล้อง'});tracker.finish('camera',{status:'success'});
    assert.equal(tracker.element.className,'tool-activity-announcement-only');
    assert.equal(tracker.element.children.length,1);
    assert.equal(tracker.announcement.role,'status');
    assert.match(tracker.announcement.textContent,/เปิดกล้อง/);
    assert.equal(tracker.items[0].status,'success');
    tracker.clear();assert.equal(tracker.element.hidden,true);
  }finally{globalThis.document=previous;}
});
