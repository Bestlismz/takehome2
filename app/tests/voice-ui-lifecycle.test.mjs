import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const callbackStart=source.indexOf('const voice = new RealtimeVoiceSession(')+'const voice = new RealtimeVoiceSession('.length;
const callback=source.slice(callbackStart,source.indexOf('}, () => {}',callbackStart)+1);
const closeStart=source.indexOf('function endConversation()');
const closeBody=source.slice(closeStart,source.indexOf('function minimizeConversation()',closeStart));

test('closing a dialog with an icon-only dock mic releases the call and closes both dialogs',()=>{
  const attributes={};let released=false;
  const dockMic={setAttribute:(name,value)=>attributes[name]=value,querySelector:()=>null,classList:{toggle(){}}};
  const dialog=()=>({open:true,innerHTML:'form',close(){this.open=false;}});
  const context=vm.createContext({
    tr:value=>value,bpDevice:undefined,careWorkflowController:undefined,ui:{voicePresentation:'docked',dialog:'phone-settings'},clearTimeout,
    document:{querySelector:selector=>selector==='[data-action="voice-toggle"]'?dockMic:null,body:{classList:{remove(){}}}},
    updateVoiceDock(){},setMascotState(){},phoneExperience:{stop(){}},camera:{stop(){}},
    toolActivity:{attachTo(){}},conversationModal:dialog(),panelModal:dialog(),modal:null,
    voice:{active:false,inputMuted:false,stop(){released=true;context.onState('paused','พักไมค์');}},
  });
  context.onState=vm.runInContext('('+callback+')',context);
  vm.runInContext(closeBody,context);
  context.endConversation();
  assert.equal(released,true);
  assert.equal(context.conversationModal.open,false);
  assert.equal(context.panelModal.open,false);
  assert.equal(context.ui.dialog,null);
  assert.equal(attributes['aria-pressed'],'false');
  assert.equal(attributes['aria-label'],'เปิดไมโครโฟน');
});
