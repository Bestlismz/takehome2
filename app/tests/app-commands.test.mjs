import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateAppAction, authorizeAppAction, stageAppAction, requiresSpokenConfirmation } from '../app-commands.js';
import { RealtimeVoiceSession } from '../realtime-client.js';
const catalog = JSON.parse(readFileSync(new URL('../app-command-catalog.json', import.meta.url), 'utf8'));

const c = raw => validateAppAction(raw, catalog);
const authorize = (call, overrides = {}) => authorizeAppAction(call, { transcript: 'ยืนยันค่ะ', currentTurn: 4, transcriptTurn: 4, ...overrides }, catalog);

test('catalog covers every app control family and all five navigation destinations', () => {
  const families = new Set(catalog.actions.map(action => action.family));
  for (const family of ['navigation','history','accessibility','activity','call-plan','mock-call','sharing','care-plan','record','medication','report','meal','glucose','conversation','profile','about','image']) assert.ok(families.has(family), family);
  for (const route of ['today','history','medication','care','summary']) assert.deepEqual(c({ action:'navigate', route }), { action:'navigate', route });
  for (const action of ['conversation.minimize','conversation.restore','mock_call.accept','mock_call.decline']) assert.equal(c({action}).action, action);
  assert.ok(catalog.externalTools.includes('camera.capture'));
});

test('every spoken mutation accepts confirmation and read-only operations need no extra confirmation', () => {
  for (const action of catalog.actions) {
    if (action.confirmation === 'spoken') {
      assert.equal(action.mutation, true, action.action);
      assert.ok(action.allowed.includes('confirmed'), action.action);
    }
  }
  assert.deepEqual(authorize({action:'navigate',route:'summary'}, {transcript:'เปิดสรุป',currentTurn:null,transcriptTurn:null}), {action:'navigate',route:'summary'});
  assert.deepEqual(stageAppAction({action:'dialog.close'},catalog).call, {action:'dialog.close'});
});

test('invalid fields, targets, time values and arbitrary record patches are rejected', () => {
  const invalid = [
    {action:'unknown'}, {action:'navigate',route:'admin'}, {action:'navigate',route:'today',field:'logs'},
    {action:'navigate',route:'today',secret:null}, {action:'dose.take',id:'all'},
    {action:'call_plan.set',field:'medicationAt',value:'25:00'}, {action:'call_plan.set',field:'retry',value:'yes'},
    {action:'sharing.set',field:'retry',enabled:true}, {action:'record.update',id:'real-id',patch:{apiKey:'not-allowed'}},
    {action:'record.update',id:'real-id',patch:{systolic:80,diastolic:120}},
    {action:'care_plan.set',controlStatus:'controlled',clinicianReported:false},
  ];
  for (const call of invalid) assert.throws(() => c(call), JSON.stringify(call));
});

test('health edits, plans and undo require explicit confirmation from the current speech turn', () => {
  const call = {action:'record.update',id:'real-id',patch:{value:140,unit:'mg/dL',measured:true},confirmed:true};
  assert.equal(authorize(call).id,'real-id');
  assert.throws(() => authorize(call,{transcriptTurn:3}));
  assert.throws(() => authorize(call,{transcript:'ไม่ยืนยัน'}));
  assert.throws(() => authorize(call,{transcript:'ไม่ถูกต้อง'}));
  assert.throws(() => authorize({...call,confirmed:false}));
  for (const action of ['record.update','dose.take','dose.undo','call_plan.set','care_plan.set','sharing.set','health.confirm','activity.set']) assert.ok(requiresSpokenConfirmation(action,catalog));
  const staged = stageAppAction({action:'call_plan.set',field:'medicationAt',value:'09:30'},catalog);
  assert.equal(staged.call.confirmed,false);
  assert.equal(staged.requiresConfirmation,true);
});

test('strict provider nullable fields normalize to a narrow deterministic navigation command', () => {
  const raw = Object.fromEntries(Object.keys(catalog.parameters).map(key => [key,null]));
  Object.assign(raw,{action:'navigate',route:'history'});
  assert.deepEqual(c(raw),{action:'navigate',route:'history'});
});

test('Python tool registry and browser catalog expose the identical action and field enum', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const output = spawnSync('python3',['-c','import server,json; t=next(t for t in server.realtime_tools() if t["name"]=="app_action"); print(json.dumps(t["parameters"]))'],{cwd:root,encoding:'utf8'});
  assert.equal(output.status,0,output.stderr);
  const schema = JSON.parse(output.stdout);
  assert.deepEqual(schema.properties.action.enum,catalog.actions.map(a=>a.action));
  assert.deepEqual(Object.keys(schema.properties).sort(),['action',...Object.keys(catalog.parameters)].sort());
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(schema.required,Object.keys(schema.properties));
});

test('provider app_action maps to app.action and a mutation waits for its current transcript', async () => {
  const calls=[];
  const events=[];
  const voice = new RealtimeVoiceSession(()=>{},()=>{},()=>{},{onTool:call=>{calls.push(call);return {ok:true};}});
  voice.commandCatalog=catalog; voice.active=true; voice.ready=true;
  voice.channel={readyState:'open',send(value){events.push(JSON.parse(value));}};
  await voice.handleEvent({type:'response.function_call_arguments.done',name:'app_action',call_id:'nav1',arguments:'{"action":"navigate","route":"summary"}'},voice.generation);
  assert.equal(calls[0].tool,'app.action');
  assert.deepEqual(calls[0].args,{action:'navigate',route:'summary'});
  await voice.handleEvent({type:'input_audio_buffer.speech_started',item_id:'turn4'},voice.generation);
  const result=voice.handleEvent({type:'response.function_call_arguments.done',name:'app_action',call_id:'plan1',arguments:'{"action":"call_plan.set","field":"retry","value":false,"confirmed":false}'},voice.generation);
  await Promise.resolve(); assert.equal(calls.length,1);
  await voice.handleEvent({type:'conversation.item.input_audio_transcription.completed',item_id:'turn4',transcript:'ปิดการโทรซ้ำ'},voice.generation);
  await result;
  assert.equal(calls.length,2);
  assert.equal(calls[1].args.confirmed,false);
  assert.equal(calls[1].args.value,false);
});

test('muting retains the live peer and prevents a spoken reply from re-enabling input', () => {
  const voice = new RealtimeVoiceSession(()=>{},()=>{},()=>{});
  const track={enabled:true}; const peer={}; const channel={readyState:'open',send(){}};
  voice.active=true; voice.ready=true; voice.peer=peer; voice.channel=channel;
  voice.stream={getAudioTracks:()=>[track]};
  voice.mute();
  assert.equal(voice.inputMuted,true); assert.equal(track.enabled,false); assert.equal(voice.active,true);
  voice.speak('พักไมค์ไว้แล้วค่ะ');
  assert.equal(track.enabled,false); assert.equal(voice.peer,peer); assert.equal(voice.channel,channel);
  voice.unmute(); assert.equal(track.enabled,true); assert.equal(voice.inputMuted,false); assert.equal(voice.peer,peer);
});

test('journal search and sample visibility are voice view controls without a write confirmation',()=>{
 const call=c({action:'history.filter',filter:'bloodPressure',text:'129',enabled:false});
 assert.deepEqual(call,{action:'history.filter',filter:'bloodPressure',text:'129',enabled:false});
 assert.equal(requiresSpokenConfirmation(call,catalog),false);
 assert.deepEqual(authorize(call,{currentTurn:null,transcriptTurn:null,transcript:'ค้นความดัน 129'}),call);
});
