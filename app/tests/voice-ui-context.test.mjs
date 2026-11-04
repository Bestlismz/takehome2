import test from 'node:test';
import assert from 'node:assert/strict';
import {interfaceSnapshot,storedSummaryList,storedSummaryRead} from '../voice-ui-context.js';

test('inspection reports real editor and only approved visible form fields',()=>{
  const values={kind:'symptom',text:'อาการที่กำลังแก้',password:'hidden',image:'private-image'};
  const form={id:'record-form',elements:{namedItem:name=>name in values?{value:values[name]}:null}};
  const snapshot=interfaceSnapshot({route:'history',dialog:'record',editing:'selected-record',editingRecordId:'old-selection',voicePresentation:'docked',cameraPhase:'live'},{form});
  assert.equal(snapshot.selection.recordId,'selected-record');
  assert.equal(snapshot.camera,'live');
  assert.deepEqual(snapshot.form.values,{kind:'symptom',text:'อาการที่กำลังแก้'});
  assert.equal(interfaceSnapshot({}, {form:{id:'unknown'}}).form,null);
});

test('stored reports expose real ids and selected evidence without raw media',()=>{
  const reports=[{id:'stored-id',kind:'physician',createdAt:'2026-11-04T00:00:00Z',body:{report:{summary:'สรุปที่เก็บจริง'},evidence:[{id:'record',kind:'photo',occurredAt:'2026-11-03T00:00:00Z',payload:{text:'ฉลาก',image:'private-image',audio:'private-audio',frames:[]}}]}}];
  assert.equal(storedSummaryList(reports)[0].confirmedCount,1);
  const selected=storedSummaryRead(reports,'stored-id');
  assert.equal(selected.report.summary,'สรุปที่เก็บจริง');
  assert.deepEqual(selected.evidence[0].payload,{text:'ฉลาก'});
  assert.throws(()=>storedSummaryRead(reports,'invented-id'));
});
