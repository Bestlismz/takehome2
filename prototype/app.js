import { icon, logo } from './icons.js';
import { readState, persist, newEvent, latest, doseTaken, schedules, labels, eventIcon, dateKey, thaiDate, time, escapeHTML as esc, describe } from './data.js';
import { CameraSession, VoiceSession, interpret } from './media.js';
import { toolDefinitions, executeTool } from './voice-tools.js';
import { createPhoneExperience } from './phone-calls.js';
import { ConversationStage, conversationStageMarkup } from './conversation-stage.js';

const state = readState();
const ui = { route: 'today', filter: 'all', dialog: null, attachment: null, editing: null, source: 'manual', cameraMode: 'environment', cameraPhase: 'closed', pending: null, snoozeTimer: null };
const modal = document.querySelector('#modal');
const camera = new CameraSession();
let phoneExperience;
const nav = [
  ['today', 'home', 'วันนี้'], ['history', 'heart', 'บันทึกสุขภาพ'], ['medication', 'pill', 'ยาของฉัน'], ['care', 'users', 'คนดูแล'],
];
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = message;
  document.querySelector('#toast').classList.add('visible');
  toastTimer = setTimeout(() => document.querySelector('#toast').classList.remove('visible'), 4500);
}
function saveState() {
  if (!persist(state)) toast('พื้นที่บันทึกไม่พร้อม ข้อมูลนี้อยู่ได้เฉพาะระหว่างเปิดหน้านี้ค่ะ');
}
function addEvent(event) {
  state.events.push(event);
  saveState();
  render();
}
function sourceLabel(event) {
  return event.isDemo ? 'ข้อมูลตัวอย่าง' : event.source === 'voice' ? 'คุณยืนยันผ่านผู้ช่วย' : 'คุณบันทึกเอง';
}
function button(action, text, glyph, cls = 'button', attrs = '') {
  return `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${text}</span></button>`;
}
function showDialog(kind, body, className = '') {
  if (modal.open) closeDialog();
  ui.dialog = kind;
  modal.className = className;
  modal.innerHTML = body;
  modal.showModal();
  document.body.classList.add('dialog-open');
}
function closeDialog() {
  ui.stage?.destroy();
  ui.stage = null;
  phoneExperience?.stop();
  camera.stop();
  voice.stop();
  ui.cameraPhase = 'closed';
  ui.dialog = null;
  ui.pending = null;
  ui.awaitingKind = null;
  ui.awaitingDose = false;
  ui.attachment = null;
  ui.editing = null;
  if (modal.open) modal.close();
  document.body.classList.remove('dialog-open');
}
function dismissDialog() {
  if (ui.dialog === 'voice' && ui.recordDraft) {
    const draft = ui.recordDraft;
    ui.recordDraft = null;
    recordDialog(draft.kind, draft);
  } else { ui.recordDraft = null; closeDialog(); }
}
function modalHeader(title, subtitle = '', glyph = '') {
  return `<header class="modal-header"><div>${glyph ? `<span class="modal-icon">${icon(glyph)}</span>` : ''}<h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${button('close', 'ปิด', 'close', 'icon-button close-button', 'aria-label="ปิดหน้าต่าง"')}</header>`;
}
function render() {
  document.body.classList.toggle('large-text', state.largeText);
  document.querySelector('#sidebar').innerHTML = `<a class="brand" href="#today" aria-label="อุ่นใจ หน้าหลัก">${logo}<span>อุ่นใจ<small>A LITTLE CARE, EVERY DAY</small></span></a><div class="sidebar-label">พื้นที่สุขภาพของคุณ</div><nav>${nav.map(([route, glyph, title]) => `<a class="nav-item ${ui.route === route ? 'active' : ''}" href="#${route}" ${ui.route === route ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${title}</span>${ui.route === route ? '<i></i>' : ''}</a>`).join('')}</nav><button class="sidebar-camera" data-action="camera">${icon('camera')}<span>คุยพร้อมกล้องสด<small>เปิดกล้อง แล้วถามได้เลย</small></span>${icon('arrow')}</button><div class="sidebar-bottom"><div class="leaf-art">${logo}</div><p>ดูแลวันนี้<br>ให้วันหน้าสบายใจ</p><span>อยู่ข้าง ๆ ในทุกวันของคุณ</span></div><button class="sidebar-help" data-action="about">${icon('info')} เกี่ยวกับพื้นที่ทดลอง</button>`;
  document.querySelector('#header').innerHTML = `<a class="mobile-brand brand" href="#today">${logo}<span>อุ่นใจ</span></a><div class="date-line">${icon('calendar')}<span>${thaiDate()}</span></div><div class="header-actions">${button('large-text', 'กข', '', `text-size ${state.largeText ? 'selected' : ''}`, `aria-label="${state.largeText ? 'ใช้' : 'ขยาย'}ขนาดตัวอักษร${state.largeText ? 'ปกติ' : ''}" aria-pressed="${state.largeText}"`)}${button('report', 'สรุปให้คุณหมอ', 'file', 'button subtle header-report')}<button class="profile" data-action="profile" aria-label="โปรไฟล์ คุณสมใจ"><span class="avatar">ส</span><span>คุณสมใจ</span>${icon('down')}</button></div>`;
  document.querySelector('#mobile-nav').innerHTML = `${nav.slice(0, 2).map(([r, g, t]) => mobileItem(r, g, t)).join('')}<button class="mobile-talk" data-action="voice" aria-label="คุยกับอุ่นใจ">${icon('mic')}<span>พูดคุย</span></button>${nav.slice(2).map(([r, g, t]) => mobileItem(r, g, t)).join('')}`;
  const views = { today: homeView, history: historyView, medication: medicationView, care: careView };
  document.querySelector('#content').innerHTML = views[ui.route]();
}
function mobileItem(route, glyph, title) {
  const shortTitle = { today: 'วันนี้', history: 'สุขภาพ', medication: 'ยา', care: 'คนดูแล' }[route] || title;
  return `<a href="#${route}" class="mobile-item ${route === ui.route ? 'active' : ''}" ${route === ui.route ? 'aria-current="page"' : ''} aria-label="${title}">${icon(glyph)}<span>${shortTitle}</span></a>`;
}
function orb(className = '') {
  return `<div class="voice-sphere ${className}" data-state="idle" aria-hidden="true"><div class="sphere-cloud cloud-one"></div><div class="sphere-cloud cloud-two"></div><div class="sphere-cloud cloud-three"></div><div class="sphere-glint"></div></div>`;
}
function homeView() {
  const morningTaken = doseTaken(state.events, 'morning');
  return `<div class="dashboard home-dashboard"><div class="greeting"><div><span class="home-date">${thaiDate()}</span><h1>สวัสดีค่ะ คุณสมใจ</h1><p>วันนี้รู้สึกอย่างไรบ้างคะ</p></div></div><section class="main-column">
    <section class="assistant-card glass"><div class="assistant-copy"><h2>พูดได้เลย<br>อุ่นใจอยู่ข้างคุณ</h2><p>คุยเรื่องสุขภาพ หรือเปิดกล้องให้ช่วยดู</p>${button('voice', 'พูดกับอุ่นใจ', 'mic', 'button primary')}</div><div class="home-orbit" aria-hidden="true">${orb()}<span class="orbit-shadow"></span></div></section>
    ${phoneExperience.homeCard()}
    <section class="health-section"><div class="section-heading"><h2>สุขภาพล่าสุด</h2>${button('record', 'เพิ่มบันทึก', 'plus', 'text-button', 'aria-label="บันทึกเพิ่ม"')}</div><div class="metrics">${metric('bloodPressure')}${metric('temperature')}</div></section>
    <section class="med-reminder ${morningTaken ? 'completed' : ''}"><span class="reminder-icon">${icon(morningTaken ? 'check' : 'pill')}</span><div><h3>${morningTaken ? 'บันทึกยามื้อเช้าแล้ว' : 'ยามื้อเช้า · 08:00'}</h3><p>${state.snooze && state.snooze > Date.now() ? 'เลื่อนเตือนอยู่ · เมื่อเปิดหน้านี้ไว้' : 'ตามแผนยาของคุณ · รายการตัวอย่าง'}</p></div>${morningTaken ? '<span class="done-pill">' + icon('check') + ' กินแล้ว</span>' : button('dose', 'กินยาแล้ว', '', 'button primary compact', 'data-id="morning"')}</section>
    <section class="daily-section"><div class="section-heading"><h2>กิจวัตรวันนี้</h2><a class="text-button" href="#medication">ดูแผนยา ${icon('arrow')}</a></div><div class="daily-list">${dailyRows()}</div></section>
  </section><aside class="right-column health-overview" aria-label="ภาพรวมสุขภาพและคนดูแล">${chartCard()}<section class="family-card glass"><div class="section-heading"><h3>คนที่ห่วงใยคุณ</h3>${icon('users')}</div><div class="family-person"><span class="avatar peach">พ</span><div><strong>พิมพ์ · ลูกสาว</strong><span>ผู้ดูแลตัวอย่าง</span></div></div><p>เลือกได้ว่าอยากให้คนดูแล<br>เห็นข้อมูลส่วนไหนของคุณ</p><a class="button outline" href="#care">จัดการการดูแล ${icon('arrow')}</a></section><section class="voice-tip"><h3>ลองพูดให้อุ่นใจช่วย</h3><button data-action="voice">“เปิดกล้องหลังให้หน่อย”</button><button data-action="voice">“สรุปสุขภาพให้คุณหมอ”</button><span>ใช้เสียงเปิดเครื่องมือได้ทันที</span></section></aside></div>`;
}
function metric(kind) {
  const entry = latest(state.events, kind);
  const bp = kind === 'bloodPressure';
  return `<button class="metric-card" data-action="record" data-kind="${kind}"><div class="metric-label">${icon(bp ? 'heart' : 'thermometer')}<span>${bp ? 'ความดันโลหิต' : 'อุณหภูมิ'}</span>${icon('plus', 'metric-plus')}</div><div class="metric-value">${entry ? bp ? `${esc(entry.payload.systolic)}<span class="value-slash">/</span>${esc(entry.payload.diastolic)}` : Number(entry.payload.value).toFixed(1) : 'ยังไม่มีค่า'}<span class="metric-unit">${bp ? 'mmHg' : '°C'}</span></div><div class="metric-meta">${entry ? `${sourceLabel(entry)} <span>· ${time(entry.occurredAt)} น.</span>` : 'แตะเพื่อบันทึกจากเครื่องวัด'}</div></button>`;
}
function dailyRows() {
  return [
    ['walk', '10:00', 'ขยับร่างกายตามที่สะดวก', 'walk', 'activity'],
    ['water', '14:00', 'พักสักนิด เช็กความรู้สึกวันนี้', 'water', 'activity'],
  ].map(([id, at, title, glyph, action]) => {
    const done = id === 'pressure' ? state.events.some(e => !e.isDemo && e.kind === 'bloodPressure' && dateKey(new Date(e.occurredAt)) === dateKey()) : state.activities[`${dateKey()}-${id}`];
    return `<button class="daily-row ${done ? 'done' : ''}" data-action="${action}" data-id="${id}" data-kind="bloodPressure"><span class="task-check">${done ? icon('check') : ''}</span><span class="task-time">${at}</span><span class="task-title">${title}</span><span class="task-end">${done ? 'เรียบร้อย' : icon(glyph)}</span></button>`;
  }).join('');
}
function calendarView() {
  const today = new Date(`${dateKey()}T12:00:00+07:00`);
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  return `<section class="calendar-card glass"><div class="section-heading"><h3>${thaiDate(today, { day: undefined, month: 'long', year: 'numeric' })}</h3>${icon('calendar')}</div><div class="calendar-grid">${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => `<span class="weekday">${d}</span>`).join('')}${'<span></span>'.repeat(first)}${Array.from({ length: days }, (_, i) => `<span class="calendar-day ${i + 1 === today.getDate() ? 'current' : ''}">${i + 1}</span>`).join('')}</div><div class="calendar-caption"><span class="status-dot"></span> วันนี้ ดูแลตัวเองอีกนิดนะคะ</div></section>`;
}
function chartCard() {
  const data = state.events.filter(e => e.kind === 'bloodPressure').sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(-7);
  const last = data.at(-1);
  const points = key => data.map((e, i) => `${35 + i * 33},${150 - (e.payload[key] - 60) * 1.25}`).join(' ');
  return `<section class="chart-card glass"><div class="section-heading"><h3>ความดันที่ผ่านมา</h3>${icon('heart')}</div><p>${data.length} บันทึกล่าสุด · มีข้อมูลตัวอย่าง</p>${last ? `<div class="overview-reading"><strong>${esc(last.payload.systolic)}<span>/</span>${esc(last.payload.diastolic)}</strong><span>mmHg</span></div><div class="overview-source">${sourceLabel(last)} · ${time(last.occurredAt)} น.</div>` : ''}<svg class="bp-chart" viewBox="0 0 260 172" role="img" aria-label="กราฟความดันจากบันทึกล่าสุด มีข้อมูลตัวอย่างประกอบ">${[80, 100, 120, 140].map(n => `<text x="0" y="${154 - (n - 60) * 1.25}">${n}</text><path class="chart-grid" d="M30 ${150 - (n - 60) * 1.25}H250"/>`).join('')}<polyline points="${points('systolic')}" class="chart-line sys"/><polyline points="${points('diastolic')}" class="chart-line dia"/>${data.map((e, i) => `<circle cx="${35 + i * 33}" cy="${150 - (e.payload.systolic - 60) * 1.25}" r="3.5" fill="#333333"/><circle cx="${35 + i * 33}" cy="${150 - (e.payload.diastolic - 60) * 1.25}" r="3.5" fill="#999999"/><text x="${35 + i * 33}" y="167" text-anchor="middle">${new Date(e.occurredAt).getDate()}</text>`).join('')}</svg><div class="chart-legend"><span><i></i> ค่าบน</span><span><i></i> ค่าล่าง</span><small>มีข้อมูลตัวอย่าง</small></div></section>`;
}
function pageHeading(title, desc, action = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
}
function historyView() {
  const entries = state.events.filter(e => ui.filter === 'all' || e.kind === ui.filter).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return `<div class="full-page modern-page history-page">${pageHeading('สมุดสุขภาพของฉัน', 'สิ่งที่คุณเล่า สิ่งที่คุณวัด เก็บไว้ให้จำง่ายขึ้น', button('record', 'บันทึกสุขภาพ', 'plus', 'button primary'))}<div class="route-readings" aria-label="ค่าที่บันทึกล่าสุด">${metric('bloodPressure')}${metric('temperature')}</div><div class="history-tools glass"><div class="filter-tabs" role="group" aria-label="กรองบันทึก">${[['all', 'ทั้งหมด'], ['bloodPressure', 'ความดัน'], ['temperature', 'อุณหภูมิ'], ['symptom', 'อาการ'], ['dose', 'การกินยา'], ['photo', 'ภาพถ่าย'], ['call', 'การโทร']].map(([key, text]) => `<button data-action="filter" data-kind="${key}" class="filter ${ui.filter === key ? 'active' : ''}" aria-pressed="${ui.filter === key}">${text}</button>`).join('')}</div>${button('report', 'ดูสรุปให้คุณหมอ', 'file', 'text-button')}</div><div class="timeline glass"><div class="section-heading"><h2>บันทึกล่าสุด</h2><span class="muted">${entries.length} รายการ</span></div>${entries.length ? entries.map(eventRow).join('') : `<div class="empty-state">${icon('book')}<h3>เริ่มต้นบันทึกแรกของคุณ</h3><p>พิมพ์ พูด หรือถ่ายภาพก็ได้ค่ะ</p>${button('record', 'เพิ่มบันทึก', 'plus', 'button primary')}</div>`}</div><p class="privacy-note">${icon('shield')} บันทึกใหม่เก็บอยู่ในเบราว์เซอร์นี้ ยังไม่มีการส่งให้คนดูแลหรือแพทย์</p></div>`;
}
function eventRow(event) {
  const image = event.payload.image?.startsWith('data:image/jpeg;base64,') ? event.payload.image : '';
  return `<article class="event-row"><span class="event-icon ${event.kind}">${icon(eventIcon[event.kind])}</span><div class="event-body"><div class="event-title"><h3>${labels[event.kind]}</h3><span class="source ${event.isDemo ? 'demo' : ''}">${sourceLabel(event)}</span></div><p>${esc(describe(event))}</p><small>${thaiDate(new Date(event.occurredAt), { year: undefined, month: 'short' })} · ${time(event.occurredAt)} น.</small>${image ? `<img class="event-photo" src="${image}" alt="ภาพที่แนบกับบันทึกสุขภาพ" loading="lazy">` : ''}</div>${!event.isDemo && event.kind !== 'dose' ? button('edit', 'แก้ไข', 'edit', 'icon-button', `data-id="${event.id}" aria-label="แก้ไข${labels[event.kind]}"`) : ''}</article>`;
}
function medicationView() {
  return `<div class="full-page modern-page medication-page">${pageHeading('ยาของฉัน', 'จดไว้ให้มั่นใจ ว่าวันนี้กินยาแล้วหรือยัง', button('camera', 'ดูฉลากยาผ่านกล้อง', 'camera', 'button outline'))}<div class="notice glass">${icon('info')}<p>นี่คือแผนยาตัวอย่างสำหรับทดลองใช้งาน<br><strong>ใช้ยาตามคำสั่งแพทย์ ไม่ปรับยาตามต้นแบบนี้</strong></p></div><div class="medication-grid">${schedules.map(schedule => {
    const taken = doseTaken(state.events, schedule.id);
    return `<section class="medication-card glass"><div class="medication-top"><span class="round-icon">${icon(schedule.icon)}</span><span class="period">มื้อ${schedule.period}</span><strong class="med-time">${schedule.at}<small> น.</small></strong></div><h2>${schedule.name}</h2><p>${schedule.detail}</p><div class="medication-status ${taken ? 'is-done' : ''}">${icon(taken ? 'check' : 'clock')}${taken ? 'คุณยืนยันว่ากินยาแล้ววันนี้' : 'ยังไม่มีการยืนยันวันนี้'}</div>${taken ? button('undo-dose', 'ยกเลิกการยืนยันที่กดผิด', 'history', 'button outline', `data-id="${schedule.id}"`) : button('dose', 'กินยาแล้ว', 'check', 'button primary', `data-id="${schedule.id}"`)}${!taken && schedule.id === 'morning' ? button('snooze', state.snooze && state.snooze > Date.now() ? `เลื่อนถึง ${time(state.snooze)} น.` : 'เตือนอีกครั้งใน 10 นาที', 'clock', 'text-button snooze-button') : ''}</section>`;
  }).join('')}</div><section class="glass medication-history"><div class="section-heading"><h2>การกินยาที่คุณบันทึก</h2>${icon('history')}</div>${state.events.filter(e => e.kind === 'dose').length ? state.events.filter(e => e.kind === 'dose').slice().reverse().map(eventRow).join('') : '<p class="muted">เมื่อกด “กินยาแล้ว” รายการจะมาอยู่ตรงนี้ค่ะ</p>'}</section><p class="privacy-note">${icon('clock')} การเลื่อนเตือนทำงานขณะเปิดเว็บนี้ไว้ การแจ้งเตือนเมื่อปิดแอปต้องเชื่อมระบบเพิ่มเติม</p></div>`;
}
function careView() {
  const active = state.sharing.logs || state.sharing.medication;
  return `<div class="full-page modern-page care-page">${pageHeading('ให้ความห่วงใย อยู่ใกล้กัน', 'คุณเลือกได้ ว่าอยากให้ใครเห็นอะไรบ้าง', button('phone-settings', 'ตั้งเวลาให้อุ่นใจโทรหา', 'phone', 'button outline'))}<div class="care-layout"><section class="glass consent-panel"><div class="family-person large"><span class="avatar peach">พ</span><div><h2>พิมพ์ · ลูกสาว</h2><span>ตัวอย่างคนดูแลของคุณ</span></div><span class="source demo">โหมดทดลอง</span></div><p>ลองเลือกข้อมูลที่อยากแบ่งปัน<br>เพื่อดูตัวอย่างหน้าจอของคนดูแล</p><label class="toggle-row"><span><strong>บันทึกสุขภาพและอาการ</strong><small>ค่าที่วัดได้ อาการ และเวลาที่บันทึก</small></span><input type="checkbox" role="switch" data-setting="logs" ${state.sharing.logs ? 'checked' : ''}><span class="toggle-ui"></span></label><label class="toggle-row"><span><strong>การยืนยันกินยา</strong><small>ดูได้ว่าวันนี้ยืนยันมื้อไหนแล้ว</small></span><input type="checkbox" role="switch" data-setting="medication" ${state.sharing.medication ? 'checked' : ''}><span class="toggle-ui"></span></label><div class="consent-note">${icon('shield')}<p>สวิตช์นี้เปลี่ยนเฉพาะภาพตัวอย่าง<br>ยังไม่เชื่อมบัญชีหรือส่งข้อมูลให้บุคคลอื่น</p></div></section><section class="glass caregiver-preview"><div class="section-heading"><h2>ตัวอย่างฝั่งคนดูแล</h2>${icon('users')}</div><div class="preview-person"><span class="avatar">ส</span><div><strong>วันนี้ของคุณแม่สมใจ</strong><small>${thaiDate()}</small></div></div>${!active ? `<div class="empty-state">${icon('shield')}<h3>พื้นที่ส่วนตัวของคุณแม่</h3><p>ข้อมูลจะปรากฏเมื่อคุณแม่เลือกแบ่งปัน</p></div>` : `${state.sharing.medication ? `<div class="care-summary"><h3>เรื่องยาในวันนี้</h3>${schedules.map(s => `<div>${s.name}<span>${doseTaken(state.events, s.id) ? 'ยืนยันแล้ว' : 'ยังไม่มีบันทึก'}</span></div>`).join('')}</div>` : ''}${state.sharing.logs ? `<div class="care-summary"><h3>บันทึกสุขภาพล่าสุด</h3>${state.events.filter(e => ['bloodPressure', 'temperature', 'symptom'].includes(e.kind)).sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt)).slice(0, 3).map(e => `<div><span>${labels[e.kind]}<small>${sourceLabel(e)}</small></span><strong>${esc(describe(e))}</strong></div>`).join('')}</div>` : ''}`}</section></div><section class="doctor-banner glass"><span class="round-icon">${icon('file')}</span><div><h2>เรื่องราวระหว่างนัด ให้คุณหมอเห็นภาพ</h2><p>รวมยา อาการ และค่าที่วัดในรายงานเดียว</p></div>${button('report', 'ดูตัวอย่างรายงาน', 'arrow', 'button primary')}</section></div>`;
}

function recordDialog(kind = 'bloodPressure', options = {}) {
  const attachment = options.image || ui.attachment;
  const editing = options.editing || null;
  const payload = options.payload || {};
  const source = options.source || 'manual';
  showDialog('record', `${modalHeader(editing ? 'แก้ไขบันทึก' : 'บันทึกสุขภาพ', 'จดค่าจากเครื่องวัด หรือเล่าอาการของคุณค่ะ', 'heart')}<form id="record-form" class="record-form"><label class="field-label" for="record-kind">อยากบันทึกเรื่องอะไรคะ</label><select id="record-kind" name="kind">${Object.entries(labels).filter(([key]) => !['dose', 'call'].includes(key)).map(([key, label]) => `<option value="${key}" ${key === kind ? 'selected' : ''}>${label}</option>`).join('')}</select><div id="record-fields">${recordFields(kind, payload)}</div>${attachment ? `<div class="attachment-preview"><img src="${attachment}" alt="ภาพที่จะแนบในบันทึก"><span>${icon('image')} แนบภาพนี้กับบันทึก</span></div>` : button('camera', 'เปิดกล้องสด / ถ่ายภาพแนบ', 'camera', 'button outline camera-record')}<div class="form-note">${icon('info')}<span>${source === 'voice' ? 'ตรวจข้อความที่ได้ยิน แล้วกดยืนยันค่ะ' : 'คุณเป็นผู้กรอกค่า กล้องไม่ได้วัดไข้หรือความดัน'}</span></div><p id="form-error" class="form-error" role="alert"></p><button class="button primary full" type="submit">${icon('check')} ยืนยันบันทึก</button></form>`, 'record-modal');
  ui.attachment = attachment;
  ui.editing = editing;
  ui.source = source;
}
function recordFields(kind, payload = {}) {
  if (kind === 'bloodPressure') return `<div class="field-pair"><label>ค่าบน <span>mmHg</span><input name="systolic" type="number" inputmode="numeric" min="40" max="300" step="1" required placeholder="เช่น 128" value="${esc(payload.systolic || '')}"></label><label>ค่าล่าง <span>mmHg</span><input name="diastolic" type="number" inputmode="numeric" min="20" max="200" step="1" required placeholder="เช่น 78" value="${esc(payload.diastolic || '')}"></label></div><p class="field-help">ดูตัวเลขจากเครื่องวัดความดันของคุณค่ะ</p>`;
  if (kind === 'temperature') return `<label class="field-label">อุณหภูมิจากเครื่องวัด <span>°C</span><input name="value" type="number" inputmode="decimal" min="25" max="45" step="0.1" required placeholder="เช่น 36.5" value="${esc(payload.value || '')}"></label>`;
  return `<label class="field-label">${kind === 'photo' ? 'รายละเอียดภาพ' : 'วันนี้รู้สึกอย่างไรบ้าง'}<textarea name="text" rows="4" maxlength="1000" required placeholder="${kind === 'photo' ? 'เช่น หน้าจอเครื่องวัดหลังตื่นนอน' : 'เช่น รู้สึกเวียนหัวเล็กน้อยหลังตื่นนอน'}">${esc(payload.text || '')}</textarea></label>`;
}
function saveRecord(form) {
  const data = new FormData(form);
  const kind = data.get('kind');
  let payload;
  if (kind === 'bloodPressure') {
    payload = { systolic: Number(data.get('systolic')), diastolic: Number(data.get('diastolic')) };
    if (payload.systolic <= payload.diastolic) {
      document.querySelector('#form-error').textContent = 'ตรวจอีกครั้งค่ะ ค่าบนควรมากกว่าค่าล่าง';
      return;
    }
  } else if (kind === 'temperature') payload = { value: Number(data.get('value')) };
  else payload = { text: String(data.get('text')).trim() };
  if (payload.text !== undefined && !payload.text) return;
  if (kind === 'photo' && !ui.attachment) {
    document.querySelector('#form-error').textContent = 'เพิ่มภาพจากกล้องก่อนบันทึกภาพนะคะ';
    return;
  }
  if (ui.attachment) payload.image = ui.attachment;
  if (ui.editing) {
    const index = state.events.findIndex(e => e.id === ui.editing);
    if (index >= 0) state.events[index] = { ...state.events[index], kind, payload, editedAt: new Date().toISOString() };
    saveState();
  } else addEvent(newEvent(kind, payload, ui.source));
  closeDialog();
  render();
  toast('บันทึกแล้วค่ะ เปิดดูได้ในสมุดสุขภาพ');
}

const voice = new VoiceSession((phase, message) => {
  const status = document.querySelector('#voice-status');
  if (status) {
    status.textContent = phase === 'transcribing' ? 'กำลังฟังค่ะ พูดต่อได้เลย' : message;
    status.dataset.phase = phase;
  }
  document.querySelectorAll('.voice-sphere,.sound-wave').forEach(sphere => { sphere.dataset.state = phase === 'transcribing' ? 'listening' : phase; });
  const toggle = document.querySelector('[data-action="voice-toggle"]');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(voice.active));
    toggle.setAttribute('aria-label', voice.active ? 'พักไมโครโฟน' : 'เปิดไมโครโฟน');
    toggle.querySelector('span').textContent = voice.active ? 'พักไมค์' : 'เปิดไมค์';
    toggle.classList.toggle('mic-active', voice.active);
  }
}, text => {
  if (ui.dialog === 'phone') return phoneExperience.hear(text);
  if (ui.dialog !== 'voice') return;
  return processVoice(text);
}, level => document.querySelectorAll('.voice-sphere,.sound-wave').forEach(sphere => sphere.style.setProperty('--level', level)));
phoneExperience = createPhoneExperience({ state, modal, showDialog, closeDialog, voice, persist: saveState, render, toast });

function voiceDialog({ listen = true } = {}) {
  if (ui.dialog === 'voice' && modal.open) { if (listen) voice.listen(); return; }
  ui.conversationId = (ui.conversationId || 0) + 1;
  showDialog('voice', `<header class="conversation-header"><div><h2 id="modal-title">อุ่นใจ</h2><span>ผู้ช่วยสุขภาพ</span></div><span class="conversation-presence"><i></i> อยู่ในสาย</span></header><div class="conversation-shell">${conversationStageMarkup(orb())}<div class="stage-controls" aria-label="ควบคุมการสนทนา">${button('voice-toggle', 'พักไมค์', 'mic', 'stage-control mic-control', 'aria-label="พักไมโครโฟน" aria-pressed="true"')}${button('camera-toggle', 'กล้อง', 'camera', 'stage-control', 'aria-label="เปิดกล้องในบทสนทนา" aria-pressed="false"')}${button('session-end', 'วางสาย', 'phone', 'stage-control end-control', 'aria-label="จบการคุย"')}</div></div>`, 'voice-modal conversation-modal immersive-conversation');
  ui.stage = new ConversationStage(document.querySelector('#conversation-stage'), { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  if (listen) voice.listen();
}

function sessionReply(message) {
  ui.lastSpoken = message;
  voice.speak(message);
}
function confirmVoiceRecord() {
  const pending = ui.pending;
  if (!pending?.kind) { sessionReply('ยังไม่มีรายการรอยืนยันค่ะ บอกสิ่งที่อยากบันทึกได้เลย'); return; }
  if (pending.kind === 'bloodPressure') {
    const { systolic, diastolic } = pending.payload;
    if (!Number.isInteger(systolic) || !Number.isInteger(diastolic) || systolic < 40 || systolic > 300 || diastolic < 20 || diastolic > 200 || systolic <= diastolic) {
      sessionReply('ค่าที่ได้ยินยังไม่ถูกต้องค่ะ บอกค่าบนและค่าล่างจากเครื่องวัดอีกครั้งนะคะ'); return;
    }
  }
  if (pending.kind === 'temperature' && (!Number.isFinite(pending.payload.value) || pending.payload.value < 25 || pending.payload.value > 45)) {
    sessionReply('ขอตรวจตัวเลขอุณหภูมิอีกครั้งค่ะ บอกค่าจากเครื่องวัดได้เลย'); return;
  }
  ui.pending = null;
  ui.awaitingKind = null;
  if (pending.kind === 'dose') takeDose(pending.payload.scheduleId, 'voice');
  else addEvent(newEvent(pending.kind, pending.payload, 'voice'));
  sessionReply('บันทึกเรียบร้อยแล้วค่ะ คุยต่อได้เลย');
}
async function processVoice(text) {
  text = text.trim();
  if (!text || ui.dialog !== 'voice') return;
  let intent = interpret(text);
  if (intent.tool) {
    if (['camera.open', 'camera.switch'].includes(intent.tool)) dispatchVoiceTool(intent);
    else await dispatchVoiceTool(intent);
    return;
  }
  if (intent.action === 'confirm') { confirmVoiceRecord(); return; }
  if (intent.action === 'cancel-record') { ui.pending = null; ui.awaitingKind = null; sessionReply('ยกเลิกรายการที่รอบันทึกแล้วค่ะ'); return; }
  if (ui.awaitingKind && intent.action === 'unknown' && /[0-9๐-๙]/.test(text)) intent = interpret(`${ui.awaitingKind === 'temperature' ? 'อุณหภูมิ' : 'ความดัน'} ${text}`);
  if (intent.action === 'record') {
    ui.awaitingKind = intent.kind;
    sessionReply(intent.kind === 'bloodPressure' ? 'บอกค่าบนและค่าล่างจากเครื่องวัดได้เลยค่ะ เช่น ความดัน 128 ต่อ 78' : 'บอกอุณหภูมิจากเครื่องวัดได้เลยค่ะ เช่น 36.5 องศา');
    return;
  }
  if (intent.action === 'dose' || (ui.awaitingDose && /เช้า|เย็น/.test(text))) {
    const schedule = /เช้า/.test(text) ? schedules[0] : /เย็น/.test(text) ? schedules[1] : null;
    if (!schedule) {
      ui.awaitingDose = true;
      sessionReply('เป็นยามื้อเช้าหรือมื้อเย็นคะ บอกได้เลยค่ะ');
    } else stageDose(schedule.id);
    return;
  }
  if (intent.kind && intent.payload) {
    ui.pending = intent;
    ui.awaitingKind = null;
    sessionReply(`ได้ยินว่า ${describe({ kind: intent.kind, payload: intent.payload })} ถ้าถูกต้อง พูดว่า ยืนยัน ได้เลยค่ะ`);
    return;
  }
  if (ui.stage?.cameraRequested) { answerCamera(text); return; }
  sessionReply('ฉันช่วยจดอาการ บันทึกความดัน อุณหภูมิ และเปิดกล้องได้ค่ะ ลองพูดว่า เปิดกล้องหลัง หรือบอกอาการของคุณได้เลย');
}
function stageDose(id) {
  const schedule = schedules.find(s => s.id === id);
  if (!schedule) return;
  ui.awaitingDose = false;
  ui.pending = { kind: 'dose', payload: { scheduleId: id, name: schedule.name } };
  sessionReply(`จะบันทึกว่า กิน${schedule.name}แล้ววันนี้ ถูกต้องไหมคะ ถ้าถูกต้อง พูดว่า ยืนยัน`);
}
const voiceToolHandlers = {
  'camera.open': async ({ facing }) => {
    cameraDialog(); ui.cameraMode = facing; ui.deviceId = '';
    await startCamera();
    if (ui.cameraPhase !== 'live') throw new Error('ยังเปิดกล้องไม่ได้ ตรวจสิทธิ์กล้องแล้วลองอีกครั้งค่ะ');
    return ui.activeFacing && ui.activeFacing !== facing ? 'เปิดกล้องที่อุปกรณ์นี้รองรับแล้วค่ะ พูดต่อได้เลย' : 'เปิดกล้องแล้วค่ะ คุยต่อได้เลย ไม่ต้องกดสลับโหมด';
  },
  'camera.close': () => { hideSessionCamera(); return 'ปิดกล้องแล้วค่ะ เรายังคุยกันต่อได้'; },
  'conversation.end': () => { dismissDialog(); return 'จบการคุยแล้วค่ะ'; },
  'camera.switch': async () => {
    cameraDialog();
    ui.cameraMode = ui.cameraMode === 'user' ? 'environment' : 'user';
    const devices = ui.cameraDevices || [];
    ui.deviceId = !ui.activeFacing && devices.length > 1 ? devices[(devices.findIndex(device => device.deviceId === ui.activeDeviceId) + 1) % devices.length].deviceId : '';
    await startCamera();
    if (ui.cameraPhase !== 'live') throw new Error('ยังสลับกล้องไม่ได้ค่ะ');
    return 'เปลี่ยนกล้องแล้วค่ะ พูดต่อได้เลย';
  },
  'camera.capture': async () => {
    if (ui.dialog !== 'voice' || ui.cameraPhase !== 'live') throw new Error('บอกว่า เปิดกล้อง ก่อนถ่ายภาพนะคะ');
    const photo = camera.capture(document.querySelector('#camera-video'));
    if (!photo) throw new Error('ภาพยังไม่พร้อม ลองอีกครั้งค่ะ');
    previewPhoto(photo); return 'ถ่ายภาพแล้วค่ะ กล้องยังเปิดอยู่ และคุยต่อได้เลย';
  },
  'history.open': () => { navigateTool('history'); return 'เปิดสมุดสุขภาพแล้วค่ะ'; },
  'care.open': () => { navigateTool('care'); return 'เปิดหน้าคนดูแลแล้วค่ะ'; },
  'medication.open': () => { navigateTool('medication'); return 'เปิดแผนยาแล้วค่ะ'; },
  'today.open': () => { navigateTool('today'); return 'กลับหน้าวันนี้แล้วค่ะ'; },
  'report.preview': () => { reportDialog(); return 'เปิดสรุปให้คุณหมอแล้วค่ะ ยังไม่มีการส่งข้อมูล'; },
};
function navigateTool(destination) {
  closeDialog();
  history.pushState(null, '', `#${destination}`);
  ui.route = destination;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
async function dispatchVoiceTool(call) {
  const requestId = ui.toolRequest = (ui.toolRequest || 0) + 1;
  const conversationId = ui.conversationId;
  const definition = toolDefinitions[call.tool];
  const cameraOpening = ['camera.open', 'camera.switch'].includes(call.tool);
  if (cameraOpening) voice.speak(call.tool === 'camera.switch' ? 'สลับกล้องให้ค่ะ' : 'เปิดกล้องให้นะคะ');
  else voice.pause();
  try {
    const result = await executeTool(call, voiceToolHandlers);
    if (requestId !== ui.toolRequest) return;
    if (['camera', 'capture'].includes(definition.effect) && (ui.dialog !== 'voice' || conversationId !== ui.conversationId)) return;
    if (call.tool === 'conversation.end') { toast(result); return; }
    if (cameraOpening) return;
    ui.lastSpoken = result;
    if (ui.dialog !== 'voice') toast(result);
    voice.speak(result);
  } catch (error) {
    if (ui.dialog !== 'voice' || requestId !== ui.toolRequest || conversationId !== ui.conversationId) return;
    voice.speak(error.message);
  }
}
function cameraDialog() {
  if (ui.dialog !== 'voice') voiceDialog();
}
function syncCameraControl() {
  const toggle = document.querySelector('[data-action="camera-toggle"]');
  if (!toggle) return;
  const active = ui.stage?.cameraRequested || false;
  toggle.setAttribute('aria-pressed', String(active));
  toggle.setAttribute('aria-label', active ? 'ปิดกล้อง คุยต่อ' : 'เปิดกล้องในบทสนทนา');
}
function hideSessionCamera() {
  const frame = ui.cameraPhase === 'live' ? camera.capture(document.querySelector('#camera-video')) : null;
  camera.stop();
  ui.cameraPhase = 'closed';
  ui.stage?.closing(frame);
  syncCameraControl();
}
async function startCamera() {
  const stage = ui.stage;
  if (!stage || ui.cameraPhase === 'requesting') return;
  ui.cameraPhase = 'requesting';
  stage.requesting();
  syncCameraControl();
  try {
    const result = await camera.open(stage.video, { facing: ui.cameraMode, deviceId: ui.deviceId || '' });
    if (!result || ui.dialog !== 'voice' || ui.stage !== stage || !stage.cameraRequested) return;
    ui.cameraPhase = 'live';
    ui.activeFacing = result.settings.facingMode || null;
    ui.activeDeviceId = result.settings.deviceId;
    ui.cameraDevices = result.devices;
    stage.live({ canSwitch: result.devices.length > 1 });
    syncCameraControl();
  } catch (error) {
    if (ui.dialog !== 'voice' || ui.stage !== stage || !stage.cameraRequested) return;
    ui.cameraPhase = 'error';
    stage.error(error.name === 'NotAllowedError' ? 'ยังไม่ได้อนุญาตกล้อง · แตะกล้องเพื่อลองใหม่' : 'กล้องยังไม่พร้อม · แตะกล้องเพื่อลองใหม่');
    syncCameraControl();
  }
}
function previewPhoto(photo) {
  if (!photo) return;
  ui.attachment = photo;
  if (ui.recordDraft) ui.recordDraft.image = photo;
  else addEvent(newEvent('photo', { text: 'ภาพจากบทสนทนา', image: photo }, 'voice'));
  document.querySelector('#capture-preview').hidden = false;
  document.querySelector('#captured-photo').src = photo;
}

function answerCamera(text) {
  let message;
  if (ui.cameraScene === 'medicine') message = 'สถานการณ์ตัวอย่างคือฉลากยาค่ะ ระบบจริงจะอ่านข้อความให้ตรวจทาน และไม่เดาชื่อยาหรือวิธีใช้จากภาพ';
  else if (ui.cameraScene === 'monitor') message = 'สถานการณ์ตัวอย่างคือเครื่องวัดความดันค่ะ บอกค่าบนและค่าล่างจากเครื่องวัด แล้วฉันจะอ่านทวนก่อนบันทึกให้';
  else if (ui.cameraScene === 'food') message = 'สถานการณ์ตัวอย่างคืออาหารค่ะ ระบบจริงจะช่วยอธิบายสิ่งที่เห็น และให้คุณตรวจทานก่อนบันทึกมื้ออาหาร';
  else message = 'เราคุยพร้อมกล้องอยู่ในสายเดียวกันค่ะ แต่ต้นแบบยังไม่เชื่อมโมเดลเข้าใจภาพ จึงยังระบุสิ่งที่ถือให้ไม่ได้ คุณบอกสิ่งที่อยากบันทึกต่อได้เลย';
  sessionReply(message);
}

function reportDialog() {
  const since = new Date(`${dateKey()}T00:00:00+07:00`).getTime() - 6 * 86400000;
  const events = state.events.filter(e => Date.parse(e.occurredAt) >= since).sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt));
  showDialog('report', `${modalHeader('สรุปสุขภาพให้คุณหมอ', 'ดูตัวอย่างก่อนพิมพ์หรือบันทึก PDF', 'file')}<div class="report-paper" id="report-paper"><div class="report-brand">${logo}<strong>อุ่นใจ</strong><span>สมุดบันทึกระหว่างนัด</span></div><div class="report-heading"><div><h3>รายงานสุขภาพ 7 วันล่าสุด</h3><p>คุณสมใจ · บุคคลตัวอย่าง</p></div><span>จัดทำ ${thaiDate()}</span></div><p class="report-disclaimer">รายงานทดลอง มีข้อมูลตัวอย่างปะปนตามป้ายกำกับ<br>ข้อมูลจากผู้ใช้ ไม่ใช่ผลวินิจฉัยหรือข้อมูลที่แพทย์ตรวจสอบแล้ว</p><div class="report-stats"><div><strong>${events.filter(e => e.kind === 'dose').length}</strong><span>การยืนยันกินยา</span></div><div><strong>${events.filter(e => e.kind === 'symptom').length}</strong><span>บันทึกอาการ</span></div><div><strong>${events.filter(e => ['bloodPressure', 'temperature'].includes(e.kind)).length}</strong><span>บันทึกค่าวัด</span></div></div><table><thead><tr><th>วันและเวลา</th><th>เรื่องที่บันทึก</th><th>รายละเอียด</th><th>แหล่งข้อมูล</th></tr></thead><tbody>${events.map(e => `<tr><td>${thaiDate(new Date(e.occurredAt), { year: undefined, month: 'short' })}<br>${time(e.occurredAt)} น.</td><td>${labels[e.kind]}</td><td>${esc(describe(e))}</td><td>${sourceLabel(e)}</td></tr>`).join('')}</tbody></table><p class="fine-print">วันที่ไม่มีบันทึก ไม่ได้แปลว่าไม่ได้กินยา รายงานนี้ไม่แนะนำให้ปรับยา</p></div><div class="report-actions">${button('print', 'พิมพ์ / บันทึก PDF', 'download', 'button primary')}<span>ยังไม่มีการส่งรายงานออกจากเครื่อง</span></div>`, 'report-modal');
}

function scheduleSnooze() {
  clearTimeout(ui.snoozeTimer);
  if (!state.snooze) return;
  const delay = state.snooze - Date.now();
  if (delay <= 0) {
    state.snooze = null;
    saveState();
    toast('ถึงเวลาที่เลื่อนเตือนไว้ค่ะ ตรวจแผนยาของคุณอีกครั้ง');
    render();
    return;
  }
  ui.snoozeTimer = setTimeout(scheduleSnooze, Math.min(delay, 2147483647));
}
function takeDose(id, source = 'manual') {
  const schedule = schedules.find(s => s.id === id);
  if (!schedule || doseTaken(state.events, id)) return;
  addEvent(newEvent('dose', { scheduleId: id, dateKey: dateKey(), name: schedule.name }, source));
  if (id === 'morning') { state.snooze = null; clearTimeout(ui.snoozeTimer); saveState(); }
  toast(`จดไว้แล้วค่ะ ว่ากิน${schedule.name}แล้ว`);
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const { action, id, kind } = target.dataset;
  if (phoneExperience.action(action)) return;
  if (action === 'close') dismissDialog();
  else if (action === 'voice') voiceDialog();
  else if (action === 'camera') {
    ui.recordDraft = null;
    if (ui.dialog === 'record') {
      const form = new FormData(document.querySelector('#record-form'));
      ui.recordDraft = { kind: form.get('kind'), payload: Object.fromEntries(form), editing: ui.editing, source: ui.source, image: ui.attachment };
    }
    cameraDialog();
    await dispatchVoiceTool({ tool: 'camera.open', args: { facing: ui.cameraMode } });
  }
  else if (action === 'record') recordDialog(kind || 'bloodPressure');
  else if (action === 'report') reportDialog();
  else if (action === 'dose') takeDose(id);
  else if (action === 'undo-dose') {
    state.events = state.events.filter(e => !(e.kind === 'dose' && e.payload.scheduleId === id && e.payload.dateKey === dateKey()));
    saveState(); render(); toast('ยกเลิกการยืนยันแล้วค่ะ');
  } else if (action === 'snooze') {
    state.snooze = Date.now() + 600000; saveState(); scheduleSnooze(); render(); toast('จะเตือนอีกครั้งใน 10 นาที ขณะเปิดเว็บนี้ไว้ค่ะ');
  } else if (action === 'activity') {
    const key = `${dateKey()}-${id}`; state.activities[key] = !state.activities[key]; saveState(); render();
    toast(state.activities[key] ? 'ทำเครื่องหมายเรียบร้อยแล้วค่ะ' : 'ยกเลิกเครื่องหมายแล้วค่ะ');
  } else if (action === 'large-text') { state.largeText = !state.largeText; saveState(); render(); }
  else if (action === 'filter') { ui.filter = kind; render(); }
  else if (action === 'edit') {
    const entry = state.events.find(e => e.id === id);
    if (entry && !entry.isDemo) recordDialog(entry.kind, { payload: entry.payload, image: entry.payload.image, editing: id });
  } else if (action === 'listen' || action === 'camera-listen') voice.listen();
  else if (action === 'voice-toggle') { if (voice.active) voice.stop(); else voice.listen(); }
  else if (action === 'voice-stop') voice.stop();
  else if (action === 'session-end') dismissDialog();
  else if (action === 'camera-toggle') await dispatchVoiceTool({ tool: ui.stage?.cameraRequested ? 'camera.close' : 'camera.open', args: { facing: ui.cameraMode } });
  else if (action === 'camera-close') await dispatchVoiceTool({ tool: 'camera.close', args: {} });
  else if (action === 'voice-repeat' || action === 'camera-read') voice.speak(ui.lastSpoken || 'วันนี้รู้สึกอย่างไรบ้างคะ');
  else if (action === 'camera-switch') await dispatchVoiceTool({ tool: 'camera.switch', args: {} });
  else if (action === 'print') window.print();
  else if (action === 'profile') showDialog('profile', `${modalHeader('พื้นที่ของคุณสมใจ', 'โปรไฟล์ตัวอย่างสำหรับทดลองใช้งาน', 'users')}<div class="simple-modal"><span class="avatar big">ส</span><h3>คุณสมใจ</h3><p>แผนสุขภาพและคนดูแลในต้นแบบนี้เป็นตัวอย่าง<br>การใช้งานจริงต้องมีบัญชีและแผนจากทีมดูแล</p>${button('large-text', state.largeText ? 'ใช้ตัวอักษรขนาดปกติ' : 'ขยายตัวอักษรให้อ่านง่าย', 'plus', 'button outline')}</div>`);
  else if (action === 'about') showDialog('about', `${modalHeader('อุ่นใจ อยู่ข้าง ๆ ในทุกวัน', 'ต้นแบบผลิตภัณฑ์สำหรับสังคมสูงวัย', 'leaf')}<div class="simple-modal"><p>ช่วยจดการกินยา อาการ และค่าจากเครื่องวัด ระหว่างนัดพบแพทย์ ผ่านการแตะ เสียง และกล้องสด</p><p>กล้องและการบันทึกใช้ความสามารถของเบราว์เซอร์ คำตอบเสียงเป็นบทสาธิต ระบบเข้าใจวิดีโอสด OCR การเชื่อมเครื่องวัด และการแจ้งคนดูแล ยังไม่ได้เชื่อมบริการจริง</p><a class="button outline" href="./PRODUCT.md" target="_blank" rel="noopener">อ่านขอบเขตและแนวทางพัฒนา ${icon('arrow')}</a></div>`);
});
document.addEventListener('submit', event => {
  if (event.target.id === 'phone-plan-form') { event.preventDefault(); phoneExperience.savePlan(event.target); }
  if (event.target.id === 'record-form') { event.preventDefault(); saveRecord(event.target); }
});
document.addEventListener('change', async event => {
  if (event.target.id === 'record-kind') document.querySelector('#record-fields').innerHTML = recordFields(event.target.value);
  if (event.target.dataset.setting) { state.sharing[event.target.dataset.setting] = event.target.checked; saveState(); render(); }

});
modal.addEventListener('cancel', event => { event.preventDefault(); dismissDialog(); });
modal.addEventListener('click', event => { if (event.target === modal && event.offsetX >= modal.clientWidth) closeDialog(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { camera.stop(); voice.stop(); if (ui.dialog === 'voice') hideSessionCamera(); }
  else scheduleSnooze();
});
window.addEventListener('pagehide', () => { camera.stop(); voice.stop(); });
function route() {
  const next = window.location.hash.slice(1);
  if (next === 'content') { document.querySelector('#content').focus(); return; }
  ui.route = nav.some(([key]) => key === next) ? next : 'today';
  ui.recordDraft = null;
  closeDialog(); render();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}
history.scrollRestoration = 'manual';
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
route();
scheduleSnooze();
