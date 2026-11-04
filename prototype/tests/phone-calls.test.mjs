import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhoneCall, advancePhoneCall, createPhoneExperience } from '../phone-calls.js';

test('a medication call asks who is answering before asking about health, then requires summary confirmation', () => {
  let call = createPhoneCall('medication');
  call = advancePhoneCall(call, { type: 'accept' });
  assert.equal(call.step, 'consent');
  const beforeConsent = advancePhoneCall(call, { type: 'dose', value: 'taken' });
  assert.deepEqual(beforeConsent.answers, {});
  call = advancePhoneCall(call, { type: 'ready' });
  assert.equal(call.step, 'dose');
  call = advancePhoneCall(call, { type: 'dose', value: 'taken' });
  assert.equal(call.step, 'symptom');
  call = advancePhoneCall(call, { type: 'symptom', text: 'เวียนหัวเล็กน้อยช่วงเช้า' });
  assert.equal(call.step, 'review');
  assert.equal(call.confirmed, false);
  call = advancePhoneCall(call, { type: 'confirm' });
  assert.equal(call.step, 'summary');
  assert.equal(call.disposition, 'completed');
  assert.equal(call.confirmed, true);
  assert.deepEqual(call.answers, { dose: 'taken', symptom: 'เวียนหัวเล็กน้อยช่วงเช้า' });
});

test('an unanswered call has no medication or symptom answer', () => {
  const call = advancePhoneCall(createPhoneCall('medication'), { type: 'missed' });
  assert.equal(call.step, 'unanswered');
  assert.equal(call.disposition, 'missed');
  assert.equal(call.confirmed, false);
  assert.deepEqual(call.answers, {});
  assert.equal(call.startedAt, null);
});

test('a symptom-only call skips the medication question and supports correcting its summary', () => {
  let call = createPhoneCall('symptoms');
  for (const event of [{ type: 'accept' }, { type: 'ready' }, { type: 'symptom', text: 'เหนื่อยช่วงบ่าย' }]) call = advancePhoneCall(call, event);
  assert.equal(call.step, 'review');
  assert.equal(call.answers.dose, undefined);
  call = advancePhoneCall(call, { type: 'correct' });
  assert.equal(call.step, 'symptom');
  assert.deepEqual(call.answers, {});
});

test('the wrong recipient and a deferred call never become a confirmed health report', () => {
  const connected = advancePhoneCall(createPhoneCall(), { type: 'accept' });
  const wrong = advancePhoneCall(connected, { type: 'wrong-person' });
  assert.equal(wrong.disposition, 'wrong-person');
  assert.deepEqual(wrong.answers, {});
  const deferred = advancePhoneCall(connected, { type: 'defer' });
  assert.equal(deferred.disposition, 'deferred');
  assert.equal(deferred.confirmed, false);
  const premature = advancePhoneCall(connected, { type: 'confirm' });
  assert.equal(premature.step, 'consent');
});

test('the phone experience completes entirely through spoken answers without answer buttons or typed input', () => {
  const state = { events: [] };
  const modal = { open: false, innerHTML: '', dataset: {}, className: '' };
  const spoken = [];
  const voice = { active: false, listen() { this.active = true; }, stop() { this.active = false; }, speak(text) { spoken.push(text); } };
  const experience = createPhoneExperience({ state, modal, voice, showDialog(kind, html, className) { modal.open = true; modal.innerHTML = html; modal.className = className; }, closeDialog() { modal.open = false; }, persist() {}, render() {}, toast() {} });
  try {
    experience.action('phone-incoming');
    experience.action('phone-accept');
    assert.match(spoken.at(-1), /สะดวกคุย/);
    assert.doesNotMatch(modal.innerHTML, /phone-answer-form|phone-ready|phone-dose-taken|phone-confirm/);
    experience.hear('ใช่ค่ะ สะดวกคุย');
    assert.match(spoken.at(-1), /กินแล้วหรือยัง/);
    experience.hear('ยังไม่ได้กินยา');
    assert.match(spoken.at(-1), /อาการ.*จด/);
    experience.hear('วันนี้เวียนหัวเล็กน้อยช่วงเช้า');
    assert.match(spoken.at(-1), /ยังไม่ได้กินยา/);
    assert.match(spoken.at(-1), /ยืนยัน/);
    assert.equal(state.events.length, 0);
    experience.hear('ยืนยัน');
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].kind, 'call');
    assert.equal(state.events[0].isDemo, true);
    assert.equal(state.events[0].payload.confirmed, true);
    assert.equal(state.events[0].payload.answers.dose, 'not-yet');
    assert.match(modal.innerHTML, /คุยเรียบร้อยแล้ว/);
  } finally { experience.stop(); }
});

test('a delayed mock call arrives and becomes missed when nobody answers', async () => {
  const state = { events: [] };
  const modal = { open: false, innerHTML: '', dataset: {}, className: '' };
  const voice = { active: false, listen() {}, stop() {}, speak() {} };
  const experience = createPhoneExperience({ state, modal, voice, mockDelayMs: 10, ringTimeoutMs: 25, showDialog(kind, html, cls) { modal.open = true; modal.innerHTML = html; modal.className = cls; }, closeDialog() { modal.open = false; }, persist() {}, render() {}, toast() {} });
  try {
    experience.action('phone-schedule-mock');
    assert.equal(modal.open, false);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(modal.dataset.callStep, 'incoming');
    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(modal.dataset.callStep, 'unanswered');
    assert.equal(state.events.length, 1);
    assert.equal(state.events[0].payload.disposition, 'missed');
    assert.deepEqual(state.events[0].payload.answers, {});
    assert.equal(state.events[0].isDemo, true);
  } finally { experience.stop(); }
});

test('canceling or closing a pending mock call prevents it from arriving', async () => {
  let arrivals = 0;
  const modal = { open: false, innerHTML: '', dataset: {}, className: '' };
  const experience = createPhoneExperience({ state: { events: [] }, modal, mockDelayMs: 10, voice: { stop() {} }, showDialog() { arrivals++; }, closeDialog() {}, persist() {}, render() {}, toast() {} });
  try {
    experience.action('phone-schedule-mock');
    experience.action('phone-cancel-mock');
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(arrivals, 0);
    experience.action('phone-schedule-mock');
    experience.stop();
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(arrivals, 0);
  } finally { experience.stop(); }
});

test('incoming mock call accepts and declines through spoken words', () => {
  const state = {events:[]};
  const modal = {open:false,innerHTML:'',dataset:{},className:''};
  const voice = {active:false,listen(){this.active=true;},stop(){this.active=false;},speak(){}};
  const experience=createPhoneExperience({state,modal,voice,showDialog(k,html,cls){modal.open=true;modal.innerHTML=html;modal.className=cls;},closeDialog(){modal.open=false;},persist(){},render(){},toast(){}});
  try {
    experience.action('phone-incoming');
    assert.equal(voice.active,true);
    experience.hear('รับสายค่ะ');
    assert.equal(modal.dataset.callStep,'consent');
    experience.action('phone-end');
    experience.action('phone-symptoms');
    experience.hear('ไม่รับสายค่ะ');
    assert.equal(modal.dataset.callStep,'unanswered');
    assert.equal(state.events.at(-1).payload.disposition,'decline');
    assert.deepEqual(state.events.at(-1).payload.answers,{});
  } finally {experience.stop();}
});
