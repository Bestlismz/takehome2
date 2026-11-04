import test from 'node:test';
import assert from 'node:assert/strict';
import {html,tr,setLanguage,getLanguage,intlLocale} from '../i18n.js';

test('locale selection changes interface text and date locale without changing supplied content',()=>{
  setLanguage('en');
  assert.equal(getLanguage(),'en');
  assert.equal(intlLocale(),'en-GB');
  assert.equal(tr('ภาษา','Language'),'Language');
  const userText='ภาษา · วันนี้กินข้าว 1 ทัพพี';
  assert.equal(html`<p>${userText}</p>`,`<p>${userText}</p>`);
  assert.throws(()=>setLanguage('unsupported'));
  setLanguage('th');
  assert.equal(tr('ภาษา','Language'),'ภาษา');
  assert.equal(intlLocale(),'th-TH');
});

test('owned static markup is translated while ids and user attributes remain untouched',()=>{
  setLanguage('en');
  const userTitle='นัดของวันนี้';
  const result=html`<button data-id="${userTitle}" aria-label="บันทึกสุขภาพ">บันทึกสุขภาพ</button>`;
  assert.match(result,/aria-label="Health journal"/);
  assert.match(result,/>Health journal<\/button>/);
  assert.match(result,/data-id="นัดของวันนี้"/);
  setLanguage('th');
  assert.equal(html`<p>บันทึกสุขภาพ</p>`,'<p>บันทึกสุขภาพ</p>');
});
