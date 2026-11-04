import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conversationStageMarkup} from '../conversation-stage.js';
test('camera keeps cuff support and offers no pulse experiment or task popup commands',()=>{
  const markup=conversationStageMarkup('<span>mascot</span>');
  assert.match(markup,/id="camera-video"/);
  assert.match(markup,/data-action="bp-open"/);
  assert.doesNotMatch(markup,/pulse-open|pulse-inline|stage-pulse|tool-activity-toggle/);
  const catalog=JSON.parse(readFileSync(new URL('../app-command-catalog.json',import.meta.url),'utf8'));
  assert.equal(catalog.actions.some(action=>action.action.startsWith('pulse.')),false);
  assert.equal(catalog.actions.some(action=>['activity.open','activity.close'].includes(action.action)),false);
});
