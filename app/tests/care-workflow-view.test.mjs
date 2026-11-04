import test from 'node:test';
import assert from 'node:assert/strict';
import {careWorkflowMarkup,draftFromValues,mountCareWorkflow,documentImageData} from '../care-workflow-view.js';

function root(){
  const handlers=new Map();
  return {innerHTML:'',handlers,addEventListener(name,handler){handlers.set(name,handler);},removeEventListener(name,handler){if(handlers.get(name)===handler)handlers.delete(name);},querySelector(){return null;},contains(){return true;}};
}
const empty={revision:0,plans:[],handovers:[],reviews:[],grants:[],audit:[],reviewerConfigured:false,summaryOptions:[]};

test('caregiver document drafts retain explicit uncertainty rather than silently activating a plan',()=>{
  const data=new FormData();
  for(const [key,value] of Object.entries({title:'เอกสารยา',sourceText:'ต้นฉบับ', 'medName-0':'Medicine A','medDose-0':'500 mg','medInstructions-0':'หลังอาหาร','medUncertain-0':'on','medName-1':'Medicine B','medDose-1':'1 เม็ด','medInstructions-1':'ก่อนนอน',uncertainties:'  เวลาอ่านไม่ชัด\n\nขนาดต้องตรวจ '}))data.append(key,value);
  assert.deepEqual(draftFromValues(data),{title:'เอกสารยา',sourceText:'ต้นฉบับ',medications:[{name:'Medicine A',dose:'500 mg',instructions:'หลังอาหาร',uncertain:true},{name:'Medicine B',dose:'1 เม็ด',instructions:'ก่อนนอน',uncertain:false}],uncertainties:['เวลาอ่านไม่ชัด','ขนาดต้องตรวจ']});
  const markup=careWorkflowMarkup({...empty,plans:[{id:'p',version:1,title:'ร่าง',status:'pending_review',medications:[],uncertainties:[]}]});
  assert.match(markup,/ยังไม่ตั้งค่าผู้ตรวจสอบ/);
  assert.doesNotMatch(markup,/name="reviewerToken"/);
});

test('stored source text, reviewer names, handover notes and share links are escaped',()=>{
  const attack='<img src=x onerror=alert(1)>';
  const state={...empty,plans:[{id:'p',version:1,title:attack,status:'draft',sourceText:attack,medications:[{name:attack,dose:'1',instructions:attack,uncertain:true}],uncertainties:[attack]}],handovers:[{id:'h',text:attack,assignee:attack,status:'open'}],reviews:[{summaryId:'s',reviewer:attack,note:attack,decision:'reviewed'}],grants:[{id:'g',label:attack,revokedAt:null}]};
  for(const tab of ['plans','handover','review','access']){
    const markup=careWorkflowMarkup(state,{tab,shareUrl:'https://example.test/#family-access=" onfocus="bad'});
    assert.doesNotMatch(markup,/<img| onfocus="bad/);
    assert.match(markup,/&lt;img/);
  }
});

test('workflow controller sends revisions and uses server state after a concurrent change',async()=>{
  const host=root(),calls=[];
  let serverRevision=0;
  const request=async body=>{
    calls.push(body);
    if(body.operation==='load')return {...empty,revision:serverRevision};
    if(body.text==='conflict'){serverRevision=2;throw new Error('Data changed in another window');}
    return {...empty,revision:++serverRevision,handovers:[{id:'h1',text:body.text,assignee:body.assignee,status:'open'}]};
  };
  const errors=[];
  const controller=mountCareWorkflow(host,{request,onError:message=>errors.push(message),initialTab:'handover'});
  await controller.ready;
  await controller.perform('handover.add',{text:'เตรียมพบหมอ',assignee:'พิมพ์'});
  assert.deepEqual(calls[1],{operation:'handover.add',text:'เตรียมพบหมอ',assignee:'พิมพ์',expectedRevision:0});
  assert.match(host.innerHTML,/เตรียมพบหมอ/);
  await assert.rejects(controller.perform('handover.add',{text:'conflict',assignee:'พิมพ์'}),/Data changed/);
  assert.deepEqual(errors,['Data changed in another window']);
  await controller.perform('handover.add',{text:'นัดครั้งถัดไป',assignee:'พิมพ์'});
  assert.equal(calls.at(-1).expectedRevision,2);
  controller.destroy();
  assert.equal(host.handlers.size,0);
  await assert.rejects(controller.perform('handover.complete',{id:'h1'}),/ปิดหน้านี้แล้ว/);
});

test('family access token is shown once in the local link and disappears when access is revoked',async()=>{
  const host=root();let revision=0;
  const controller=mountCareWorkflow(host,{initialTab:'access',shareBase:'http://localhost:5173/',request:async body=>{
    if(body.operation==='load')return {...empty};
    return {...empty,revision:++revision,grants:[{id:'g1',label:'ครอบครัว',scope:'family_summary',revokedAt:body.operation==='access.revoke'?'2026-11-04':null}],...(body.operation==='access.create'?{accessToken:'one-time-token'}:{})};
  }});
  await controller.ready;
  await controller.perform('access.create',{label:'ครอบครัว',scope:'family_summary'});
  assert.match(host.innerHTML,/http:\/\/localhost:5173\/#family-access=one-time-token/);
  const click=host.handlers.get('click');
  await click({target:{closest:()=>({dataset:{workflowAction:'revoke-access',id:'g1'}})},preventDefault(){},stopPropagation(){}});
  assert.doesNotMatch(host.innerHTML,/one-time-token/);
  assert.match(host.innerHTML,/เพิกถอนแล้ว/);
  controller.destroy();
});

test('document upload rejects unsupported types and oversized files before reading or sending them',async()=>{
  await assert.rejects(documentImageData({type:'image/svg+xml',size:100}),/JPEG/);
  await assert.rejects(documentImageData({type:'image/jpeg',size:15*1024*1024+1}),/15 MB/);
});
