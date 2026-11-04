import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('voice form inspection and filling never expose or accept reviewer credentials',()=>{
  const named=(name,type,value)=>({name,type,value,closest:()=>({dataset:{workflowForm:'review-plan',id:'plan-one'}}),dispatchEvent(){}});
  const fields=[named('reviewer','text','Fixture reviewer'),named('reviewerToken','password','never-send-this'),named('documentImage','file','private-image')];
  const root={querySelectorAll:()=>fields};
  const context=vm.createContext({tr:s=>s,Event,modal:{querySelector:()=>root,querySelectorAll:()=>fields}});
  vm.runInContext(source.slice(source.indexOf('function careFormFields(){'),source.indexOf('async function openCareWorkflow(')),context);
  const snapshot=context.careFormFields();
  assert.equal(snapshot.length,1);
  assert.equal(snapshot[0].field,'reviewer');
  assert.doesNotMatch(JSON.stringify(snapshot),/never-send-this|private-image/);
  assert.throws(()=>context.fillCareField('reviewerToken','invented'));
  context.fillCareField('reviewer','Changed reviewer');
  assert.equal(fields[0].value,'Changed reviewer');
});
