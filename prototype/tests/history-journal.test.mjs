import test from 'node:test';
import assert from 'node:assert/strict';
import {journalEntries,journalDays} from '../history-journal.js';
const entries=[
 {id:'real-bp',kind:'bloodPressure',isDemo:false,occurredAt:'2026-11-03T01:00:00Z',payload:{systolic:129,diastolic:80}},
 {id:'demo-bp',kind:'bloodPressure',isDemo:true,occurredAt:'2026-11-04T01:00:00Z',payload:{systolic:128,diastolic:78}},
 {id:'meal',kind:'meal',isDemo:false,occurredAt:'2026-11-03T18:00:00Z',payload:{description:'ข้าวต้มปลา',portion:'1 ชาม'}},
];
test('journal starts with personal records and makes sample data opt-in',()=>{
 assert.deepEqual(journalEntries(entries).map(e=>e.id),['meal','real-bp']);
 assert.deepEqual(journalEntries(entries,{includeDemo:true}).map(e=>e.id),['demo-bp','meal','real-bp']);
 assert.equal(entries.length,3);
});
test('category and Thai search combine without hiding matching personal readings',()=>{
 assert.deepEqual(journalEntries(entries,{kind:'bloodPressure',query:'129'}).map(e=>e.id),['real-bp']);
 assert.deepEqual(journalEntries(entries,{query:'ข้าวต้ม'}).map(e=>e.id),['meal']);
 assert.deepEqual(journalEntries(entries,{kind:'bloodPressure',query:'ข้าวต้ม'}),[]);
});
test('journal groups by Bangkok day even across a UTC day boundary',()=>{
 assert.deepEqual(journalDays(journalEntries(entries)).map(g=>({date:g.date,ids:g.events.map(e=>e.id)})),[{date:'2026-11-04',ids:['meal']},{date:'2026-11-03',ids:['real-bp']}]);
});
