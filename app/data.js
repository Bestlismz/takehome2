import {tr,intlLocale,getLanguage} from './i18n.js';
export const dateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const thaiDate = (date = new Date(), opts = {}) => new Intl.DateTimeFormat(intlLocale(), { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', ...opts }).format(date);
export const time = date => new Intl.DateTimeFormat(intlLocale(), { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
export const schedules = [
  { id: 'morning', at: '08:00', get name(){return tr('ยาหลังอาหารเช้า','After-breakfast medicine');}, get detail(){return tr('ตามแผนยาของคุณ · รายการตัวอย่าง','Your medicine plan · sample');}, get period(){return tr('เช้า','Morning');}, icon: 'sun' },
  { id: 'evening', at: '20:00', get name(){return tr('ยามื้อเย็น','Evening medicine');}, get detail(){return tr('ตามแผนยาของคุณ · รายการตัวอย่าง','Your medicine plan · sample');}, get period(){return tr('เย็น','Evening');}, icon: 'pill' },
];
const KEY = 'aunjai-prototype-v1';
const validKinds = ['dose', 'bloodPressure', 'temperature', 'symptom', 'photo', 'call', 'meal', 'glucose', 'adherence'];
const labelText = {dose:['การกินยา','Medicine taken'],bloodPressure:['ความดันโลหิต','Blood pressure'],temperature:['อุณหภูมิร่างกาย','Temperature'],symptom:['อาการและความรู้สึก','Symptoms and wellbeing'],photo:['ภาพบันทึกสุขภาพ','Health photo'],call:['โทรติดตามสุขภาพ','Check-in call'],meal:['อาหารที่เล่า','Meals'],glucose:['น้ำตาลในเลือด','Blood glucose'],adherence:['ความต่อเนื่องของยา','Medication consistency']};
export const labels = Object.defineProperties({},Object.fromEntries(Object.entries(labelText).map(([key,[thai,english]])=>[key,{enumerable:true,get:()=>tr(thai,english)}])));
export const eventIcon = { dose: 'pill', bloodPressure: 'heart', temperature: 'thermometer', symptom: 'book', photo: 'image', call: 'phone', meal: 'book', glucose: 'heart', adherence: 'pill' };

function seedEvents() {
  const today = dateKey();
  const events = [];
  const systolic = [132, 131, 129, 126, 125, 128, 128];
  const diastolic = [81, 80, 79, 78, 77, 79, 78];
  for (let i = 0; i < 7; i++) {
    const date = new Date(`${today}T07:30:00+07:00`);
    date.setUTCDate(date.getUTCDate() - (6 - i));
    events.push({ id: `demo-bp-${i}`, kind: 'bloodPressure', occurredAt: date.toISOString(), source: 'demo', isDemo: true, payload: { systolic: systolic[i], diastolic: diastolic[i] } });
  }
  events.push({ id: 'demo-temp', kind: 'temperature', occurredAt: new Date(`${today}T07:35:00+07:00`).toISOString(), source: 'demo', isDemo: true, payload: { value: 36.5 } });
  return events;
}
export function readState() {
  const fallback = { version: 1, seedDate: dateKey(), events: seedEvents(), largeText: false, language:getLanguage(), sharing: { logs: false, medication: false }, activities: {}, snooze: null };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (!saved || saved.version !== 1 || !Array.isArray(saved.events)) return fallback;
    const events = saved.events.filter(e => e && typeof e.id === 'string' && validKinds.includes(e.kind) && !Number.isNaN(Date.parse(e.occurredAt)) && e.payload && typeof e.payload === 'object');
    const migrated = events.map(e => ({...e,confirmed:e.confirmed ?? (!e.isDemo && ['manual','voice'].includes(e.source))}));
    return { ...fallback, ...saved, events: saved.seedDate === dateKey() ? migrated : [...seedEvents(), ...migrated.filter(e => !e.isDemo)], seedDate: dateKey(), sharing: { ...fallback.sharing, ...saved.sharing }, activities: saved.activities || {} };
  } catch { return fallback; }
}
export function persist(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export const newEvent = (kind, payload, source = 'manual') => ({ id: crypto.randomUUID(), kind, payload, source, confirmed: true, isDemo: false, occurredAt: new Date().toISOString() });
export const latest = (events, kind) => events.filter(e => e.kind === kind).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
export const doseTaken = (events, scheduleId) => events.some(e => !e.isDemo && e.payload.scheduleId === scheduleId && ((e.kind === 'dose' && e.payload.dateKey === dateKey()) || (e.kind === 'adherence' && e.confirmed === true && e.payload.status === 'taken' && dateKey(new Date(e.occurredAt)) === dateKey())));
export const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const describe = e => {
  if (e.kind === 'bloodPressure') return `${e.payload.systolic}/${e.payload.diastolic} mmHg`;
  if (e.kind === 'glucose') return `${e.payload.value} mg/dL · ${({fasting:tr('ก่อนอาหารเช้า หลังงดอาหาร','Fasting, before breakfast'),before_meal:tr('ก่อนอาหาร','Before a meal'),after_meal:tr('หลังอาหาร','After a meal'),random:tr('วัดระหว่างวัน','Random reading'),unknown:tr('ไม่ได้ระบุเวลามื้ออาหาร','Meal timing not recorded')})[e.payload.mealRelation] || tr('ไม่ได้ระบุเวลามื้ออาหาร','Meal timing not recorded')}`;
  if (e.kind === 'meal') return `${e.payload.description || e.payload.text || labels.meal} · ${tr('ค่าประมาณโภชนาการ','Estimated nutrition')}`;
  if (e.kind === 'temperature') return `${Number(e.payload.value).toFixed(1)} °C`;
  return e.payload.text || e.payload.name || labels[e.kind];
};
