import test from 'node:test';
import assert from 'node:assert/strict';
import {actionPresentation,activityLocation,activityResultMessage} from '../action-presentation.js';

test('task target resolves the matched appointment rather than exposing its whole payload',()=>{
 const result=actionPresentation({tool:'app.action',args:{action:'calendar.cancel',id:'plan-1'}},{route:'calendar',plans:[{id:'plan-1',title:'ตรวจตา',date:'2026-11-10',at:'09:00',privateField:'not displayed'}]});
 assert.deepEqual(result,{target:'ตรวจตา · 2026-11-10 · 09:00',location:'ปฏิทินดูแลกัน'});
});
test('tool targets and locations are bounded and unknown dialogs are not leaked',()=>{
 assert.equal(actionPresentation({tool:'web.search',args:{query:'a'.repeat(500)}}).target.length,180);
 assert.equal(activityLocation({route:'today',dialog:'unrecognized-private-name'}),'วันนี้');
 assert.equal(activityResultMessage({total:12,records:[]}), 'พบ 12 บันทึก');
 assert.match(activityResultMessage({storage:{saved:true,revision:8}}),/ฉบับ 8/);
});
