import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function app(){
  let device;const requests=[];
  const panel={hidden:true},stage={video:{},root:{dataset:{},querySelector:()=>panel}};
  const context=vm.createContext({
    voice:{active:true},ui:{stage,conversationId:1,userTurn:3,cameraPhase:'live'},bpDevice:undefined,
    tr:s=>s,Date,voiceDialog(){},updateBloodPressureView(){},describe:()=> 'cuff reading',
    camera:{capture:()=> 'fixture-frame'},requestJSON:()=>new Promise((resolve,reject)=>{resolve.reject=reject;requests.push(resolve);}),
    startCamera(){context.ui.cameraPhase='live';},
    BloodPressureDevice:class {constructor({onUpdate}){this.emit=onUpdate;device=this;}connect(){}disconnect(){this.emit({phase:'idle',reading:null});}},
  });
  vm.runInContext(source.slice(source.indexOf('function openBloodPressure(){'),source.indexOf('async function openCareWorkflow(')),context);
  return {context,requests,get device(){return device;}};
}
const reading=systolic=>({systolic,diastolic:80,unit:'mmHg',provenance:'bluetooth-cuff',occurredAt:'2026-11-04T09:00:00Z',timeBasis:'received'});
test('invalid or disconnected cuff results remove the previously pending pressure',async()=>{
  const harness=app(),context=harness.context;
  await context.connectBloodPressure();
  harness.device.emit({phase:'reading',reading:reading(120)});
  assert.equal(context.ui.pendingHealth.payload.systolic,120);
  harness.device.emit({phase:'waiting',reading:null,error:'invalid-reading'});
  assert.equal(context.ui.pendingHealth,null);
  assert.equal(context.ui.bpReading,null);
  harness.device.emit({phase:'reading',reading:reading(130)});
  context.closeBloodPressure();
  assert.equal(context.ui.pendingHealth,null);
  assert.equal(context.ui.bpVisible,false);
});
test('newer cuff-image captures win and closing discards an in-flight extraction',async()=>{
  const {context,requests}=app();
  context.openBloodPressure();
  const a=context.readBloodPressureDisplay(),b=context.readBloodPressureDisplay();
  requests[1]({reading:{...reading(150),provenance:'camera-cuff-display'}});await b;
  requests[0]({reading:{...reading(120),provenance:'camera-cuff-display'}});await a;
  assert.equal(context.ui.pendingHealth.payload.systolic,150);
  const c=context.readBloodPressureDisplay();context.closeBloodPressure();
  requests[2]({reading:{...reading(160),provenance:'camera-cuff-display'}});await c;
  assert.equal(context.ui.pendingHealth,null);
});

test('an older failed image request cannot replace a newer accepted reading',async()=>{
  const {context,requests}=app();context.openBloodPressure();
  const older=context.readBloodPressureDisplay(),newer=context.readBloodPressureDisplay();
  requests[1]({reading:{...reading(145),provenance:'camera-cuff-display'}});await newer;
  requests[0].reject(new Error('older request failed'));await older;
  assert.equal(context.ui.pendingHealth.payload.systolic,145);
  const current=context.readBloodPressureDisplay();requests[2].reject(new Error('current request failed'));
  await assert.rejects(current,/current request failed/);
  assert.equal(context.ui.pendingHealth,null);
});
