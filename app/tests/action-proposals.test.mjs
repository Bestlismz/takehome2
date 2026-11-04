import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proposeAction,authorizeProposal,observationTime} from '../action-proposals.js';
const catalog=JSON.parse(readFileSync(new URL('../app-command-catalog.json',import.meta.url)));
const context={currentTurn:3,transcriptTurn:3,session:10,transcript:'ยืนยันค่ะ',now:10000};
const call={action:'calendar.add',date:'2026-11-05',at:'14:00',title:'นัดส่วนตัว',confirmed:false};
test('a spoken confirmation commits only the same proposal in a subsequent turn',()=>{
 const pending=proposeAction(call,context,catalog);
 assert.throws(()=>authorizeProposal({...call,confirmed:true},pending,context,catalog));
 const next={...context,currentTurn:4,transcriptTurn:4};
 assert.equal(authorizeProposal({...call,confirmed:true},pending,next,catalog).at,'14:00');
 for(const changed of [{at:'16:00'},{title:'นัดอื่น'},{date:'2026-11-06'}])assert.throws(()=>authorizeProposal({...call,...changed,confirmed:true},pending,next,catalog));
});
test('missing, old, cross-session, stale-transcript and negative confirmations cannot mutate',()=>{
 const pending=proposeAction(call,context,catalog),confirmed={...call,confirmed:true};
 const next={...context,currentTurn:4,transcriptTurn:4};
 assert.throws(()=>authorizeProposal(confirmed,null,next,catalog));
 for(const changed of [{session:11},{now:311000},{transcriptTurn:3},{transcript:'ไม่ยืนยัน'}])assert.throws(()=>authorizeProposal(confirmed,pending,{...next,...changed},catalog));
});
test('record deletion is staged against the specific selected id',()=>{
 const deletion={action:'record.delete',id:'confirmed-record',confirmed:false};
 const pending=proposeAction(deletion,context,catalog),next={...context,currentTurn:4,transcriptTurn:4};
 assert.equal(authorizeProposal({...deletion,confirmed:true},pending,next,catalog).id,'confirmed-record');
 assert.throws(()=>authorizeProposal({...deletion,id:'another-record',confirmed:true},pending,next,catalog));
});
test('observation time preserves Bangkok instant and rejects ambiguous or future dates',()=>{
 const now=Date.parse('2026-11-04T12:00:00Z');
 assert.equal(observationTime('2026-11-03T08:30:00+07:00',now),'2026-11-03T01:30:00.000Z');
 assert.equal(observationTime(null,now),'2026-11-04T12:00:00.000Z');
 for(const bad of ['2026-11-03','2026-11-03T08:30:00','2026-02-30T08:30:00+07:00','2026-11-05T08:30:00+07:00','1999-12-31T08:30:00Z'])assert.throws(()=>observationTime(bad,now));
});

test('affirming cancellation is different from rejecting the proposal',async()=>{
 const {isExplicitAppConfirmation,rejectsProposal}=await import('../app-commands.js');
 const call={action:'calendar.cancel',id:'appointment',confirmed:false};
 const pending=proposeAction(call,context,catalog);
 const next={...context,currentTurn:4,transcriptTurn:4,transcript:'ยืนยันยกเลิกนัดค่ะ',explicitConfirmationFn:text=>isExplicitAppConfirmation(text,{action:'calendar.cancel'})};
 assert.equal(rejectsProposal(next.transcript,'calendar.cancel'),false);
 assert.equal(authorizeProposal({...call,confirmed:true},pending,next,catalog).id,'appointment');
 for(const text of ['ยกเลิกก่อน','ไม่ยืนยันยกเลิกนัด','ยกเลิกการยืนยัน'])assert.equal(rejectsProposal(text,'calendar.cancel'),true);
 assert.equal(isExplicitAppConfirmation('ยืนยันยกเลิกนัดค่ะ',{action:'record.update'}),false);
});

test('negated and mixed utterances never authorize destructive changes',async()=>{
 const {isExplicitAppConfirmation}=await import('../app-commands.js');
 for(const text of ['อย่าเพิ่งลบนะ ยังไม่ได้ยืนยัน','ยังไม่ได้ยืนยัน','ไม่ได้ยืนยันค่ะ','ไม่ต้องลบ ยืนยันอะไร','ยืนยันแต่ขอแก้ก่อน','อย่ายกเลิกนัด']){
  assert.equal(isExplicitAppConfirmation(text,{action:'record.delete'}),false,text);
  const pending=proposeAction({action:'record.delete',id:'record',confirmed:false},context,catalog);
  assert.throws(()=>authorizeProposal({action:'record.delete',id:'record',confirmed:true},pending,{...context,currentTurn:4,transcriptTurn:4,transcript:text},catalog));
 }
});


test('identical tool retries retain the original confirmation turn and expiry',()=>{
 const pending=proposeAction(call,context,catalog);
 const next={...context,currentTurn:4,transcriptTurn:4,now:20000};
 assert.equal(proposeAction({...call,confirmed:true},next,catalog,pending),pending);
 assert.equal(authorizeProposal({...call,confirmed:true},pending,next,catalog).title,'นัดส่วนตัว');
 const changed=proposeAction({...call,at:'15:00'},next,catalog,pending);
 assert.equal(changed.turn,4);
 assert.equal(changed.call.at,'15:00');
 assert.notEqual(proposeAction(call,{...next,session:11},catalog,pending),pending);
 assert.notEqual(proposeAction(call,{...next,now:311000},catalog,pending),pending);
});
