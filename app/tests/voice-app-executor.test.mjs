import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {tr,html,intlLocale,getLanguage} from '../i18n.js';
import {randomUUID} from 'node:crypto';
import {validateAppAction,requiresSpokenConfirmation,isExplicitAppConfirmation,authorizeAppAction} from '../app-commands.js';
import {authorizeProposal,proposeAction} from '../action-proposals.js';
import {normalizeCalendarPlan,validCalendarDate,calendarFormMarkup} from '../care-calendar.js';
import {storedSummaryList,storedSummaryRead} from '../voice-ui-context.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const catalog=JSON.parse(readFileSync(new URL('../app-command-catalog.json',import.meta.url),'utf8'));
const between=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function executor(){
  const host={isConnected:true,innerHTML:'',querySelector:()=>({setAttribute(){}})};
  const context=vm.createContext({
    tr,html,intlLocale,getLanguage,state:{calendarPlans:[]},ui:{conversationId:'test-session',userTurn:1,transcriptTurn:1,lastUserTranscript:'ช่วยเพิ่มนัด'},
    requestJSON:async()=>({reviews:[]}),workspace:{ready:true,blocked:false,summaries:async()=>[]},crypto:{randomUUID},
    loadAppCommandCatalog:async()=>catalog,validateAppAction,requiresSpokenConfirmation,isExplicitAppConfirmation,authorizeAppAction,authorizeProposal,proposeAction,normalizeCalendarPlan,storedSummaryList,storedSummaryRead,
    proposalReadback:call=>`${call.title || call.id} ${call.date || ''} ${call.at || ''}`,saveState(){},render(){},validCalendarDate,calendarFormMarkup,dateKey:()=>'2026-11-04',
    selectCalendarDate(date){context.ui.calendarDate=date;},currentVoiceContext:()=>({route:'calendar',interface:context.visibleInterface || {form:null}}),
    showDialog(kind,markup){context.ui.dialog=kind;host.innerHTML=markup;},closeDialog(){context.ui.dialog=null;},toolActivity:{items:[]},modalHeader:()=>'',document:{querySelector:()=>host},summaryArchiveMarkup:reports=>reports.map(report=>report.id).join(','),
  });
  vm.runInContext(between('async function executeAppAction(', 'async function openSummaryHistory(')+between('async function openSummaryHistory(', 'workspace=new WorkspaceClient')+between('function calendarPlanDialog(', "document.addEventListener('keydown'"),context);
  const act=call=>context.executeAppAction(call);
  const confirm=()=>{context.ui.userTurn++;context.ui.transcriptTurn=context.ui.userTurn;context.ui.lastUserTranscript='ยืนยันค่ะ';return act({action:'health.confirm',confirmed:true});};
  return {context,act,confirm,host};
}

test('actual voice executor stages calendar changes until next-turn confirmation and keeps stable ids',async()=>{
  const {context,act,confirm}=executor();
  const add={action:'calendar.add',date:'2026-11-05',at:'09:00',title:'นัดทดสอบลูกหลาน',confirmed:false};
  assert.equal((await act(add)).requiresConfirmation,true);
  assert.equal(context.state.calendarPlans.length,0);
  await confirm();
  const list=await act({action:'calendar.list',text:'นัดทดสอบลูกหลาน'});
  assert.equal(list.plans.length,1);
  const id=list.plans[0].id;
  assert.equal((await act({...add,action:'calendar.update',id,at:'10:00'})).requiresConfirmation,true);
  assert.equal(context.state.calendarPlans[0].at,'09:00');
  await confirm();
  assert.equal(context.state.calendarPlans[0].id,id);
  assert.equal(context.state.calendarPlans[0].at,'10:00');
  assert.equal((await act({action:'calendar.cancel',id,confirmed:false})).requiresConfirmation,true);
  assert.equal(context.state.calendarPlans[0].status,'active');
  await confirm();
  assert.equal(context.state.calendarPlans[0].status,'cancelled');
  assert.equal((await act({action:'calendar.list'})).plans.length,0);
  assert.equal((await act({action:'calendar.list',includeCancelled:true})).plans[0].id,id);
});

test('voice form preparation preserves unsaved fields and never writes an appointment',async()=>{
  const {context,act,host}=executor();
  context.visibleInterface={form:{kind:'calendar-plan-form',values:{planId:'',title:'ร่างที่ยังไม่บันทึก',date:'2026-11-05',at:'09:00',note:'คงรายละเอียดนี้'}}};
  await act({action:'calendar.form.open',at:'10:00'});
  assert.equal(context.state.calendarPlans.length,0);
  assert.match(host.innerHTML,/ร่างที่ยังไม่บันทึก/);
  assert.match(host.innerHTML,/value="10:00"/);
  assert.match(host.innerHTML,/คงรายละเอียดนี้/);
  await assert.rejects(act({action:'calendar.form.open',at:'25:00'}));
  context.toolActivity.items=[{label:'ค้นเว็บไซต์',status:'success',message:'พบแหล่งข้อมูล'}];
  assert.equal((await act({action:'app.inspect'})).operations[0].status,'success');
});

test('actual voice executor reads stored summary content and rejects failed loads or invented ids',async()=>{
  const {context,act,host}=executor();
  context.workspace.summaries=async()=>[{id:'real-summary',kind:'physician',createdAt:'2026-11-04T00:00:00Z',body:{report:{summary:'ข้อมูลที่เก็บจริง'},evidence:[]}}];
  assert.equal((await act({action:'summary.history'})).summaries[0].id,'real-summary');
  assert.equal((await act({action:'summary.read',id:'real-summary'})).summary.report.summary,'ข้อมูลที่เก็บจริง');
  await assert.rejects(act({action:'summary.read',id:'invented-id'}));
  context.workspace.summaries=async()=>{throw new Error('database offline');};
  await assert.rejects(act({action:'summary.history'}),/database offline/);
  assert.equal(host.textContent,'database offline');
});

test('source connection failures reach the voice executor as failures',async()=>{
  const {context,act}=executor();
  context.knowledgeSourcesDialog=async()=>({ok:false,error:'sources unavailable'});
  const result=await act({action:'knowledge.sources'});
  assert.equal(result.ok,false);
  assert.equal(result.error,'sources unavailable');
});


test('one spoken confirmation executes the pending appointment without another form or model flag',async()=>{
 for(const confirmed of [undefined,false,true]){
  const {context,act,host}=executor();
  await act({action:'calendar.add',date:'2026-11-05',at:'09:00',title:'นัดครั้งเดียว',confirmed:false});
  context.ui.userTurn=2;context.ui.transcriptTurn=2;context.ui.lastUserTranscript='ยืนยันค่ะ';
  const result=await act({action:'health.confirm',...(confirmed===undefined?{}:{confirmed})});
  assert.equal(result.requiresConfirmation,undefined);
  assert.equal(context.state.calendarPlans.length,1);
  assert.equal(context.state.calendarPlans[0].title,'นัดครั้งเดียว');
  assert.equal(context.ui.pendingAppAction,null);
  assert.equal(host.innerHTML,'');
  assert.match(result.instruction,/ไม่ถามยืนยันซ้ำ/);
 }
});

test('an unconfirmed retry does not consume the original proposal or require another round',async()=>{
 const {context,act}=executor();
 const add={action:'calendar.add',date:'2026-11-05',at:'09:00',title:'นัดเดิม',confirmed:false};
 await act(add);
 const original=context.ui.pendingAppAction;
 context.ui.userTurn=2;context.ui.transcriptTurn=1;context.ui.lastUserTranscript='ยืนยันค่ะ';
 assert.equal((await act(add)).requiresConfirmation,true);
 assert.equal(context.ui.pendingAppAction,original);
 assert.equal(context.state.calendarPlans.length,0);
 context.ui.transcriptTurn=2;
 assert.equal((await act(add)).requiresConfirmation,undefined);
 assert.equal(context.state.calendarPlans.length,1);
});

test('same-turn, negative and changed-payload confirmations still cannot write',async()=>{
 const {context,act}=executor();
 const add={action:'calendar.add',date:'2026-11-05',at:'09:00',title:'นัดเดิม',confirmed:false};
 await act(add);
 context.ui.lastUserTranscript='ยืนยันค่ะ';
 assert.equal((await act({action:'health.confirm'})).requiresConfirmation,true);
 context.ui.userTurn=2;context.ui.transcriptTurn=2;context.ui.lastUserTranscript='ไม่ยืนยันค่ะ';
 assert.equal((await act({action:'health.confirm',confirmed:true})).requiresConfirmation,true);
 context.ui.lastUserTranscript='ยืนยันค่ะ';
 assert.equal((await act({...add,at:'10:00',confirmed:true})).requiresConfirmation,true);
 assert.equal(context.state.calendarPlans.length,0);
 context.ui.userTurn=3;context.ui.transcriptTurn=3;
 await act({action:'health.confirm'});
 assert.equal(context.state.calendarPlans.length,1);
 assert.equal(context.state.calendarPlans[0].at,'10:00');
});

test('voice saves a visible medication draft once, but edits after readback require a new confirmation',async()=>{
  for(const editAfterReadback of [false,true]){
    const {context,act}=executor();
    let draft={title:'Fictional document',sourceText:'fixture',medications:[{name:'Fictional medicine',dose:'test one',instructions:'Not for use',uncertain:false}],uncertainties:[]};
    const written=[];
    context.modal={querySelector:()=>({})};
    context.FormData=function(form){return form;};
    context.draftFromValues=()=>JSON.parse(JSON.stringify(draft));
    context.performCareWorkflow=async(operation,payload)=>{written.push({operation,payload});return {ok:true,storage:{saved:true,revision:1}};};
    assert.equal((await act({action:'medication_plan.draft'})).requiresConfirmation,true);
    if(editAfterReadback)draft={...draft,title:'Changed document'};
    context.ui.userTurn=2;context.ui.transcriptTurn=2;context.ui.lastUserTranscript='ยืนยันค่ะ';
    const result=await act({action:'health.confirm'});
    if(editAfterReadback){
      assert.equal(result.requiresConfirmation,true);assert.equal(written.length,0);
      context.ui.userTurn=3;context.ui.transcriptTurn=3;
      await act({action:'health.confirm'});
    }
    assert.equal(written.length,1);
    assert.equal(written[0].operation,'plan.draft');
    assert.equal(written[0].payload.title,draft.title);
  }
});
