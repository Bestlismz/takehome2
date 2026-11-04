import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservation, summarizeHealth, renderPhysicianSummary } from '../health-tracking.js';

const now = new Date('2026-11-04T05:00:00Z');
const event = (kind, payload = {}, extra = {}) => ({ kind, payload, source: 'speech', occurredAt: now.toISOString(), confirmed: true, ...extra });

test('summary excludes demo, unconfirmed, future and out-of-window records', () => {
  const records = [
    event('meal', { description: 'ข้าวหนึ่งจาน' }),
    event('meal', { description: 'สาธิต' }, { isDemo: true }),
    event('meal', { description: 'ยังไม่ยืนยัน' }, { confirmed: false }),
    event('meal', { description: 'ไม่มีสถานะยืนยัน' }, { confirmed: undefined }),
    event('meal', { description: 'พรุ่งนี้' }, { occurredAt: '2026-11-05T00:00:00Z' }),
    event('meal', { description: 'ก่อนช่วงรายงาน' }, { occurredAt: '2026-10-20T00:00:00Z' }),
  ];
  const summary = summarizeHealth(records, {}, { now });
  assert.equal(summary.meals.length, 1);
  assert.equal(summary.pending.length, 2);
  assert.equal(summary.confirmedCount, 1);
  assert.equal(summary.daysWithLogs, 1);
});

test('Bangkok calendar window includes its first midnight and excludes the previous minute', () => {
  const summary = summarizeHealth([
    event('dose', {}, { occurredAt: '2026-10-28T17:00:00Z' }),
    event('dose', {}, { occurredAt: '2026-10-28T16:59:00Z' }),
  ], {}, { now });
  assert.equal(summary.period.from, '2026-10-28T17:00:00.000Z');
  assert.equal(summary.adherence.doseConfirmations, 1);
});

test('diabetes control comes only from a clinician-configured profile, never glucose or conversation', () => {
  const records = [event('glucose', { value: 110, unit: 'mg/dL', measured: true, controlStatus: 'controlled' })];
  assert.equal(summarizeHealth(records, { diabetes: { controlStatus: 'controlled' } }, { now }).diabetes.controlStatus, 'unknown');
  const summary = summarizeHealth(records, { diabetes: { controlStatus: 'uncontrolled', confirmedByClinician: true } }, { now });
  assert.equal(summary.diabetes.controlStatus, 'uncontrolled');
  assert.equal(summary.diabetes.glucoseContextMissing, 1);
});

test('missing symptom answers differ from an explicit report of no symptoms', () => {
  const missing = summarizeHealth([], {}, { now });
  assert.ok(missing.missing.some(value => value.includes('ไม่ได้แปลว่าไม่มีอาการ')));
  const explicit = summarizeHealth([event('symptom', { noSymptoms: true, text: 'ไม่มีอาการ' })], {}, { now });
  assert.equal(explicit.noSymptoms.length, 1);
  assert.equal(explicit.symptoms.length, 0);
  assert.ok(!explicit.missing.some(value => value.includes('ไม่ได้แปลว่าไม่มีอาการ')));
});

test('food estimates retain ranges, assumptions and camera provenance without false exactness', () => {
  const meal = normalizeObservation({ kind: 'meal', source: 'camera', payload: { description: 'ข้าวผัด', portion: 'หนึ่งจาน', nutrition: { kcal: { min: 450, max: 650 }, fatGrams: { min: 12, max: 25 } }, assumptions: ['ไม่ทราบปริมาณน้ำมัน'], confidence: 'low' } }, { now });
  assert.equal(meal.confirmed, false);
  assert.equal(meal.source, 'camera');
  assert.deepEqual(meal.payload.nutrition.kcal, { min: 450, max: 650 });
  assert.equal(meal.payload.nutrition.carbsGrams, null);
  assert.equal(meal.payload.nutritionBasis, 'estimate');
  assert.deepEqual(meal.payload.assumptions, ['ไม่ทราบปริมาณน้ำมัน']);
  assert.throws(() => normalizeObservation({ kind: 'meal', payload: { text: 'ข้าว', nutrition: { kcal: { min: 500, max: 500 } } } }), /ต้องระบุเป็นช่วง/);
  assert.throws(() => normalizeObservation({ kind: 'meal', payload: { text: 'ข้าว', nutrition: { fatGrams: { min: 20, max: 10 } } } }), /ไม่ถูกต้อง/);
});

test('glucose requires a measured value and explicit units, never an image inference', () => {
  assert.throws(() => normalizeObservation({ kind: 'glucose', source: 'camera', payload: { value: 140 } }), /ต้องมาจากค่าที่วัด/);
  assert.throws(() => normalizeObservation({ kind: 'glucose', payload: { value: 6, measured: true, unit: 'mmol/L' } }), /mg\/dL/);
  const reading = normalizeObservation({ kind: 'glucose', confirmed: true, payload: { value: 145, measured: true, unit: 'mg/dL', mealRelation: 'after_meal', minutesAfterMeal: 120 } }, { now });
  assert.equal(reading.payload.minutesAfterMeal, 120);
  assert.equal(reading.confirmed, true);
});

test('explicit unconfirmed flag wins over contradictory nested confirmation', () => {
  const summary = summarizeHealth([event('adherence', { confirmed: true, status: 'taken' }, { confirmed: false })], {}, { now });
  assert.equal(summary.adherence.takenReports, 0);
  assert.equal(summary.pending.length, 1);
});

test('physician output escapes input and separates medication timing from causality', () => {
  const html = renderPhysicianSummary([
    event('symptom', { text: '<img src=x onerror=alert(1)>', medicationRelation: 'after_medication', minutesAfterMedication: 30 }),
    event('meal', { text: '<script>bad</script>', nutrition: { kcal: { min: 300, max: 500 } }, assumptions: ['<b>unknown oil</b>'] }),
  ], {}, { now });
  assert.doesNotMatch(html, /<script>|<img src=x|<b>unknown/);
  assert.match(html, /&lt;img/);
  assert.match(html, /ไม่ได้ยืนยันสาเหตุจากยา/);
  assert.match(html, /300–500 kcal/);
});

test('spoken confirmation rejects negation but preserves a confirmed missed dose', async () => {
  const { isExplicitConfirmation } = await import('../health-tracking.js');
  for (const text of ['ไม่ยืนยัน', 'ไม่ถูกต้อง อย่าบันทึก', 'ยังไม่ต้องบันทึก', 'ยกเลิกการยืนยัน', 'วันนี้กินข้าวแล้ว']) assert.equal(isExplicitConfirmation(text), false);
  for (const text of ['ยืนยัน', 'ถูกต้อง บันทึกเลย', 'ยืนยันว่าลืมกินยา', 'ยืนยันว่าไม่ได้กินยา']) assert.equal(isExplicitConfirmation(text), true);
});

test('only confirmed, schedule-specific taken reports complete a medication reminder', async () => {
  const { doseTaken } = await import('../data.js');
  const record={kind:'adherence',confirmed:true,isDemo:false,occurredAt:new Date().toISOString(),payload:{scheduleId:'morning',status:'taken'}};
  assert.equal(doseTaken([record],'morning'),true);
  assert.equal(doseTaken([record],'evening'),false);
  assert.equal(doseTaken([{...record,confirmed:false}],'morning'),false);
  assert.equal(doseTaken([{...record,isDemo:true}],'morning'),false);
  assert.equal(doseTaken([{...record,payload:{...record.payload,status:'missed'}}],'morning'),false);
});
