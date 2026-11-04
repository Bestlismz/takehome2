let cachedCatalog = null;
let catalogRequest = null;

export async function loadAppCommandCatalog() {
  if (cachedCatalog) return cachedCatalog;
  catalogRequest ??= fetch(new URL('./app-command-catalog.json', import.meta.url), { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error('โหลดเครื่องมือเสียงไม่สำเร็จค่ะ');
    const catalog = await response.json();
    if (catalog.version !== 1 || !Array.isArray(catalog.actions) || !catalog.parameters) throw new Error('รายการเครื่องมือเสียงไม่ถูกต้องค่ะ');
    cachedCatalog = catalog;
    return catalog;
  }).catch(error => { catalogRequest = null; throw error; });
  return catalogRequest;
}

function requireCatalog(catalog) {
  const value = catalog || cachedCatalog;
  if (!value) throw new Error('กรุณาโหลดรายการเครื่องมือเสียงก่อนค่ะ');
  return value;
}

export function getAppCommand(action, catalog) {
  const name = typeof action === 'string' ? action : action?.action;
  return requireCatalog(catalog).actions.find(entry => entry.action === name) || null;
}

export function isMutatingAppAction(action, catalog) { return getAppCommand(action, catalog)?.mutation === true; }
export function requiresSpokenConfirmation(action, catalog) { return getAppCommand(action, catalog)?.confirmation === 'spoken'; }

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function checkedValue(value, schema, field) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some(type => matchesType(value, type))) throw new Error(`ข้อมูล ${field} ไม่ถูกต้องค่ะ`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`ตัวเลือก ${field} ไม่ถูกต้องค่ะ`);
  if (typeof value === 'string') {
    value = value.trim();
    if (!value || (schema.maxLength && value.length > schema.maxLength)) throw new Error(`ข้อความ ${field} ว่างหรือยาวเกินไปค่ะ`);
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties || {}, key)) throw new Error(`ไม่รองรับการแก้ไข ${key} ค่ะ`);
      if (child !== null) result[key] = checkedValue(child, schema.properties[key], `${field}.${key}`);
    }
    return result;
  }
  return value;
}

export function validateAppAction(raw, catalog) {
  const registry = requireCatalog(catalog);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('คำสั่งแอปไม่ถูกต้องค่ะ');
  const definition = getAppCommand(raw.action, registry);
  if (!definition) throw new Error('ยังไม่มีคำสั่งนี้ในแอปค่ะ');
  const allowed = new Set(['action', ...definition.allowed]);
  const call = { action: definition.action };
  for (const [key, value] of Object.entries(raw)) {
    if (key !== 'action' && !Object.hasOwn(registry.parameters, key)) throw new Error(`ไม่รองรับข้อมูล ${key} ค่ะ`);
    if (key === 'action' || value === null) continue;
    if (!allowed.has(key) || !registry.parameters[key]) throw new Error(`คำสั่งนี้ไม่รับข้อมูล ${key} ค่ะ`);
    call[key] = checkedValue(value, registry.parameters[key], key);
  }
  for (const key of definition.required) if (!Object.hasOwn(call, key)) throw new Error(`ขอข้อมูล ${key} ก่อนทำรายการค่ะ`);
  for(const key of ['limit','offset'])if(key in call && (!Number.isInteger(call[key]) || call[key]<(key==='limit'?1:0) || call[key]>(key==='limit'?50:5000)))throw new Error('ช่วงรายการไม่ถูกต้องค่ะ');
  if (['dose.take', 'dose.undo'].includes(call.action) && !['morning', 'evening'].includes(call.id)) throw new Error('ระบุมื้อเช้าหรือมื้อเย็นค่ะ');
  if (call.action === 'reminder.snooze' && call.id && call.id !== 'morning') throw new Error('ต้นแบบเลื่อนเตือนได้เฉพาะยามื้อเช้าค่ะ');
  if (call.action === 'activity.set' && !['walk', 'water'].includes(call.id)) throw new Error('ไม่พบกิจวัตรนี้ค่ะ');
  if (call.action === 'call_plan.set') {
    const toggle = ['medication', 'symptoms', 'retry'].includes(call.field);
    const at = ['medicationAt', 'symptomsAt'].includes(call.field);
    if ((!toggle && !at) || (toggle && typeof call.value !== 'boolean') || (at && (typeof call.value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(call.value)))) throw new Error('ระบุการเปิดปิด หรือเวลา 00:00–23:59 ให้ถูกต้องค่ะ');
  }
  if (call.action === 'sharing.set' && !['logs', 'medication'].includes(call.field)) throw new Error('เลือกเฉพาะบันทึกสุขภาพหรือการกินยาค่ะ');
  if (call.action === 'mock_call.schedule' && call.purpose === 'missed') throw new Error('กรณีไม่รับสายให้ใช้คำสั่งดูตัวอย่างค่ะ');
  if (call.action === 'care_plan.set' && call.controlStatus !== 'unknown' && call.clinicianReported !== true) throw new Error('ขอยืนยันว่าเป็นสถานะที่แพทย์แจ้งก่อนค่ะ');
  if (call.action === 'record.update') {
    if (!Object.keys(call.patch).length && !call.occurredAt) throw new Error('ยังไม่มีข้อมูลที่ต้องการแก้ค่ะ');
    const p = call.patch;
    if ('systolic' in p && (p.systolic < 40 || p.systolic > 300)) throw new Error('ค่าความดันบนไม่ถูกต้องค่ะ');
    if ('diastolic' in p && (p.diastolic < 20 || p.diastolic > 200)) throw new Error('ค่าความดันล่างไม่ถูกต้องค่ะ');
    if ('systolic' in p && 'diastolic' in p && p.systolic <= p.diastolic) throw new Error('ค่าความดันบนต้องมากกว่าค่าล่างค่ะ');
    if ('value' in p && p.value <= 0) throw new Error('ค่าที่วัดต้องมากกว่าศูนย์ค่ะ');
    for (const name of ['minutesAfterMeal', 'minutesAfterMedication']) if (name in p && p[name] < 0) throw new Error('เวลาหลังอาหารหรือยาต้องไม่ติดลบค่ะ');
  }
  return call;
}

export function isExplicitAppConfirmation(value, {action} = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/\b(?:no|not|never|don['’]?t|do not|wait|but)\b/i.test(text)) return false;
  if (/^(?:(?:yes|please)[, ]+)?(?:i confirm|confirm|save it|save now|go ahead|that is correct|that's correct)(?:[.! ,]|$)/i.test(text)) return !/\bcancel\b/i.test(text) || ['calendar.cancel','dose.undo'].includes(action);
  if (/(?:ไม่|ไม่ได้|ยังไม่|ยังไม่ได้)ยืนยัน|ไม่ถูกต้อง|ไม่ใช่|อย่า.*(?:บันทึก|ลบ|แก้|ยกเลิก)|ไม่.*บันทึก|ยังไม่ตกลง|ยกเลิกการยืนยัน|ขอแก้|แต่/.test(text)) return false;
  if (/ยกเลิก/.test(text))return ['calendar.cancel','dose.undo'].includes(action) && /^ยืนยัน(?:ว่า)?(?:ให้)?(?:การ)?ยกเลิก/.test(text);
  return /^(?:ใช่(?:ค่ะ|ครับ)?[ ,]*)?(?:ขอ)?(?:ยืนยัน|ถูกต้อง|บันทึกเลย|จดได้เลย|ตกลงทำเลย)/.test(text);
}

export function authorizeAppAction(raw, { transcript, currentTurn, transcriptTurn, explicitConfirmationFn = isExplicitAppConfirmation } = {}, catalog) {
  const call = validateAppAction(raw, catalog);
  if (!requiresSpokenConfirmation(call, catalog)) return call;
  if (call.confirmed !== true || currentTurn == null || transcriptTurn !== currentTurn || !explicitConfirmationFn(transcript)) throw new Error('ต้องอ่านทวนและได้รับคำยืนยันจากเสียงรอบนี้ก่อนค่ะ');
  return call;
}

export function stageAppAction(raw, catalog) {
  const call = validateAppAction(raw, catalog);
  const requiresConfirmation = requiresSpokenConfirmation(call, catalog);
  return { call: requiresConfirmation ? { ...call, confirmed: false } : call, requiresConfirmation, label: getAppCommand(call, catalog).label };
}

export function rejectsProposal(value,action){
 const text=typeof value==='string'?value.trim():'';
 return (/\b(?:no|not yet|cancel|don't|do not|stop|wait)\b/i.test(text) || /(?:ไม่|ไม่ได้|ยังไม่|ยังไม่ได้)ยืนยัน|ไม่ถูกต้อง|ยกเลิก|^(?:อย่า|ไม่ต้อง|ยังไม่|ยังไม่ได้)/.test(text)) && !isExplicitAppConfirmation(text,{action});
}
