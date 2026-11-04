import test from 'node:test';
import assert from 'node:assert/strict';
import {familyAccessMarkup} from '../family-access-view.js';
test('family access presents a readable scoped summary and escapes medication text',()=>{
  const markup=familyAccessMarkup({activePlan:{title:'<script>bad</script>',version:2,medications:[{name:'Example','dose':'one',instructions:'<img src=x>'}]},summary:{confirmedCount:3,missing:['glucose']}});
  assert.match(markup,/&lt;script&gt;/);assert.match(markup,/&lt;img/);
  assert.doesNotMatch(markup,/<script>|<img|"confirmedCount"|"sourceText"/);
  assert.match(markup,/น้ำตาล/);
});
