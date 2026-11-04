import test from 'node:test';
import assert from 'node:assert/strict';
import {settingsMarkup} from '../settings-view.js';

test('English settings exposes language, reading, sound and actual storage state',()=>{
 const markup=settingsMarkup({language:'en',largeText:true,audioProfile:'noisy',storageReady:true,storagePending:true});
 for(const label of ['App language','Reading comfort','How you talk','Your data and privacy','Changes are waiting to be saved'])assert.ok(markup.includes(label),label);
 assert.match(markup,/data-language="en"[^>]*aria-pressed="true"/);
 assert.match(markup,/role="switch" aria-checked="true"/);
 assert.match(markup,/data-profile="noisy" aria-pressed="true"/);
 assert.doesNotMatch(markup,/data-profile="speaker" aria-pressed="true"/);
});

test('Thai settings keeps clear labels and never claims demo calls are real',()=>{
 const markup=settingsMarkup({language:'th',storageReady:true});
 assert.ok(markup.includes('ภาษาของแอป'));
 assert.ok(markup.includes('การโทรและการแบ่งปันยังเป็นสาธิต'));
 assert.ok(markup.includes('เชื่อมต่อพื้นที่ครอบครัวแล้ว'));
 assert.match(markup,/data-action="knowledge-sources"/);
});
