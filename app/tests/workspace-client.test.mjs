import test from 'node:test';
import assert from 'node:assert/strict';
import {WorkspaceClient} from '../workspace-client.js';
const base=()=>({events:[],sharing:{},activities:{}});
globalThis.localStorage={setItem(){}};
const result=(revision,events=[])=>({revision,state:{events,sharing:{},activities:{}},alerts:[],brief:{confirmedCount:events.length}});

test('database reload restores saved events instead of stale browser cache',async()=>{
 const savedFetch=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>result(3,[{id:'saved-record'}])});
 try{const state=base();const client=new WorkspaceClient(state);await client.start();assert.equal(state.events[0].id,'saved-record');assert.equal(state.storageRevision,3);assert.equal(client.ready,true);}finally{globalThis.fetch=savedFetch;}
});
test('failed persistence retains outbox and retry saves without losing the record',async()=>{
 const savedFetch=globalThis.fetch;let fail=true;const state={...base(),events:[{id:'new-record'}]};
 globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);if(body.operation==='load')return {ok:true,json:async()=>result(0)};return fail?{ok:false,status:503,json:async()=>({error:'offline'})}:{ok:true,json:async()=>result(1,body.state.events)};};
 try{const client=new WorkspaceClient(state);await client.start();assert.equal(state.storagePending,true);assert.equal(state.events.length,1);fail=false;await client.retry();assert.equal(state.storagePending,false);assert.equal(client.revision,1);}finally{globalThis.fetch=savedFetch;}
});
test('a stale tab cannot silently overwrite a newer database revision',async()=>{
 const savedFetch=globalThis.fetch;let saves=0;
 globalThis.fetch=async(_,options)=>{if(JSON.parse(options.body).operation==='save')saves++;return {ok:true,json:async()=>result(4)};};
 try{const state={...base(),storagePending:true,storageRevision:2,events:[{id:'unsent'}]};const client=new WorkspaceClient(state);await client.start();assert.equal(client.blocked,true);assert.equal(state.events[0].id,'unsent');assert.equal(saves,0);}finally{globalThis.fetch=savedFetch;}
});
