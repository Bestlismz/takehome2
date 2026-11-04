import {tr,html,intlLocale} from './i18n.js';
import {isExplicitAppConfirmation} from './app-commands.js';
const zone = 'Asia/Bangkok';
const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = (value, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const sourceLabels = { speech: 'ผู้ใช้เล่าผ่านเสียง', voice: 'ผู้ใช้เล่าผ่านเสียง', camera: 'ภาพที่ผู้ใช้ให้ดู', manual: 'ผู้ใช้บันทึก', device: 'ค่าจากเครื่องวัดที่ผู้ใช้บันทึก' };
const relationLabels = { fasting: 'ขณะอดอาหาร', before_meal: 'ก่อนอาหาร', after_meal: 'หลังอาหาร', random: 'เวลาอื่น', unknown: 'ไม่ระบุช่วงเวลาเทียบมื้ออาหาร' };
const supportedKinds = new Set(['meal', 'glucose', 'adherence', 'symptom', 'dose', 'bloodPressure', 'temperature']);

function range(value, name, allowExact = false) {
  if (value == null) return null;
  const min = typeof value === 'number' && allowExact ? value : value.min ?? value.low;
  const max = typeof value === 'number' && allowExact ? value : value.max ?? value.high;
  if (![min, max].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) || max < min) throw new Error(`ช่วงประมาณ ${name} ไม่ถูกต้อง`);
  if (!allowExact && min === max) throw new Error(`ค่าประมาณ ${name} ต้องระบุเป็นช่วง`);
  return { min, max };
}

export function normalizeObservation(input, { now = new Date() } = {}) {
  if (!input || !['meal', 'glucose', 'adherence', 'symptom'].includes(input.kind)) throw new Error('ชนิดบันทึกไม่รองรับ');
  const raw = input.payload || input;
  const source = input.source === 'voice' ? 'speech' : input.source || 'speech';
  if (!['speech', 'camera', 'manual'].includes(source)) throw new Error('แหล่งข้อมูลไม่รองรับ');
  const occurredAt = new Date(input.occurredAt || now);
  if (Number.isNaN(occurredAt.getTime())) throw new Error('วันเวลาบันทึกไม่ถูกต้อง');
  const base = { kind: input.kind, source, occurredAt: occurredAt.toISOString(), confirmed: confirmed(input), isDemo: input.isDemo === true };
  if (input.kind === 'meal') {
    const description = text(raw.description || raw.text);
    if (!description) throw new Error('ขอชื่ออาหารหรือรายละเอียดมื้ออาหาร');
    const supplied = raw.nutrition || {};
    const basis = raw.nutritionBasis === 'label' ? 'label' : 'estimate';
    const nutrition = {
      kcal: range(supplied.kcal ?? supplied.calories_kcal, 'พลังงาน', basis === 'label'),
      fatGrams: range(supplied.fatGrams ?? supplied.fat_g, 'ไขมัน', basis === 'label'),
      carbsGrams: range(supplied.carbsGrams ?? supplied.carbohydrate_g, 'คาร์โบไฮเดรต', basis === 'label'),
      sodiumMg: range(supplied.sodiumMg ?? supplied.sodium_mg, 'โซเดียม', basis === 'label'),
    };
    return { ...base, payload: { text: description, description, portion: text(raw.portion, 300), nutritionBasis: basis, nutrition, assumptions: (Array.isArray(raw.assumptions) ? raw.assumptions : []).map(value => text(value, 300)).filter(Boolean).slice(0, 8), confidence: ['low', 'medium', 'high'].includes(raw.confidence) ? raw.confidence : 'low', confirmed: base.confirmed } };
  }
  if (input.kind === 'glucose') {
    if (raw.measured !== true) throw new Error('น้ำตาลต้องมาจากค่าที่วัด ไม่ประเมินจากภาพอาหารหรืออาการ');
    if (raw.unit && raw.unit !== 'mg/dL') throw new Error('กรุณาระบุค่าน้ำตาลเป็น mg/dL');
    if (typeof raw.value !== 'number' || !Number.isFinite(raw.value) || raw.value <= 0) throw new Error('ค่าน้ำตาลไม่ถูกต้อง');
    const relation = Object.hasOwn(relationLabels, raw.mealRelation) ? raw.mealRelation : 'unknown';
    const minutes = typeof raw.minutesAfterMeal === 'number' && Number.isFinite(raw.minutesAfterMeal) && raw.minutesAfterMeal >= 0 ? raw.minutesAfterMeal : null;
    return { ...base, payload: { value: raw.value, unit: 'mg/dL', measured: true, mealRelation: relation, minutesAfterMeal: relation === 'after_meal' ? minutes : null, text: `${raw.value} mg/dL · ${relationLabels[relation]}`, confirmed: base.confirmed } };
  }
  if (input.kind === 'adherence') {
    if (!['taken', 'missed', 'partial', 'unknown'].includes(raw.status)) throw new Error('สถานะการใช้ยาไม่ถูกต้อง');
    return { ...base, payload: { status: raw.status, medicationName: text(raw.medicationName, 200), scheduleId: text(raw.scheduleId, 100), reason: text(raw.reason, 500), text: text(raw.text, 1000), confirmed: base.confirmed } };
  }
  const noSymptoms = raw.noSymptoms === true;
  const description = text(raw.text || raw.description);
  if (!description && !noSymptoms) throw new Error('ยังไม่มีรายละเอียดอาการ');
  const minutes = typeof raw.minutesAfterMedication === 'number' && Number.isFinite(raw.minutesAfterMedication) && raw.minutesAfterMedication >= 0 ? raw.minutesAfterMedication : null;
  return { ...base, payload: { text: noSymptoms ? 'ผู้ใช้ระบุว่าไม่มีอาการที่อยากบันทึก' : description, noSymptoms, medicationRelation: raw.medicationRelation === 'after_medication' ? 'after_medication' : 'unknown', minutesAfterMedication: raw.medicationRelation === 'after_medication' ? minutes : null, medicationName: text(raw.medicationName, 200), confirmed: base.confirmed } };
}

function confirmed(event) { return event.confirmed !== false && event.payload?.confirmed !== false && (event.confirmed === true || event.payload?.confirmed === true); }
function validReading(event, kind) {
  const p = event.payload || {};
  if (kind === 'glucose') return p.measured === true && p.unit === 'mg/dL' && Number.isFinite(p.value) && p.value > 0;
  if (kind === 'bloodPressure') return Number.isFinite(p.systolic) && Number.isFinite(p.diastolic) && p.systolic > p.diastolic && p.diastolic > 0;
  return true;
}
const rangeOf = values => values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;

export function summarizeHealth(events, profile = {}, { now = new Date(), days = 7 } = {}) {
  const duration = Number.isInteger(days) && days > 0 && days <= 366 ? days : 7;
  const to = new Date(now);
  if (Number.isNaN(to.getTime())) throw new Error('วันที่สรุปไม่ถูกต้อง');
  const from = new Date(new Date(`${dayKey(to)}T00:00:00+07:00`).getTime() - (duration - 1) * 86400000);
  const scoped = (Array.isArray(events) ? events : []).filter(event => event && event.payload && typeof event.payload === 'object' && supportedKinds.has(event.kind) && !event.isDemo && !['demo', 'phone-demo'].includes(event.source) && Date.parse(event.occurredAt) >= from.getTime() && Date.parse(event.occurredAt) <= to.getTime());
  const pending = scoped.filter(event => !confirmed(event));
  const accepted = scoped.filter(event => confirmed(event));
  const meals = accepted.filter(event => event.kind === 'meal');
  const glucose = accepted.filter(event => event.kind === 'glucose' && validReading(event, 'glucose'));
  const bp = accepted.filter(event => event.kind === 'bloodPressure' && validReading(event, 'bloodPressure'));
  const invalidReadings = accepted.filter(event => ['glucose', 'bloodPressure'].includes(event.kind) && !validReading(event, event.kind));
  const adherence = accepted.filter(event => event.kind === 'adherence');
  const doses = accepted.filter(event => event.kind === 'dose');
  const symptoms = accepted.filter(event => event.kind === 'symptom' && event.payload?.noSymptoms !== true);
  const noSymptoms = accepted.filter(event => event.kind === 'symptom' && event.payload?.noSymptoms === true);
  const diabetes = profile.diabetes || {};
  const clinicianSet = diabetes.confirmedByClinician === true || diabetes.updatedBy === 'clinician';
  const controlStatus = clinicianSet && ['controlled', 'uncontrolled'].includes(diabetes.controlStatus) ? diabetes.controlStatus : 'unknown';
  const missing = [];
  if (controlStatus === 'unknown') missing.push('ยังไม่มีสถานะการควบคุมเบาหวานที่แพทย์กำหนด');
  if (!doses.length && !adherence.length) missing.push('ไม่มีข้อมูลการใช้ยาที่ผู้ใช้ยืนยันในช่วงนี้');
  if (!bp.length) missing.push('ไม่มีค่าความดันที่ยืนยันในช่วงนี้');
  if (!meals.length) missing.push('ไม่มีมื้ออาหารที่ยืนยันในช่วงนี้');
  if (controlStatus === 'uncontrolled' && !glucose.length) missing.push('ไม่มีค่าน้ำตาลจากเครื่องวัดที่ยืนยันในช่วงนี้');
  if (!symptoms.length && !noSymptoms.length) missing.push('ยังไม่ได้รับคำตอบเรื่องอาการ ไม่ได้แปลว่าไม่มีอาการ');
  return {
    period: { from: from.toISOString(), to: to.toISOString(), days: duration, timeZone: zone },
    diabetes: { controlStatus, clinicianSet, glucose, glucoseRange: rangeOf(glucose.map(event => event.payload.value)), glucoseContextMissing: glucose.filter(event => !event.payload.mealRelation || event.payload.mealRelation === 'unknown').length },
    bloodPressure: { readings: bp, systolicRange: rangeOf(bp.map(event => event.payload.systolic)), diastolicRange: rangeOf(bp.map(event => event.payload.diastolic)) },
    adherence: { entries: adherence, doseConfirmations: doses.length, takenReports: adherence.filter(event => event.payload.status === 'taken').length, missedReports: adherence.filter(event => event.payload.status === 'missed').length, partialReports: adherence.filter(event => event.payload.status === 'partial').length, unknownReports: adherence.filter(event => event.payload.status === 'unknown').length },
    meals, symptoms, noSymptoms, symptomsAfterMedication: symptoms.filter(event => event.payload.medicationRelation === 'after_medication'),
    pending, invalidReadings, missing, confirmedCount: accepted.length, daysWithLogs: new Set(accepted.map(event => dayKey(new Date(event.occurredAt)))).size,
  };
}

function dateLabel(value) { return new Intl.DateTimeFormat(intlLocale(), { timeZone: zone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function rangeText(value, unit) { return value ? `${value.min === value.max ? value.min : `${value.min}–${value.max}`} ${unit}` : tr('ยังไม่ได้ประมาณ'); }
function provenance(event) { return `${tr(sourceLabels[event.source]) || tr('ผู้ใช้ให้ข้อมูล')} · ${dateLabel(event.occurredAt)}`; }
function list(items, empty, render) { return items.length ? `<ul>${items.map(item => `<li>${render(item)}</li>`).join('')}</ul>` : `<p class="summary-missing">${esc(empty)}</p>`; }

export function renderPhysicianSummary(events, profile = {}, options = {}) {
  const summary = summarizeHealth(events, profile, options);
  const status = { controlled: tr('ตามแผนแพทย์ที่ผู้ใช้แจ้ง: ควบคุมได้'), uncontrolled: tr('ตามแผนแพทย์ที่ผู้ใช้แจ้ง: ยังควบคุมไม่ได้'), unknown: tr('ยังไม่ระบุโดยแพทย์') }[summary.diabetes.controlStatus];
  const adherence = summary.adherence;
  const foods = list(summary.meals, tr('ยังไม่มีมื้ออาหารที่ยืนยัน'), event => {
    const p = event.payload;
    return html`<strong>${esc(p.description || p.text)}</strong><span>${esc(p.portion || tr('ยังไม่ระบุปริมาณ'))}</span><span>${esc(p.nutritionBasis === 'label' ? tr('ข้อมูลฉลากที่ผู้ใช้ให้') : tr('โภชนาการประมาณจากคำบอกเล่าหรือภาพ'))} · พลังงาน ${esc(rangeText(p.nutrition?.kcal, 'kcal'))} · ไขมัน ${esc(rangeText(p.nutrition?.fatGrams, tr('กรัม')))} · คาร์บ ${esc(rangeText(p.nutrition?.carbsGrams, tr('กรัม')))} · โซเดียม ${esc(rangeText(p.nutrition?.sodiumMg, tr('มก.')))}</span>${p.assumptions?.length ? html`<small>สมมติฐาน: ${esc(p.assumptions.join(' · '))}</small>` : ''}<small>${esc(provenance(event))}</small>`;
  });
  return html`<section class="physician-summary"><header class="summary-header"><div><p>ลูกหลาน · สรุประหว่างนัด</p><h2>ข้อมูลให้คุณหมอ</h2><span>${esc(dateLabel(summary.period.from))} ถึง ${esc(dateLabel(summary.period.to))}</span></div><span>${summary.daysWithLogs} วันที่มีบันทึก / ${summary.period.days} วัน</span></header><p class="summary-context">ข้อมูลที่ผู้ใช้ยืนยัน ไม่ใช่ผลวินิจฉัย · ไม่รวมข้อมูลสาธิตและรายการรอยืนยัน · วันที่ไม่มีบันทึกไม่ได้แปลว่าไม่ได้กินยา</p><div class="summary-condition-grid"><section class="summary-condition"><h3>เบาหวาน</h3><p>สถานะการควบคุม: ${esc(status)}</p><dl><div><dt>ยืนยันกินยารายมื้อ</dt><dd>${adherence.doseConfirmations} ครั้ง</dd></div><div><dt>เล่าว่ากิน / ลืม / กินไม่ครบ</dt><dd>${adherence.takenReports} / ${adherence.missedReports} / ${adherence.partialReports} รายการ</dd></div><div><dt>ค่าน้ำตาลจากเครื่องวัด</dt><dd>${summary.diabetes.glucose.length} บันทึก · ${esc((summary.diabetes.glucoseRange ? (summary.diabetes.glucoseRange ? rangeText(summary.diabetes.glucoseRange, 'mg/dL') : tr('ยังไม่มีค่าที่วัด')) : tr('ยังไม่มีค่าที่วัด')))}</dd></div></dl>${list(summary.diabetes.glucose, tr('ยังไม่มีค่าน้ำตาลที่ยืนยัน'), event => `<strong>${esc(event.payload.value)} mg/dL</strong><span>${esc(tr(relationLabels[event.payload.mealRelation] || relationLabels.unknown))}${event.payload.minutesAfterMeal != null ? html` ${esc(event.payload.minutesAfterMeal)} นาที` : ''}</span><small>${esc(provenance(event))}</small>`)}</section><section class="summary-condition"><h3>ความดัน</h3><dl><div><dt>ค่าที่ผู้ใช้ยืนยัน</dt><dd>${summary.bloodPressure.readings.length} บันทึก</dd></div><div><dt>ช่วงค่าบน / ค่าล่าง</dt><dd>${esc(rangeText(summary.bloodPressure.systolicRange, ''))} / ${esc(rangeText(summary.bloodPressure.diastolicRange, 'mmHg'))}</dd></div></dl><p>ทบทวนอาหาร โซเดียม และเวลาเทียบการใช้ยา โดยยังไม่สรุปว่าการรักษาควบคุมได้จากบทสนทนา</p></section><section class="summary-condition"><h3>ไขมันและอาหาร</h3><p>${summary.meals.length} มื้อที่ยืนยัน · โภชนาการจากภาพและเสียงเป็นค่าประมาณ ต้องทบทวนปริมาณและวิธีปรุง</p><p>ข้อมูลอาหารไม่ใช่ผลตรวจระดับไขมันในเลือด</p></section></div><section class="summary-foods"><h3>อาหารที่เล่าให้ลูกหลานฟัง</h3>${foods}</section><section class="summary-symptoms"><h3>อาการและความสัมพันธ์กับยา</h3>${list(summary.symptoms, summary.noSymptoms.length ? html`ผู้ใช้ระบุว่าไม่มีอาการที่อยากบันทึก ${summary.noSymptoms.length} ครั้ง` : tr('ยังไม่ได้รับคำตอบเรื่องอาการ'), event => `<strong>${esc(event.payload.text)}</strong><span>${event.payload.medicationRelation === 'after_medication' ? html`ผู้ใช้เล่าว่าเกิดหลังกินยา${event.payload.minutesAfterMedication != null ? html` ${esc(event.payload.minutesAfterMedication)} นาที` : tr(' · ยังไม่ระบุระยะเวลา')} ไม่ได้ยืนยันสาเหตุจากยา` : tr('ยังไม่ทราบความสัมพันธ์กับยา')}</span><small>${esc(provenance(event))}</small>`)}</section><section class="summary-pending"><h3>เรื่องที่ยังต้องถามเพิ่ม</h3><ul>${summary.missing.map(item => `<li>${esc(tr(item))}</li>`).join('')}${summary.pending.length ? html`<li>${summary.pending.length} รายการรอผู้ใช้ยืนยัน ไม่นำมารวมตัวเลข</li>` : ''}${summary.invalidReadings.length ? html`<li>${summary.invalidReadings.length} ค่าวัดต้องตรวจสอบข้อมูลก่อนใช้</li>` : ''}${summary.diabetes.glucoseContextMissing ? html`<li>ค่าน้ำตาล ${summary.diabetes.glucoseContextMissing} รายการยังไม่ทราบเวลาเทียบมื้ออาหาร</li>` : ''}</ul></section><p class="summary-footer">ให้แพทย์ทบทวนร่วมกับผลตรวจและแผนยาปัจจุบัน · ลูกหลานไม่แนะนำให้เพิ่ม ลด หรือหยุดยาเอง</p></section>`;
}

export function renderTrackingOverview(events, profile = {}, options = {}) {
  const summary = summarizeHealth(events, profile, options);
  return html`<section class="tracking-overview" aria-label="ข้อมูลจากการพูดคุย ${summary.period.days} วัน"><div class="section-heading"><h2>เรื่องเล่าที่ช่วยคุณหมอได้</h2><button type="button" class="text-button" data-action="report">ดูสรุป ${summary.period.days} วัน</button></div><div class="tracking-stats"><div><strong>${summary.meals.length}</strong><span>มื้ออาหารที่ยืนยัน</span></div><div><strong>${summary.diabetes.glucose.length}</strong><span>ค่าน้ำตาลจากเครื่องวัด</span></div><div><strong>${summary.symptoms.length}</strong><span>เรื่องอาการที่เล่า</span></div></div><p>${summary.pending.length ? html`มี ${summary.pending.length} รายการรอยืนยัน · ` : ''}เล่าได้ทีละเรื่อง ลูกหลานช่วยจดให้ค่ะ</p></section>`;
}

export function isExplicitConfirmation(value) {
  return isExplicitAppConfirmation(value);
}

