import test from 'node:test';
import assert from 'node:assert/strict';
import {summaryArchiveMarkup} from '../family-experience.js';
test('stored reports show their review annotation and the immutable medication plan source',()=>{
  const summary={id:'report-one',kind:'physician',createdAt:'2026-11-04T09:00:00Z',body:{report:{summary:'Fixture report',sections:[]},evidence:[],profile:{medicationPlan:{title:'Original plan',version:2,medications:[{name:'Fictional medicine',dose:'test dose',instructions:'Not for use'}]}}}};
  const markup=summaryArchiveMarkup([summary],[{summaryId:'report-one',decision:'reviewed',reviewer:'Fixture reviewer'}]);
  assert.match(markup,/Fixture reviewer/);assert.match(markup,/Original plan/);assert.match(markup,/ฉบับ 2/);
  assert.doesNotMatch(markup,/ยังไม่มีบันทึกการทบทวน/);
  assert.match(summaryArchiveMarkup([summary],[]),/ยังไม่มีบันทึกการทบทวน/);
});
