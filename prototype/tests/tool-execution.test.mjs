import test from 'node:test';
import assert from 'node:assert/strict';
import {durableToolResult} from '../tool-execution.js';
test('a successful mutation is not returned until PostgreSQL acknowledges it',async()=>{
 let release,done=false;const pending=new Promise(resolve=>{release=resolve;});
 const workspace={revision:7,flush:()=>pending};
 const task=durableToolResult({ok:true,message:'saved'},{mutation:true,workspace}).then(result=>{done=true;return result;});
 await Promise.resolve();assert.equal(done,false);
 workspace.revision=8;release();assert.deepEqual((await task).storage,{saved:true,revision:8});
});
test('failed persistence cannot become a successful tool response',async()=>{
 await assert.rejects(()=>durableToolResult({saved:true},{workspace:{flush:async()=>{throw new Error('offline');}}}),/offline/);
});
test('staged proposals, read-only tools and failures do not write workspace',async()=>{
 let writes=0;const workspace={flush:async()=>writes++};
 for(const result of [{requiresConfirmation:true},{ok:false},{ok:true}])assert.equal(await durableToolResult(result,{workspace,mutation:result.requiresConfirmation}),result);
 assert.equal(writes,0);
});
test('saving event fires only for a real persistence attempt and failure never returns saved',async()=>{
 const phases=[];
 const workspace={flush:async()=>{phases.push('flush');throw new Error('offline');}};
 const options={workspace,onSaving:()=>phases.push('saving')};
 await durableToolResult({requiresConfirmation:true},{...options,mutation:true});
 assert.deepEqual(phases,[]);
 await assert.rejects(()=>durableToolResult({ok:true},{...options,mutation:true}),/offline/);
 assert.deepEqual(phases,['saving','flush']);
});
