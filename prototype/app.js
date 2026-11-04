import {tr,html,getLanguage,setLanguage,intlLocale} from './i18n.js';
import {settingsMarkup,settingsCopy} from './settings-view.js';
import {journalEntries,journalDays} from './history-journal.js';
import {durableToolResult} from './tool-execution.js';
import {ToolActivity} from './tool-activity.js';
import {actionPresentation,activityLocation,activityResultMessage} from './action-presentation.js';
import {authorizeProposal,proposeAction,observationTime} from './action-proposals.js';
import {calendarPageMarkup,calendarFormMarkup,normalizeCalendarPlan,validCalendarDate,shiftDate,shiftMonth} from './care-calendar.js';
import {interfaceSnapshot,storedSummaryList,storedSummaryRead} from './voice-ui-context.js';
import {audioProfileLabels} from './audio-input.js';
import { WorkspaceClient } from './workspace-client.js';
import { familyDashboardMarkup, briefMarkup, summaryArchiveMarkup, alertMarkup } from './family-experience.js';
import { mascotIconMarkup, mascotStageMarkup, setMascotState } from './mascot.js';
import { loadAppCommandCatalog, validateAppAction, authorizeAppAction, requiresSpokenConfirmation, isExplicitAppConfirmation, rejectsProposal } from './app-commands.js';
import { RealtimeVoiceSession } from './realtime-client.js';
import { mealJournalMarkup, summaryTeaserMarkup, summaryPageMarkup, mealEstimateMarkup } from './luklaan-workflows.js';
import { normalizeObservation, summarizeHealth, renderPhysicianSummary, renderTrackingOverview, isExplicitConfirmation } from './health-tracking.js';
import { icon, logo } from './icons.js';
import { readState, persist, newEvent, latest, doseTaken, schedules, labels, eventIcon, dateKey, thaiDate, time, escapeHTML as esc, describe } from './data.js';
import { CameraSession, photoFromFile } from './media.js';
import { toolDefinitions, executeTool } from './voice-tools.js';
import { createPhoneExperience } from './phone-calls.js';
import { ConversationStage, conversationStageMarkup } from './conversation-stage.js';

const state = readState();
setLanguage(state.language || getLanguage());
const ui = { route: 'today', filter: 'all', dialog: null, attachment: null, editing: null, source: 'manual', cameraMode: 'environment', cameraPhase: 'closed', pending: null, snoozeTimer: null };
const conversationModal = document.querySelector('#modal');
const panelModal = document.querySelector('#panel-modal');
const toolActivity = new ToolActivity();
function placeToolActivity(){toolActivity.attachTo(panelModal.open?panelModal:conversationModal.open?conversationModal:document.body);}
let modal = conversationModal;
const camera = new CameraSession();
let phoneExperience;
let workspace;
const nav = [
  ['today', 'home', 'วันนี้'], ['history', 'heart', 'บันทึกสุขภาพ'], ['calendar','calendar','ปฏิทินดูแลกัน'], ['medication', 'pill', 'ยาของฉัน'], ['care', 'users', 'คนที่เรารัก'], ['summary', 'file', 'สรุปให้แพทย์'],
];
let toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = message;
  document.querySelector('#toast').classList.add('visible');
  toastTimer = setTimeout(() => document.querySelector('#toast').classList.remove('visible'), 4500);
}
function saveState() {
  if (!persist(state)) toast(tr('พื้นที่บันทึกในเครื่องไม่พร้อมค่ะ'));
  workspace?.queue();
}
function addEvent(event) {
  state.events.push(event);
  saveState();
  render();
}
function sourceLabel(event) {
  return event.isDemo ? tr('ข้อมูลตัวอย่าง') : ['voice','speech'].includes(event.source) ? tr('คุณยืนยันผ่านผู้ช่วย') : event.source==='camera'?tr('ภาพที่คุณยืนยัน'):tr('คุณบันทึกเอง');
}
function button(action, text, glyph, cls = 'button', attrs = '') {
  return `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${['voice','meal-talk','glucose-talk','voice-repeat','camera-read','listen','camera-listen'].includes(action) ? mascotIconMarkup() : glyph ? icon(glyph) : ''}<span>${text}</span></button>`;
}
function showDialog(kind, body, className = '') {
  if (ui.voicePresentation && !['voice','phone'].includes(kind)) {
    minimizeConversation();
    toolActivity.attachTo(document.body);
    if(panelModal.open) panelModal.close();
    modal=panelModal;
    body=body.replaceAll('id="modal-title"','id="panel-title"');
  } else {
    if (modal.open || ui.voicePresentation) endConversation();
    modal=conversationModal;
  }
  ui.dialog = kind;
  modal.className = className;
  toolActivity.attachTo(document.body);
  modal.innerHTML = body;
  modal.showModal();
  placeToolActivity();
  document.body.classList.add('dialog-open');
}
function closeDialog() {
  if(modal===panelModal) {
    toolActivity.attachTo(document.body);
    if(panelModal.open) panelModal.close();
    panelModal.innerHTML='';
    modal=conversationModal; ui.dialog=ui.voicePresentation?'voice':null;
    if(ui.pendingHealthSource==='form') { ui.pendingHealth=null;ui.pendingHealthSource=null; }
    document.body.classList.remove('dialog-open');
    updateVoiceDock();
    return;
  }
  endConversation();
}
function endConversation() {
  ui.voicePresentation=null;
  clearTimeout(ui.mascotTimer);ui.mascotSuccessUntil=0;
  ui.stage?.destroy();
  ui.stage = null;
  if(ui.pendingActivityId)toolActivity.finish(ui.pendingActivityId,{status:'cancelled',message:tr('จบสายแล้ว ยกเลิกรายการที่ยังไม่ยืนยัน')});
  ui.pendingActivityId=null;
  ui.pendingAppAction=null; ui.pendingHealth=null; ui.pendingHealthSource=null; ui.lastUserTranscript=''; ui.transcriptTurn=null; ui.savedTurn=null; ui.audioTurnId=null;
  phoneExperience?.stop();
  camera.stop();
  voice.stop();
  ui.voicePhase='idle';ui.voiceMessage='';setMascotState('idle');
  ui.cameraPhase = 'closed';
  ui.dialog = null;
  ui.pending = null;
  ui.awaitingKind = null;
  ui.awaitingDose = false;
  ui.attachment = null;
  ui.editing = null;
  toolActivity.attachTo(document.body);
  for(const dialog of [conversationModal,panelModal]) if(dialog.open) dialog.close();
  panelModal.innerHTML=''; modal=conversationModal;
  document.body.classList.remove('dialog-open');
  updateVoiceDock();
}
function minimizeConversation() {
  if(!ui.voicePresentation) return;
  if(conversationModal.open) conversationModal.close();
  ui.voicePresentation='docked';
  document.body.classList.remove('dialog-open');
  updateVoiceDock();
  placeToolActivity();
}
function updateVoiceDock() {
  const dock=document.querySelector('#voice-dock');
  if(!dock) return;
  dock.hidden=ui.voicePresentation!=='docked';
  if(dock.hidden) {dock.dataset.view='';return;}
  const viewKey=JSON.stringify([ui.voicePhase,ui.voiceMessage,voice.active,voice.inputMuted,ui.stage?.cameraRequested]);
  if(dock.dataset.view===viewKey)return;
  dock.dataset.view=viewKey;
  dock.innerHTML=html`<button type="button" class="voice-dock-return" data-action="voice" aria-label="กลับหน้าคุยกับลูกหลาน">${orb('dock-mascot')}<span><strong>ลูกหลานอยู่ข้าง ๆ</strong><small>${esc(ui.voiceMessage || tr('พูดสั่งการต่อได้เลย'))}${ui.stage?.cameraRequested?tr(' · กล้องเปิดอยู่'):''}</small></span></button><button type="button" class="icon-button" data-action="voice-toggle" aria-label="${voice.active?tr('พักไมโครโฟน'):tr('เปิดไมโครโฟน')}">${icon(voice.active?'mic':'mic')}</button><button type="button" class="icon-button" data-action="session-end" aria-label="จบการคุย">${icon('phone')}</button>`;
  dock.querySelectorAll('.voice-sphere').forEach(node=>node.dataset.state=ui.voicePhase || 'idle');
}
function navigateWhileTalking(destination) {
  if(panelModal.open) closeDialog();
  if(ui.voicePresentation) minimizeConversation();
  else if(modal.open) closeDialog();
  ui.route=destination;
  history.pushState(null,'',`#${destination}`);
  render();
  window.scrollTo({top:0,behavior:'instant'});
}
function dismissDialog() {
  if (ui.dialog === 'voice' && ui.recordDraft) {
    const draft = ui.recordDraft;
    ui.recordDraft = null;
    recordDialog(draft.kind, draft);
  } else { ui.recordDraft = null; closeDialog(); }
}
function modalHeader(title, subtitle = '', glyph = '') {
  return `<header class="modal-header"><div>${glyph ? `<span class="modal-icon">${icon(glyph)}</span>` : ''}<h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${button('close', tr('ปิด'), 'close', 'icon-button close-button', tr('aria-label="ปิดหน้าต่าง"'))}</header>`;
}
function render() {
  setLanguage(state.language || getLanguage());
  document.documentElement.lang=getLanguage();
  document.title=getLanguage()==='en'?'Luklaan · Care for the people we love':'ลูกหลาน · ช่วยดูแลคนที่เรารัก';
  document.querySelector('.skip-link').textContent=getLanguage()==='en'?'Skip to content':'ข้ามไปเนื้อหา';
  document.querySelector('#sidebar').setAttribute('aria-label',getLanguage()==='en'?'Main navigation':'เมนูหลัก');
  document.querySelector('#mobile-nav').setAttribute('aria-label',getLanguage()==='en'?'Mobile navigation':'เมนูมือถือ');
  document.querySelector('#workspace-label').textContent=getLanguage()==='en'?'Luklaan preview':'พื้นที่ทดลองลูกหลาน';
  document.querySelector('#voice-dock').setAttribute('aria-label',getLanguage()==='en'?'Call with Luklaan':'สายคุยกับลูกหลาน');
  const settingsStatus=document.querySelector('.settings-storage');
  if(settingsStatus){const c=settingsCopy(getLanguage());settingsStatus.dataset.state=workspace?.pending?'pending':workspace?.ready?'ready':'loading';settingsStatus.innerHTML='<i aria-hidden="true"></i>'+esc(workspace?.pending?c.pending:workspace?.ready?c.saved:c.offline);}
  const content=document.querySelector('#content');
  const focused=document.activeElement;
  const calendarFocus=content.contains(focused)?focused.dataset?.calendarDate:null;
  const journalFocus=focused?.id==='journal-search'?{start:focused.selectionStart,end:focused.selectionEnd}:null;
  content.classList.toggle('route-enter',content.dataset.route!==ui.route);content.dataset.route=ui.route;
  document.body.classList.toggle('large-text', state.largeText);
  document.querySelector('#sidebar').innerHTML = html`<a class="brand" href="#today" aria-label="ลูกหลาน หน้าหลัก">${logo}<span>ลูกหลาน<small>ช่วยดูแลคนที่เรารัก</small></span></a><div class="sidebar-label">ดูแลกัน ในทุกวัน</div><nav>${nav.map(([route, glyph, title]) => `<a class="nav-item ${ui.route === route ? 'active' : ''}" href="#${route}" ${ui.route === route ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${tr(title)}</span>${ui.route === route ? '<i></i>' : ''}</a>`).join('')}</nav><button class="sidebar-camera" data-action="voice">${mascotIconMarkup()}<span>คุยกับลูกหลาน<small>พูดสั่งการได้ทุกหน้า</small></span>${icon('arrow')}</button><div class="sidebar-bottom"><div class="leaf-art">${logo}</div><p>ดูแลวันนี้<br>ให้วันหน้าสบายใจ</p><span>อยู่ข้าง ๆ ในทุกวันของคุณ</span></div><button class="sidebar-help" data-action="about">${icon('info')} เกี่ยวกับพื้นที่ทดลอง</button>`;
  document.querySelector('#header').innerHTML = html`<a class="mobile-brand brand" href="#today">${logo}<span>ลูกหลาน</span></a><div class="date-line">${icon('calendar')}<span>${thaiDate()}</span></div><div class="header-actions header-utilities" role="group" aria-label="เครื่องมือส่วนตัว">${button('large-text',tr('ตัวอักษร'),'textSize',`header-utility ${state.largeText?'is-selected':''}`,html`aria-label="ตัวอักษร ${state.largeText?tr('กลับขนาดปกติ'):tr('ขยายให้อ่านง่าย')}" aria-pressed="${state.largeText}"`)}${button('report',tr('สรุปให้หมอ'),'file','header-utility',tr('aria-label="สรุปให้หมอ"'))}${button('profile',tr('ตั้งค่า'),'settings','header-utility',tr('aria-label="ตั้งค่า คุณสมใจ"'))}</div>`;
  document.querySelector('#mobile-nav').innerHTML = html`${nav.filter(([r])=>['today','calendar'].includes(r)).map(([r, g, t]) => mobileItem(r, g, t)).join('')}<button class="mobile-talk" data-action="voice" aria-label="คุยกับลูกหลาน">${mascotIconMarkup()}<span>พูดคุย</span></button>${nav.filter(([r])=>['history','care'].includes(r)).map(([r, g, t]) => mobileItem(r, g, t)).join('')}`;
  const views = { today: homeView, history: historyView, calendar:()=>calendarPageMarkup(state,ui.calendarDate || dateKey()), medication: medicationView, care: careView, summary: summaryView };
  document.querySelector('#content').innerHTML = views[ui.route]();
  if(ui.route==='history'){refreshJournal();if(journalFocus){const search=document.querySelector('#journal-search');search.focus({preventScroll:true});search.setSelectionRange(journalFocus.start,journalFocus.end);}}
  if(calendarFocus)document.querySelector(`[data-calendar-date="${calendarFocus}"]`)?.focus({preventScroll:true});
  updateVoiceDock();
  if(ui.voicePresentation){setMascotState(ui.voicePhase || 'idle');ui.stage?.refreshLanguage();refreshConversationLocale();}
}
function mobileItem(route, glyph, title) {
  const shortTitle = { today: tr('วันนี้'), history: tr('สุขภาพ'), calendar:tr('ปฏิทิน'), medication: tr('ยา'), care: tr('ดูแลกัน') }[route] || title;
  return `<a href="#${route}" class="mobile-item ${route === ui.route ? 'active' : ''}" ${route === ui.route ? 'aria-current="page"' : ''} aria-label="${tr(title)}">${icon(glyph)}<span>${tr(shortTitle)}</span></a>`;
}
function orb(className = '') { return mascotStageMarkup(className); }

function homeView() {
  const plans=(state.calendarPlans || []).filter(p=>p.status!=='cancelled' && p.date===dateKey()).sort((a,b)=>a.at.localeCompare(b.at));
  return html`<div class="dashboard home-dashboard easy-home"><header class="greeting"><div><span class="home-date">${thaiDate()}</span><h1>สวัสดีค่ะ คุณสมใจ</h1><p>วันนี้ให้ลูกหลานช่วยอะไรดีคะ</p></div></header><section class="main-column">
    <section class="assistant-card glass"><div class="assistant-copy"><span class="assistant-eyebrow">ลูกหลานอยู่ตรงนี้</span><h2>เล่าให้ฟัง<br>ได้ทุกเรื่อง</h2><p>คุยเรื่องกิน เรื่องยา<br>หรือเปิดกล้องให้ดู</p>${button('voice',tr('เริ่มคุยกับลูกหลาน'),'mic','button primary')}<small class="start-hint">แตะครั้งเดียว แล้วพูดได้เลย</small></div><div class="home-orbit" aria-hidden="true">${orb()}<span class="orbit-shadow"></span></div></section>
    <nav class="home-shortcuts" aria-label="เรื่องที่ใช้บ่อย"><a href="#calendar">${icon('calendar')}<span><strong>นัดหมาย</strong><small>${plans.length?html`วันนี้มี ${plans.length} นัด`:tr('ดูปฏิทินของคุณ')}</small></span>${icon('chevron')}</a><a href="#history">${icon('book')}<span><strong>บันทึกสุขภาพ</strong><small>สิ่งที่เล่าและค่าที่วัด</small></span>${icon('chevron')}</a></nav>
    <section class="home-agenda"><div class="section-heading"><h2>นัดของวันนี้</h2><a class="text-button" href="#calendar">ดูทั้งหมด ${icon('chevron')}</a></div>${plans.length?plans.slice(0,2).map(plan=>`<button class="home-plan" data-action="calendar-edit" data-id="${esc(plan.id)}"><time>${esc(plan.at)}</time><span><strong>${esc(plan.title)}</strong>${plan.note?`<small>${esc(plan.note)}</small>`:''}</span>${icon('chevron')}</button>`).join(''):html`<p class="calm-empty">วันนี้ยังไม่มีนัดที่บันทึกไว้<span>พักสบาย ๆ หรือบอกลูกหลานให้ช่วยจดนัดได้ค่ะ</span></p>`}</section>
    <details class="home-more"><summary>${icon('plus')} จดเพิ่มเติมและลองสายโทรเข้า ${icon('chevron')}</summary><div>${mealJournal()}${phoneExperience.homeCard()}</div></details>
  </section><aside class="right-column health-overview" aria-label="บันทึกและสรุปสุขภาพ"><section class="health-section"><div class="section-heading"><h2>ค่าที่บันทึกล่าสุด</h2></div><div class="metrics">${metric('bloodPressure')}${glucoseMetric()}</div><p class="reading-hint">ค่าจากเครื่องวัดที่คุณบันทึก ไม่ได้วัดผ่านกล้อง</p></section><a href="#summary" class="home-report">${icon('file')}<span><strong>เตรียมสรุปให้คุณหมอ</strong><small>รวมยา อาหาร และค่าที่วัดใน 7 วัน</small></span>${icon('chevron')}</a><a href="#care" class="home-family">${icon('users')}<span><strong>คนที่เรารัก</strong><small>ดูเรื่องที่ต้องช่วยกันติดตาม</small></span>${icon('chevron')}</a><p class="home-voice-help">อยากไปหน้าไหน บอกลูกหลานได้เลย<br>เช่น “เปิดบันทึกสุขภาพให้หน่อย”</p></aside></div>`;
}
function metric(kind) {
  const entry = latest(state.events.filter(event=>!event.isDemo), kind);
  const bp = kind === 'bloodPressure';
  return `<button class="metric-card" data-action="record" data-kind="${kind}"><div class="metric-label">${icon(bp ? 'heart' : 'thermometer')}<span>${bp ? tr('ความดันโลหิต') : tr('อุณหภูมิ')}</span>${icon('plus', 'metric-plus')}</div><div class="metric-value">${entry ? bp ? `${esc(entry.payload.systolic)}<span class="value-slash">/</span>${esc(entry.payload.diastolic)}` : Number(entry.payload.value).toFixed(1) : tr('ยังไม่มีค่า')}<span class="metric-unit">${bp ? 'mmHg' : '°C'}</span></div><div class="metric-meta">${entry ? html`${sourceLabel(entry)} <span>· ${thaiDate(new Date(entry.occurredAt),{day:'numeric',month:'short',year:undefined})} ${time(entry.occurredAt)} น.</span>` : tr('แตะเพื่อบันทึกจากเครื่องวัด')}</div></button>`;
}
function dailyRows() {
  return [
    ['walk', '10:00', tr('ขยับร่างกายตามที่สะดวก'), 'walk', 'activity'],
    ['water', '14:00', tr('พักสักนิด เช็กความรู้สึกวันนี้'), 'water', 'activity'],
  ].map(([id, at, title, glyph, action]) => {
    const done = id === 'pressure' ? state.events.some(e => !e.isDemo && e.kind === 'bloodPressure' && dateKey(new Date(e.occurredAt)) === dateKey()) : state.activities[`${dateKey()}-${id}`];
    return `<button class="daily-row ${done ? 'done' : ''}" data-action="${action}" data-id="${id}" data-kind="bloodPressure"><span class="task-check">${done ? icon('check') : ''}</span><span class="task-time">${at}</span><span class="task-title">${title}</span><span class="task-end">${done ? tr('เรียบร้อย') : icon(glyph)}</span></button>`;
  }).join('');
}
function calendarView() {
  const today = new Date(`${dateKey()}T12:00:00+07:00`);
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  return html`<section class="calendar-card glass"><div class="section-heading"><h3>${thaiDate(today, { day: undefined, month: 'long', year: 'numeric' })}</h3>${icon('calendar')}</div><div class="calendar-grid">${[tr('อา'), tr('จ'), tr('อ'), tr('พ'), tr('พฤ'), tr('ศ'), tr('ส')].map(d => `<span class="weekday">${d}</span>`).join('')}${'<span></span>'.repeat(first)}${Array.from({ length: days }, (_, i) => `<span class="calendar-day ${i + 1 === today.getDate() ? 'current' : ''}">${i + 1}</span>`).join('')}</div><div class="calendar-caption"><span class="status-dot"></span> วันนี้ ดูแลตัวเองอีกนิดนะคะ</div></section>`;
}
function chartCard() {
  const data = state.events.filter(e => e.kind === 'bloodPressure').sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)).slice(-7);
  const last = data.at(-1);
  const points = key => data.map((e, i) => `${35 + i * 33},${150 - (e.payload[key] - 60) * 1.25}`).join(' ');
  return html`<section class="chart-card glass"><div class="section-heading"><h3>ความดันที่ผ่านมา</h3>${icon('heart')}</div><p>${data.length} บันทึกล่าสุด · มีข้อมูลตัวอย่าง</p>${last ? html`<div class="overview-reading"><strong>${esc(last.payload.systolic)}<span>/</span>${esc(last.payload.diastolic)}</strong><span>mmHg</span></div><div class="overview-source">${sourceLabel(last)} · ${time(last.occurredAt)} น.</div>` : ''}<svg class="bp-chart" viewBox="0 0 260 172" role="img" aria-label="กราฟความดันจากบันทึกล่าสุด มีข้อมูลตัวอย่างประกอบ">${[80, 100, 120, 140].map(n => `<text x="0" y="${154 - (n - 60) * 1.25}">${n}</text><path class="chart-grid" d="M30 ${150 - (n - 60) * 1.25}H250"/>`).join('')}<polyline points="${points('systolic')}" class="chart-line sys"/><polyline points="${points('diastolic')}" class="chart-line dia"/>${data.map((e, i) => `<circle cx="${35 + i * 33}" cy="${150 - (e.payload.systolic - 60) * 1.25}" r="3.5" fill="#333333"/><circle cx="${35 + i * 33}" cy="${150 - (e.payload.diastolic - 60) * 1.25}" r="3.5" fill="#999999"/><text x="${35 + i * 33}" y="167" text-anchor="middle">${new Date(e.occurredAt).getDate()}</text>`).join('')}</svg><div class="chart-legend"><span><i></i> ค่าบน</span><span><i></i> ค่าล่าง</span><small>มีข้อมูลตัวอย่าง</small></div></section>`;
}
function pageHeading(title, desc, action = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;
}
function historyView() {
  return html`<div class="full-page modern-page history-page easy-history">${pageHeading(tr('บันทึกสุขภาพ'),tr('ย้อนดูสิ่งที่เล่าและค่าที่วัดได้ที่นี่'),button('record',tr('บันทึกเพิ่ม'),'plus','button primary'))}<section class="journal-controls" aria-label="ค้นหาและกรองบันทึก"><label class="journal-search">${icon('search')}<input id="journal-search" type="search" value="${esc(ui.historyQuery || '')}" placeholder="ค้นหา เช่น อาหาร หรือค่าที่วัด" aria-label="ค้นหาบันทึก"></label><label class="journal-kind">ประเภท<select id="journal-kind">${[['all',tr('ทุกประเภท')],['bloodPressure',tr('ความดัน')],['glucose',tr('น้ำตาล')],['meal',tr('อาหาร')],['symptom',tr('อาการ')],['dose',tr('การกินยา')],['adherence',tr('ความต่อเนื่องของยา')],['temperature',tr('อุณหภูมิ')],['photo',tr('ภาพถ่าย')],['call',tr('การโทร')]].map(([key,text])=>`<option value="${key}" ${ui.filter===key?'selected':''}>${text}</option>`).join('')}</select></label></section><div class="journal-meta"><p id="journal-count" role="status"></p><label><input id="journal-demo" type="checkbox" ${ui.showDemo?'checked':''}> ดูข้อมูลตัวอย่างด้วย</label></div><div id="journal-results">${historyResults()}</div><a class="journal-report" href="#summary">${icon('file')} ดูสรุปสำหรับคุณหมอ ${icon('chevron')}</a><p class="privacy-note">${icon('shield')} บันทึกที่ยืนยันเก็บไว้แล้ว ยังไม่ได้ส่งให้คนดูแลหรือแพทย์</p></div>`;
}
function historyResults(){
 const entries=journalEntries(state.events,{kind:ui.filter,query:ui.historyQuery || '',includeDemo:ui.showDemo});
 return entries.length?journalDays(entries).map(group=>html`<section class="journal-day"><h2>${group.date===dateKey()?tr('วันนี้'):group.date===shiftDate(dateKey(),-1)?tr('เมื่อวาน'):thaiDate(new Date(group.date+'T12:00:00+07:00'),{day:'numeric',month:'long',year:undefined})}<span>${group.events.length} รายการ</span></h2>${group.events.map(eventRow).join('')}</section>`).join(''):`<div class="empty-state">${icon('book')}<h3>${ui.historyQuery || ui.filter!=='all'?tr('ยังไม่พบบันทึกที่ค้นหา'):tr('ยังไม่มีบันทึกของคุณ')}</h3><p>${ui.historyQuery || ui.filter!=='all'?tr('ลองเปลี่ยนคำค้นหรือเลือกทุกประเภทค่ะ'):tr('เล่าเรื่องวันนี้ให้ลูกหลานฟัง แล้วค่อยยืนยันให้ช่วยจดได้ค่ะ')}</p>${ui.historyQuery || ui.filter!=='all'?button('journal-reset',tr('ล้างการค้นหา'),'close','button outline'):button('voice',tr('คุยกับลูกหลาน'),'mic','button primary')}</div>`;
}
function refreshJournal(){
 const result=document.querySelector('#journal-results');if(!result)return;
 result.innerHTML=historyResults();
 const count=document.querySelector('#journal-count');if(count)count.textContent=html`${journalEntries(state.events,{kind:ui.filter,query:ui.historyQuery || '',includeDemo:ui.showDemo}).length} รายการ${ui.showDemo?tr(' · รวมตัวอย่าง'):tr(' · เฉพาะบันทึกของคุณ')}`;
}
function eventRow(event) {
  const image = event.payload.image?.startsWith('data:image/jpeg;base64,') ? event.payload.image : '';
  return html`<article class="event-row" data-event-id="${esc(event.id)}" ${ui.editingRecordId===event.id?'data-selected="true"':''}><span class="event-icon ${event.kind}">${icon(eventIcon[event.kind])}</span><div class="event-body"><div class="event-title"><h3>${labels[event.kind]}</h3><span class="source ${event.isDemo ? 'demo' : ''}">${sourceLabel(event)}</span></div><p>${esc(describe(event))}</p><small>${thaiDate(new Date(event.occurredAt), { year: undefined, month: 'short' })} · ${time(event.occurredAt)} น.</small>${image ? html`<img class="event-photo" src="${image}" alt="ภาพที่แนบกับบันทึกสุขภาพ" loading="lazy">` : ''}</div>${!event.isDemo && event.kind !== 'dose' ? button('edit', tr('แก้ไข'), 'edit', 'icon-button', html`data-id="${event.id}" aria-label="แก้ไข${labels[event.kind]}"`) : ''}</article>`;
}
function medicationView() {
  return html`<div class="full-page modern-page medication-page">${pageHeading(tr('ยาของฉัน'), tr('จดไว้ให้มั่นใจ ว่าวันนี้กินยาแล้วหรือยัง'), button('camera', tr('ดูฉลากยาผ่านกล้อง'), 'camera', 'button outline'))}<div class="notice glass">${icon('info')}<p>นี่คือแผนยาตัวอย่างสำหรับทดลองใช้งาน<br><strong>ใช้ยาตามคำสั่งแพทย์ ไม่ปรับยาตามต้นแบบนี้</strong></p></div><div class="medication-grid">${schedules.map(schedule => {
    const taken = doseTaken(state.events, schedule.id);
    return html`<section class="medication-card glass"><div class="medication-top"><span class="round-icon">${icon(schedule.icon)}</span><span class="period">มื้อ${schedule.period}</span><strong class="med-time">${schedule.at}<small> น.</small></strong></div><h2>${schedule.name}</h2><p>${schedule.detail}</p><div class="medication-status ${taken ? 'is-done' : ''}">${icon(taken ? 'check' : 'clock')}${taken ? tr('คุณยืนยันว่ากินยาแล้ววันนี้') : tr('ยังไม่มีการยืนยันวันนี้')}</div>${taken ? button('undo-dose', tr('ยกเลิกการยืนยันที่กดผิด'), 'history', 'button outline', `data-id="${schedule.id}"`) : button('dose', tr('กินยาแล้ว'), 'check', 'button primary', `data-id="${schedule.id}"`)}${!taken && schedule.id === 'morning' ? button('snooze', state.snooze && state.snooze > Date.now() ? html`เลื่อนถึง ${time(state.snooze)} น.` : tr('เตือนอีกครั้งใน 10 นาที'), 'clock', 'text-button snooze-button') : ''}</section>`;
  }).join('')}</div><section class="glass medication-history"><div class="section-heading"><h2>การกินยาที่คุณบันทึก</h2>${icon('history')}</div>${state.events.filter(e => e.kind === 'dose').length ? state.events.filter(e => e.kind === 'dose').slice().reverse().map(eventRow).join('') : tr('<p class="muted">เมื่อกด “กินยาแล้ว” รายการจะมาอยู่ตรงนี้ค่ะ</p>')}</section><p class="privacy-note">${icon('clock')} การเลื่อนเตือนทำงานขณะเปิดเว็บนี้ไว้ การแจ้งเตือนเมื่อปิดแอปต้องเชื่อมระบบเพิ่มเติม</p></div>`;
}
function careView() { return familyDashboardMarkup(state,workspace); }
function careSharingView() {
  const active = state.sharing.logs || state.sharing.medication;
  return html`<div class="full-page modern-page care-page">${pageHeading(tr('ให้ความห่วงใย อยู่ใกล้กัน'), tr('คุณเลือกได้ ว่าอยากให้ใครเห็นอะไรบ้าง'), button('phone-settings', tr('ตั้งเวลาให้ลูกหลานโทรหา'), 'phone', 'button outline'))}<div class="care-layout"><section class="glass consent-panel"><div class="family-person large"><span class="avatar peach">พ</span><div><h2>พิมพ์ · ลูกสาว</h2><span>ตัวอย่างคนดูแลของคุณ</span></div><span class="source demo">โหมดทดลอง</span></div><p>ลองเลือกข้อมูลที่อยากแบ่งปัน<br>เพื่อดูตัวอย่างหน้าจอของคนดูแล</p><label class="toggle-row"><span><strong>บันทึกสุขภาพและอาการ</strong><small>ค่าที่วัดได้ อาการ และเวลาที่บันทึก</small></span><input type="checkbox" role="switch" data-setting="logs" ${state.sharing.logs ? 'checked' : ''}><span class="toggle-ui"></span></label><label class="toggle-row"><span><strong>การยืนยันกินยา</strong><small>ดูได้ว่าวันนี้ยืนยันมื้อไหนแล้ว</small></span><input type="checkbox" role="switch" data-setting="medication" ${state.sharing.medication ? 'checked' : ''}><span class="toggle-ui"></span></label><div class="consent-note">${icon('shield')}<p>สวิตช์นี้เปลี่ยนเฉพาะภาพตัวอย่าง<br>ยังไม่เชื่อมบัญชีหรือส่งข้อมูลให้บุคคลอื่น</p></div></section><section class="glass caregiver-preview"><div class="section-heading"><h2>ตัวอย่างฝั่งคนดูแล</h2>${icon('users')}</div><div class="preview-person"><span class="avatar">ส</span><div><strong>วันนี้ของคุณแม่สมใจ</strong><small>${thaiDate()}</small></div></div>${!active ? html`<div class="empty-state">${icon('shield')}<h3>พื้นที่ส่วนตัวของคุณแม่</h3><p>ข้อมูลจะปรากฏเมื่อคุณแม่เลือกแบ่งปัน</p></div>` : `${state.sharing.medication ? html`<div class="care-summary"><h3>เรื่องยาในวันนี้</h3>${schedules.map(s => `<div>${s.name}<span>${doseTaken(state.events, s.id) ? tr('ยืนยันแล้ว') : tr('ยังไม่มีบันทึก')}</span></div>`).join('')}</div>` : ''}${state.sharing.logs ? html`<div class="care-summary"><h3>บันทึกสุขภาพล่าสุด</h3>${state.events.filter(e => ['bloodPressure', 'temperature', 'symptom'].includes(e.kind)).sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt)).slice(0, 3).map(e => `<div><span>${labels[e.kind]}<small>${sourceLabel(e)}</small></span><strong>${esc(describe(e))}</strong></div>`).join('')}</div>` : ''}`}</section></div><section class="doctor-banner glass"><span class="round-icon">${icon('file')}</span><div><h2>เรื่องราวระหว่างนัด ให้คุณหมอเห็นภาพ</h2><p>รวมยา อาการ และค่าที่วัดในรายงานเดียว</p></div>${button('report', tr('ดูตัวอย่างรายงาน'), 'arrow', 'button primary')}</section></div>`;
}

function recordDialog(kind = 'bloodPressure', options = {}) {
  const attachment = options.image || ui.attachment;
  const editing = options.editing || null;
  const payload = options.payload || {};
  const source = options.source || 'manual';
  showDialog('record', html`${modalHeader(editing ? tr('แก้ไขบันทึก') : tr('บันทึกสุขภาพ'), tr('จดค่าจากเครื่องวัด หรือเล่าอาการของคุณค่ะ'), 'heart')}<form id="record-form" class="record-form"><label class="field-label" for="record-kind">อยากบันทึกเรื่องอะไรคะ</label><select id="record-kind" name="kind">${Object.entries(labels).filter(([key]) => !['dose', 'call', 'meal', 'glucose', 'adherence'].includes(key)).map(([key, label]) => `<option value="${key}" ${key === kind ? 'selected' : ''}>${label}</option>`).join('')}</select><div id="record-fields">${recordFields(kind, payload)}</div>${attachment ? html`<div class="attachment-preview"><img src="${attachment}" alt="ภาพที่จะแนบในบันทึก"><span>${icon('image')} แนบภาพนี้กับบันทึก</span></div>` : button('camera', tr('เปิดกล้องสด / ถ่ายภาพแนบ'), 'camera', 'button outline camera-record')}<div class="form-note">${icon('info')}<span>${source === 'voice' ? tr('ตรวจข้อความที่ได้ยิน แล้วกดยืนยันค่ะ') : tr('คุณเป็นผู้กรอกค่า กล้องไม่ได้วัดไข้หรือความดัน')}</span></div><p id="form-error" class="form-error" role="alert"></p><button class="button primary full" type="submit">${icon('check')} ยืนยันบันทึก</button></form>`, 'record-modal');
  ui.attachment = attachment;
  ui.editing = editing;
  ui.source = source;
}
function recordFields(kind, payload = {}) {
  if (kind === 'bloodPressure') return html`<div class="field-pair"><label>ค่าบน <span>mmHg</span><input name="systolic" type="number" inputmode="numeric" min="40" max="300" step="1" required placeholder="เช่น 128" value="${esc(payload.systolic || '')}"></label><label>ค่าล่าง <span>mmHg</span><input name="diastolic" type="number" inputmode="numeric" min="20" max="200" step="1" required placeholder="เช่น 78" value="${esc(payload.diastolic || '')}"></label></div><p class="field-help">ดูตัวเลขจากเครื่องวัดความดันของคุณค่ะ</p>`;
  if (kind === 'temperature') return html`<label class="field-label">อุณหภูมิจากเครื่องวัด <span>°C</span><input name="value" type="number" inputmode="decimal" min="25" max="45" step="0.1" required placeholder="เช่น 36.5" value="${esc(payload.value || '')}"></label>`;
  return `<label class="field-label">${kind === 'photo' ? tr('รายละเอียดภาพ') : tr('วันนี้รู้สึกอย่างไรบ้าง')}<textarea name="text" rows="4" maxlength="1000" required placeholder="${kind === 'photo' ? tr('เช่น หน้าจอเครื่องวัดหลังตื่นนอน') : tr('เช่น รู้สึกเวียนหัวเล็กน้อยหลังตื่นนอน')}">${esc(payload.text || '')}</textarea></label>`;
}
function saveRecord(form) {
  const data = new FormData(form);
  const kind = data.get('kind');
  let payload;
  if (kind === 'bloodPressure') {
    payload = { systolic: Number(data.get('systolic')), diastolic: Number(data.get('diastolic')) };
    if (payload.systolic <= payload.diastolic) {
      document.querySelector('#form-error').textContent = tr('ตรวจอีกครั้งค่ะ ค่าบนควรมากกว่าค่าล่าง');
      return;
    }
  } else if (kind === 'temperature') payload = { value: Number(data.get('value')) };
  else payload = { text: String(data.get('text')).trim() };
  if (payload.text !== undefined && !payload.text) return;
  if (kind === 'photo' && !ui.attachment) {
    document.querySelector('#form-error').textContent = tr('เพิ่มภาพจากกล้องก่อนบันทึกภาพนะคะ');
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
  toast(tr('บันทึกแล้วค่ะ เปิดดูได้ในสมุดสุขภาพ'));
}

const voice = new RealtimeVoiceSession((phase, message) => {
  ui.voicePhase=phase; ui.voiceMessage=message;
  if(ui.stage?.root){ui.stage.root.dataset.voicePhase=phase;const thought=ui.stage.root.querySelector('.thought-label');if(thought)thought.textContent=({requesting:tr('กำลังต่อสาย'),listening:tr('ตั้งใจฟังอยู่ค่ะ'),transcribing:tr('ตั้งใจฟังอยู่ค่ะ'),thinking:tr('ขอคิดสักครู่ค่ะ'),processing:tr('ขอคิดสักครู่ค่ะ'),speaking:tr('เล่าให้ฟังนะคะ'),paused:tr('พักไว้ คุยต่อเมื่อพร้อม'),error:tr('ลองต่อสายอีกครั้งนะคะ'),ready:tr('พูดได้เลยค่ะ')})[phase] || tr('อยู่ข้าง ๆ คุณค่ะ');}

  updateVoiceDock();
  const presence=document.querySelector('.conversation-presence');
  if(presence && !presence.querySelector('#phone-elapsed')) presence.innerHTML='<i></i> '+({requesting:tr('กำลังต่อสาย'),error:tr('ยังไม่เชื่อมต่อ'),paused:tr('พักสาย')}[phase] || tr('อยู่ในสาย'));
  const caption=document.querySelector('#voice-transcript');
  if(caption) caption.textContent={requesting:tr('กำลังต่อสายกับลูกหลาน'),error:tr('ยังต่อสายไม่ได้ค่ะ'),paused:tr('คุยต่อเมื่อพร้อม')}[phase] || tr('ลูกหลานอยู่ในสาย');
  const status = document.querySelector('#voice-status');
  if (status) {
    status.textContent = phase === 'transcribing' ? tr('กำลังฟังค่ะ พูดต่อได้เลย') : message;
    status.dataset.phase = phase;
  }
  setMascotState(ui.mascotSuccessUntil>Date.now()?'success':phase === 'transcribing'?'listening':phase);
  const toggle = document.querySelector('[data-action="voice-toggle"]');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(voice.active && !voice.inputMuted));
    toggle.setAttribute('aria-label', voice.active && !voice.inputMuted ? tr('พักไมโครโฟน') : tr('เปิดไมโครโฟน'));
    toggle.querySelector('span').textContent = voice.active && !voice.inputMuted ? tr('พักไมค์') : tr('เปิดไมค์');
    toggle.classList.toggle('mic-active', voice.active && !voice.inputMuted);
  }
}, () => {}, level => document.querySelectorAll('.voice-sphere,.sound-wave,.stage-thought').forEach(sphere => sphere.style.setProperty('--level', level)), {
  onTool: realtimeTool,
  getFrame: () => ui.stage?.root.dataset.camera === 'live' ? camera.capture(ui.stage.video) : null,
  getContext: () => ({mode:ui.dialog === 'phone'?'phone':'app',...currentVoiceContext()}),
  onTurnStart: itemId => { ui.userTurn=(ui.userTurn || 0)+1; ui.audioTurnId=itemId; ui.lastUserTranscript=''; ui.transcriptTurn=null; },
  onTranscript: (text, role, meta={}) => { if(role==='assistant') {ui.lastAssistantTranscript=text;return;} if(role !== 'user' || (meta.itemId && ui.audioTurnId && meta.itemId!==ui.audioTurnId)) return; ui.lastUserTranscript=text; ui.transcriptTurn=ui.userTurn; if(ui.dialog==='phone') phoneExperience.hear(text); if(rejectsProposal(text,ui.pendingAppAction?.call.action)) { ui.pendingHealth=null;ui.pendingAppAction=null;for(const item of toolActivity.items.filter(item=>item.status==='confirmation'))toolActivity.finish(item.id,{status:'cancelled',message:tr('ยกเลิกข้อเสนอแล้ว ยังไม่ได้เปลี่ยนข้อมูล')}); } }
});
phoneExperience = createPhoneExperience({ state, modal, showDialog, closeDialog, voice, persist: saveState, render, toast });

function refreshConversationLocale() {
  if(!ui.voicePresentation)return;
  const caption=conversationModal.querySelector('#voice-transcript');
  if(caption)caption.textContent=ui.voicePhase==='requesting'?tr('กำลังต่อสายกับลูกหลาน','Connecting to Luklaan'):ui.voicePhase==='error'?tr('ยังต่อสายไม่ได้ค่ะ','The call could not connect'):ui.voicePhase==='paused'?tr('คุยต่อเมื่อพร้อม','Continue when you are ready'):tr('ลูกหลานอยู่ในสาย','Luklaan is here with you');
  const header=conversationModal.querySelector('.conversation-header');
  if(header){
    header.querySelector('h2').textContent=tr('ลูกหลาน','Luklaan');
    header.querySelector('div > span').textContent=tr('AI · เสียงและภาพเมื่อเปิดกล้องส่งให้ OpenAI','AI · Audio and enabled camera images are sent to OpenAI');
    const presence=header.querySelector('.conversation-presence');
    if(presence)presence.innerHTML='<i></i> '+tr('อยู่ในสาย','In the call');
  }
  const controls={
    'voice-minimize':[tr('ย่อ','Minimize'),tr('ย่อหน้าคุย','Minimize the call')],
    'voice-toggle':[voice.inputMuted?tr('เปิดไมค์','Unmute'):tr('พักไมค์','Mute'),voice.inputMuted?tr('เปิดไมโครโฟน','Unmute microphone'):tr('พักไมโครโฟน','Mute microphone')],
    'camera-toggle':[tr('กล้อง','Camera'),ui.stage?.cameraRequested?tr('ปิดกล้อง คุยต่อ','Turn camera off and keep talking'):tr('เปิดกล้องในบทสนทนา','Open camera in this call')],
    'session-end':[tr('วางสาย','End call'),tr('จบการคุย','End the call')],
  };
  for(const [action,[label,aria]] of Object.entries(controls)){
    const control=conversationModal.querySelector(`[data-action="${action}"]`);
    if(!control)continue;
    const span=control.querySelector('span');if(span)span.textContent=label;
    control.setAttribute('aria-label',aria);
  }
  conversationModal.querySelector('.stage-controls')?.setAttribute('aria-label',tr('ควบคุมการสนทนา','Call controls'));
}
function voiceDialog({ listen = true } = {}) {
  if(ui.voicePresentation) {
    if(panelModal.open) closeDialog();
    modal=conversationModal;ui.dialog='voice';ui.voicePresentation='full';
    if(!modal.open) modal.showModal();placeToolActivity();
    document.body.classList.add('dialog-open');updateVoiceDock();
    if(listen) {if(!voice.active)voice.listen();else if(voice.inputMuted)voice.unmute();}return;
  }
  ui.conversationId = (ui.conversationId || 0) + 1;
  showDialog('voice', html`<header class="conversation-header"><div><h2 id="modal-title">ลูกหลาน</h2><span>AI · เสียงและภาพเมื่อเปิดกล้องส่งให้ OpenAI</span></div><div class="conversation-header-actions"><span class="conversation-presence"><i></i> อยู่ในสาย</span>${button('voice-minimize',tr('ย่อ'),'down','icon-button',tr('aria-label="ย่อหน้าคุย"'))}</div></header><div class="conversation-shell">${conversationStageMarkup(orb())}<div class="stage-controls" aria-label="ควบคุมการสนทนา">${button('voice-toggle', tr('พักไมค์'), 'mic', 'stage-control mic-control', tr('aria-label="พักไมโครโฟน" aria-pressed="true"'))}${button('camera-toggle', tr('กล้อง'), 'camera', 'stage-control', tr('aria-label="เปิดกล้องในบทสนทนา" aria-pressed="false"'))}${button('session-end', tr('วางสาย'), 'phone', 'stage-control end-control', tr('aria-label="จบการคุย"'))}</div></div>`, 'voice-modal conversation-modal immersive-conversation');
  ui.voicePresentation='full';
  ui.stage = new ConversationStage(document.querySelector('#conversation-stage'), { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  ui.stage.root.dataset.session=String(ui.conversationId);
  if (listen) voice.listen();
}

const voiceToolHandlers = {
  'camera.open': async ({ facing }) => {
    cameraDialog(); ui.cameraMode = facing; ui.deviceId = '';
    await startCamera();
    if (ui.cameraPhase !== 'live') throw new Error(tr('ยังเปิดกล้องไม่ได้ ตรวจสิทธิ์กล้องแล้วลองอีกครั้งค่ะ'));
    return ui.activeFacing && ui.activeFacing !== facing ? tr('เปิดกล้องที่อุปกรณ์นี้รองรับแล้วค่ะ พูดต่อได้เลย') : tr('เปิดกล้องแล้วค่ะ คุยต่อได้เลย ไม่ต้องกดสลับโหมด');
  },
  'camera.close': () => { hideSessionCamera(); return tr('ปิดกล้องแล้วค่ะ เรายังคุยกันต่อได้'); },
  'conversation.end': () => { dismissDialog(); return tr('จบการคุยแล้วค่ะ'); },
  'camera.switch': async () => {
    cameraDialog();
    ui.cameraMode = ui.cameraMode === 'user' ? 'environment' : 'user';
    const devices = ui.cameraDevices || [];
    ui.deviceId = !ui.activeFacing && devices.length > 1 ? devices[(devices.findIndex(device => device.deviceId === ui.activeDeviceId) + 1) % devices.length].deviceId : '';
    await startCamera();
    if (ui.cameraPhase !== 'live') throw new Error(tr('ยังสลับกล้องไม่ได้ค่ะ'));
    return tr('เปลี่ยนกล้องแล้วค่ะ พูดต่อได้เลย');
  },
  'camera.capture': async () => {
    if (!ui.voicePresentation || ui.cameraPhase !== 'live') throw new Error(tr('บอกว่า เปิดกล้อง ก่อนถ่ายภาพนะคะ'));
    voiceDialog({listen:false});
    const photo = camera.capture(document.querySelector('#camera-video'));
    if (!photo) throw new Error(tr('ภาพยังไม่พร้อม ลองอีกครั้งค่ะ'));
    previewPhoto(photo); return tr('ถ่ายภาพแล้วค่ะ กล้องยังเปิดอยู่ และคุยต่อได้เลย');
  },
  'history.open': () => { navigateTool('history'); return tr('เปิดสมุดสุขภาพแล้วค่ะ'); },
  'care.open': () => { navigateTool('care'); return tr('เปิดหน้าคนดูแลแล้วค่ะ'); },
  'medication.open': () => { navigateTool('medication'); return tr('เปิดแผนยาแล้วค่ะ'); },
  'today.open': () => { navigateTool('today'); return tr('กลับหน้าวันนี้แล้วค่ะ'); },
  'report.preview': () => { reportDialog(); return tr('เปิดสรุปให้คุณหมอแล้วค่ะ ยังไม่มีการส่งข้อมูล'); },
};
function navigateTool(destination) {
  if (ui.voicePresentation) { navigateWhileTalking(destination); return; }
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
  if (cameraOpening) voice.speak(call.tool === 'camera.switch' ? tr('สลับกล้องให้ค่ะ') : tr('เปิดกล้องให้นะคะ'));
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
  if(ui.voicePresentation)voiceDialog({listen:false});else voiceDialog();
}
function syncCameraControl() {
  const toggle = document.querySelector('[data-action="camera-toggle"]');
  if (!toggle) return;
  const active = ui.stage?.cameraRequested || false;
  toggle.setAttribute('aria-pressed', String(active));
  toggle.setAttribute('aria-label', active ? tr('ปิดกล้อง คุยต่อ') : tr('เปิดกล้องในบทสนทนา'));
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
    stage.error(error.name === 'NotAllowedError' ? tr('ยังไม่ได้อนุญาตกล้อง · แตะกล้องเพื่อลองใหม่') : tr('กล้องยังไม่พร้อม · แตะกล้องเพื่อลองใหม่'));
    syncCameraControl();
  }
}
function previewPhoto(photo) {
  if (!photo) return;
  ui.attachment = photo;
  if (ui.recordDraft) ui.recordDraft.image = photo;
  else addEvent(newEvent('photo', { text: tr('ภาพจากบทสนทนา'), image: photo }, 'voice'));
  document.querySelector('#capture-preview').hidden = false;
  document.querySelector('#captured-photo').src = photo;
}

function reportDialog() {
  showDialog('report', html`${modalHeader(tr('สรุปสุขภาพให้แพทย์'), tr('ข้อมูลที่ยืนยันแล้วใน 7 วันล่าสุด'), 'file')}<div class="report-paper" id="report-paper"><div class="report-brand"><strong>ลูกหลาน</strong><span>บันทึกระหว่างนัด · คุณสมใจ</span></div>${briefMarkup(state,{audience:'physician',alerts:workspace?.alerts || []})}${workspace?.alerts.length?alertMarkup(workspace.alerts):''}${renderPhysicianSummary(state.events, state.profile || {})}</div><div class="report-actions">${button('print', tr('พิมพ์ / บันทึก PDF'), 'download', 'button primary')}<span>ข้อมูลจากผู้ใช้ ยังไม่ใช่ผลตรวจทานโดยแพทย์</span></div>`, 'report-modal');
}

function scheduleSnooze() {
  clearTimeout(ui.snoozeTimer);
  if (!state.snooze) return;
  const delay = state.snooze - Date.now();
  if (delay <= 0) {
    state.snooze = null;
    saveState();
    toast(tr('ถึงเวลาที่เลื่อนเตือนไว้ค่ะ ตรวจแผนยาของคุณอีกครั้ง'));
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
  if(source!=='voice')toast(html`กำลังเก็บบันทึก${schedule.name}ค่ะ`);
}

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const { action, id, kind } = target.dataset;
  if (action === 'settings-language') {
    target.disabled=true;
    try{await applyLanguage(target.dataset.language);modal.querySelector(`[data-action="settings-language"][data-language="${target.dataset.language}"]`)?.focus({preventScroll:true});}catch(error){toast(error.message);if(target.isConnected)target.disabled=false;}
    return;
  }
  if (action === 'settings-text') {state.largeText=!state.largeText;saveState();render();profileDialog();modal.querySelector('[data-action="settings-text"]')?.focus({preventScroll:true});return;}
  if (action === 'settings-audio') {
    target.disabled=true;
    try{await updateAudioProfile(target.dataset.profile);profileDialog();modal.querySelector(`[data-action="settings-audio"][data-profile="${target.dataset.profile}"]`)?.focus({preventScroll:true});}catch(error){toast(error.message);if(target.isConnected)target.disabled=false;}
    return;
  }
  if (phoneExperience.action(action)) return;
  if (action === 'glucose-talk') { voiceDialog(); voice.speak(tr('วัดน้ำตาลได้เท่าไหร่คะ')); }
  else if (action === 'meal-talk') { voiceDialog(); voice.speak(tr('มื้อนี้กินอะไรไปบ้างคะ')); }
  else if (action === 'meal-record') mealDialog();
  else if (action === 'confirm-health') {try{await confirmHealthObservation();}catch(error){toast(tr('ยังบันทึกลงฐานข้อมูลไม่ได้ เก็บฉบับรอส่งแล้วค่ะ'));}}
  else if (action === 'ai-summary') generatePhysicianNarrative(target);
  else if (action === 'care-plan') carePlanDialog();
  else if (action === 'close') dismissDialog();
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
    state.events = state.events.filter(e => !(e.payload.scheduleId === id && ((e.kind === 'dose' && e.payload.dateKey === dateKey()) || (e.kind === 'adherence' && e.confirmed===true && e.payload.status==='taken' && dateKey(new Date(e.occurredAt))===dateKey()))));
    saveState(); render(); toast(tr('ยกเลิกการยืนยันแล้วค่ะ'));
  } else if (action === 'snooze') {
    state.snooze = Date.now() + 600000; saveState(); scheduleSnooze(); render(); toast(tr('จะเตือนอีกครั้งใน 10 นาที ขณะเปิดเว็บนี้ไว้ค่ะ'));
  } else if (action === 'activity') {
    const key = `${dateKey()}-${id}`; state.activities[key] = !state.activities[key]; saveState(); render();
    toast(state.activities[key] ? tr('ทำเครื่องหมายเรียบร้อยแล้วค่ะ') : tr('ยกเลิกเครื่องหมายแล้วค่ะ'));
  } else if (action === 'large-text') { state.largeText = !state.largeText; saveState(); render(); }
  else if (action === 'journal-reset') {ui.historyQuery='';ui.filter='all';render();document.querySelector('#journal-search')?.focus();}
  else if (action === 'filter') { ui.filter = kind; render(); }
  else if (action === 'edit') {
    const entry = state.events.find(e => e.id === id);
    if (entry && !entry.isDemo) recordDialog(entry.kind, { payload: entry.payload, image: entry.payload.image, editing: id });
  } else if (action === 'listen' || action === 'camera-listen') voice.listen();
  else if (action === 'voice-toggle') { if(voice.active) { if(voice.inputMuted) voice.unmute(); else voice.mute(); } else voice.listen(); }
  else if (action === 'voice-stop') voice.stop();
  else if (action === 'voice-minimize') minimizeConversation();
  else if (action === 'session-end') endConversation();
  else if (action === 'camera-toggle') await dispatchVoiceTool({ tool: ui.stage?.cameraRequested ? 'camera.close' : 'camera.open', args: { facing: ui.cameraMode } });
  else if (action === 'camera-close') await dispatchVoiceTool({ tool: 'camera.close', args: {} });
  else if (action === 'voice-repeat' || action === 'camera-read') voice.speak(ui.lastSpoken || tr('วันนี้รู้สึกอย่างไรบ้างคะ'));
  else if (action === 'camera-switch') await dispatchVoiceTool({ tool: 'camera.switch', args: {} });
  else if (action === 'print') window.print();
  else if (action === 'profile') profileDialog();

  else if (action === 'care-sharing') showDialog('care-sharing',modalHeader(tr('แบ่งปันอย่างสบายใจ'),tr('ภาพตัวอย่าง ยังไม่มีการส่งข้อมูลให้บุคคลอื่น'))+careSharingView(),'care-sharing-modal');
  else if (action === 'calendar-open') navigateWhileTalking('calendar');
  else if (action === 'calendar-date') selectCalendarDate(target.dataset.calendarDate);
  else if (action === 'calendar-previous' || action === 'calendar-next') selectCalendarDate(shiftMonth(ui.calendarDate || dateKey(),action==='calendar-next'?1:-1));
  else if (action === 'calendar-today') selectCalendarDate(dateKey());
  else if (action === 'calendar-add') calendarPlanDialog();
  else if (action === 'calendar-edit') calendarPlanDialog(id);
  else if (action === 'calendar-medication') navigateWhileTalking('medication');
  else if (action === 'calendar-cancel') showDialog('calendar-cancel',modalHeader(tr('ยกเลิกนัดนี้ไหมคะ'),tr('จะเก็บรายการไว้เป็นนัดที่ยกเลิก ไม่ลบประวัติ'))+`<div class="simple-modal">${button('calendar-confirm-cancel',tr('ยืนยันยกเลิกนัด'),'check','button primary',`data-id="${esc(id)}"`)}</div>`);
  else if (action === 'calendar-confirm-cancel') {cancelCalendarPlan(id);closeDialog();render();}
  else if (action === 'audio-settings') audioSettingsDialog();
  else if (action === 'audio-profile') {try {await updateAudioProfile(target.dataset.profile);audioSettingsDialog();}catch(error){toast(error.message);}}
  else if (action === 'web-search-open') webSearchDialog();
  else if (action === 'activity-open') {placeToolActivity();toolActivity.setCollapsed(false);}
  else if (action === 'knowledge-sources') await knowledgeSourcesDialog();
  else if (action === 'summary-history') {try{await openSummaryHistory();}catch(error){toast(error.message);}}
  else if (action === 'alert-acknowledge') { try { await workspace.acknowledge(target.dataset.id);toast(tr('รับทราบแล้วค่ะ ยังต้องติดตามจนกว่าจะได้รับการดูแล')); }catch(error){toast(error.message);} }
  else if (action === 'storage-latest') { try {await workspace.openLatest();toast(tr('เปิดฉบับล่าสุดแล้ว ฉบับที่ยังไม่ส่งเก็บสำรองในเครื่องไว้ให้ค่ะ'));}catch(error){toast(error.message);} }
  else if (action === 'storage-retry') { try {await workspace.retry();}catch(error){toast(error.message);} }
  else if (action === 'about') showDialog('about', html`${modalHeader(tr('ลูกหลาน อยู่ข้าง ๆ ในทุกวัน'), tr('ต้นแบบผลิตภัณฑ์สำหรับสังคมสูงวัย'), 'leaf')}<div class="simple-modal"><p>ช่วยจดการกินยา อาการ และค่าจากเครื่องวัด ระหว่างนัดพบแพทย์ ผ่านการแตะ เสียง และกล้องสด</p><p>เสียงคุยและภาพที่เปิดให้ดูส่งให้ OpenAI ผ่าน backend ของแอป ภาพกล้องส่งเป็นระยะเพื่อช่วยตอบเรื่องที่เห็น โภชนาการเป็นค่าประมาณ บันทึกที่ยืนยันเก็บใน PostgreSQL และมีสำเนาระหว่างรอในเบราว์เซอร์นี้ ส่วนการโทรออกจริง การเชื่อมเครื่องวัด และบัญชีผู้ดูแลยังไม่ได้เชื่อมต่อ</p><a class="button outline" href="./PRODUCT.md" target="_blank" rel="noopener">อ่านขอบเขตและแนวทางพัฒนา ${icon('arrow')}</a></div>`);
});
document.addEventListener('submit', event => {
  if(event.target.id==='web-search-form'){event.preventDefault();submitWebSearch(event.target);}
  if(event.target.id==='meal-form') { event.preventDefault(); estimateMeal(event.target); }
  if(event.target.id==='calendar-plan-form'){
    event.preventDefault();const values=Object.fromEntries(new FormData(event.target));values.id=values.planId || undefined;
    try {saveCalendarPlan(values);closeDialog();render();toast(tr('เก็บนัดหมายในแผนแล้วค่ะ'));}catch(error){document.querySelector('#calendar-error').textContent=error.message;}
  }
  if(event.target.id==='care-plan-form') { event.preventDefault(); const values=new FormData(event.target); state.profile={...state.profile,diabetes:{controlStatus:values.has('clinicianPlan')?values.get('controlStatus'):'unknown',confirmedByClinician:values.has('clinicianPlan'),provenance:'user-reported-clinician-plan'}}; saveState(); closeDialog(); render(); }
  if (event.target.id === 'phone-plan-form') { event.preventDefault(); phoneExperience.savePlan(event.target); }
  if (event.target.id === 'record-form') { event.preventDefault(); saveRecord(event.target); }
});
document.addEventListener('input',event=>{if(event.target.id==='journal-search'){ui.historyQuery=event.target.value;refreshJournal();}});
document.addEventListener('change', async event => {
  if(event.target.id==='journal-kind'){ui.filter=event.target.value;refreshJournal();}
  if(event.target.id==='journal-demo'){ui.showDemo=event.target.checked;refreshJournal();}
  if (event.target.id === 'record-kind') document.querySelector('#record-fields').innerHTML = recordFields(event.target.value);
  if (event.target.dataset.setting) { state.sharing[event.target.dataset.setting] = event.target.checked; saveState(); render(); }

});
for(const dialog of [conversationModal,panelModal]) {
  dialog.addEventListener('cancel', event => { event.preventDefault(); modal=dialog; dismissDialog(); });
  dialog.addEventListener('click',event=>{ if(event.target===dialog && event.offsetX>=dialog.clientWidth) { modal=dialog;closeDialog(); } });
}
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
  if(ui.voicePresentation) { if(panelModal.open) closeDialog(); minimizeConversation(); } else closeDialog();
  render();
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}
history.scrollRestoration = 'manual';
window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);
route();
scheduleSnooze();

function mealJournal() { return mealJournalMarkup(state); }
function summaryTeaser() { return summaryTeaserMarkup(); }
function summaryView() { return summaryPageMarkup(state).replace('<div id="physician-ai-narrative"',briefMarkup(state,{audience:'physician',alerts:workspace?.alerts || []})+'<div id="physician-ai-narrative"'); }
function mealDialog() {
  showDialog('meal', html`${modalHeader(tr('มื้อนี้กินอะไร'), tr('ลูกหลานจะถามปริมาณเพิ่ม และอ่านทวนก่อนบันทึก'), 'book')}<form id="meal-form" class="record-form"><label class="field-label">อาหารและปริมาณ<textarea name="description" required maxlength="2000" rows="3" placeholder="เช่น ข้าวกะเพราไก่ 1 จาน ไข่ดาว 1 ฟอง"></textarea></label><label class="field-label">ภาพอาหาร ถ้ามี<input name="image" type="file" accept="image/*" capture="environment"></label><p class="field-help">คำเล่าและภาพที่เลือกจะส่งให้ OpenAI เพื่อประมาณอาหาร</p><p id="meal-status" role="status"></p><div id="meal-estimate"></div><button class="button primary full" type="submit">ช่วยประมาณมื้อนี้</button><div id="meal-confirm"></div></form>`,'meal-modal');
}
async function requestJSON(path, body) {
  const response = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || tr('เชื่อมต่อไม่สำเร็จค่ะ ลองอีกครั้งได้'));
  return result;
}
async function estimateMeal(form) {
  const status = document.querySelector('#meal-status');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; status.textContent = tr('กำลังดูมื้ออาหารและประมาณปริมาณค่ะ…');
  try {
    const fields = new FormData(form);
    const file = fields.get('image');
    const image = file?.size ? await photoFromFile(file) : undefined;
    const result = await requestJSON('/api/analyze-meal',{language:getLanguage(),description:fields.get('description'),image});
    if (!form.isConnected) return;
    ui.pendingHealthSource='form';
    ui.pendingHealth = normalizeObservation({kind:'meal',source:image?'camera':'manual',confirmed:false,payload:{description:result.estimate.description,portion:result.estimate.portion,nutrition:knownNutrition(result.estimate.nutrition),assumptions:[...(result.estimate.assumptions || []),...(result.estimate.unknowns || [])],confidence:result.estimate.confidence}});
    document.querySelector('#meal-estimate').innerHTML = mealEstimateMarkup(result.estimate);
    document.querySelector('#meal-confirm').innerHTML = button('confirm-health',tr('ข้อมูลถูกต้อง บันทึกมื้อนี้'),'check','button primary full');
    status.textContent = tr('ตรวจชื่ออาหาร ปริมาณ และข้อสมมติก่อนยืนยันค่ะ');
  } catch (error) { if (form.isConnected) status.textContent = error.message; }
  finally { if(form.isConnected) submit.disabled = false; }
}
function knownNutrition(nutrition = {}) {
  return Object.fromEntries(Object.entries(nutrition).filter(([,v])=>v && Number.isFinite(v.min) && Number.isFinite(v.max) && v.max > v.min));
}
async function confirmHealthObservation() {
  if (!ui.pendingHealth) return false;
  const pending = ui.pendingHealth;
  addEvent({...pending,id:crypto.randomUUID(),confirmed:true,payload:{...pending.payload,confirmed:true}});
  ui.pendingHealth = null; ui.savedTurn = ui.userTurn;
  if(ui.dialog === 'meal') closeDialog();
  await workspace.flush();
  showMascotSuccess();
  toast(tr('บันทึกข้อมูลที่ยืนยันลงฐานข้อมูลแล้วค่ะ'));
  return true;
}
async function realtimeTool(call) {
  const catalog=await loadAppCommandCatalog();
  const definition=catalog.actions.find(a=>a.action===call.args?.action);
  const label=call.tool==='app.action'?(tr(definition?.label) || tr('ทำรายการที่ขอ')):({'medication.lookup':tr('เช็กข้อมูลยาจากฉลาก'),'web.search':tr('ค้นเว็บไซต์'),'knowledge.lookup':tr('ค้นแหล่งข้อมูล'),'record_observation':tr('จดเรื่องสุขภาพ'),'camera.open':tr('เปิดกล้อง'),'camera.close':tr('ปิดกล้อง'),'camera.switch':tr('สลับกล้อง'),'camera.capture':tr('ถ่ายภาพ')}[call.tool] || tr('ทำรายการที่ขอ'));
  const id=call.callId || crypto.randomUUID();
  const pendingBefore=ui.pendingAppAction || ui.pendingHealth, priorActivity=ui.pendingActivityId;
  const presentation=actionPresentation(call,{route:ui.route,dialog:ui.dialog,plans:state.calendarPlans || [],records:state.events,describe});
  placeToolActivity();toolActivity.start({id,label,...presentation});
  try {
    const result=await durableToolResult(await performTool(call),{mutation:definition?.mutation,workspace,onSaving:()=>toolActivity.progress(id,{phase:'saving'})});
    if(result?.storage?.saved)showMascotSuccess();
    const waiting=result?.requiresConfirmation===true;
    if(waiting) {
      if(priorActivity && priorActivity!==id)toolActivity.finish(priorActivity,{status:'cancelled',message:tr('ใช้รายการที่อ่านทวนล่าสุดแทน')});
      ui.pendingActivityId=id;
    } else if(priorActivity && pendingBefore && !(ui.pendingAppAction || ui.pendingHealth)) {
      if(call.args?.action==='health.cancel')toolActivity.finish(priorActivity,{status:'cancelled',message:tr('ยกเลิกรายการที่ยังไม่บันทึก')});
      else if(result?.storage?.saved)toolActivity.finish(priorActivity,{status:'success',message:tr('ได้รับคำยืนยันและเก็บในฐานข้อมูลแล้ว')});
      ui.pendingActivityId=null;
    }
    toolActivity.finish(id,{status:result?.ok===false?'error':waiting?'confirmation':'success',message:result?.error || (waiting?(result.readback || proposalReadback(ui.pendingAppAction?.call) || (ui.pendingHealth?describe(ui.pendingHealth):'') || tr('รออ่านทวนและคำยืนยัน')):activityResultMessage(result)),sources:result?.sources,location:activityLocation({route:ui.route,dialog:ui.dialog})});
    placeToolActivity();
    return result;
  }catch(error){
    toolActivity.finish(id,{status:'error',message:workspace?.pending?tr('ยังยืนยันการบันทึกลงฐานข้อมูลไม่ได้ เก็บฉบับรอส่งไว้แล้ว'):error.message});
    throw error;
  }
}
function proposalReadback(call){
  if(!call)return '';
  const record=call.id?state.events.find(e=>e.id===call.id && !e.isDemo):null;
  const plan=call.id?(state.calendarPlans || []).find(p=>p.id===call.id):null;
  const stamp=value=>new Date(value).toLocaleString(intlLocale(),{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'});
  const fields={systolic:tr('ความดันบน'),diastolic:tr('ความดันล่าง'),value:tr('ค่าที่วัด'),unit:tr('หน่วย'),text:tr('รายละเอียด'),description:tr('อาหาร'),portion:tr('ปริมาณ'),status:tr('การกินยา'),reason:tr('เหตุผล'),medicationName:tr('ชื่อยา'),measured:tr('เป็นค่าจากเครื่องวัด'),mealRelation:tr('ช่วงเทียบมื้ออาหาร'),noSymptoms:tr('ยืนยันไม่มีอาการ'),minutesAfterMeal:tr('นาทีหลังอาหาร'),medicationRelation:tr('ช่วงเทียบยา'),minutesAfterMedication:tr('นาทีหลังยา')};
  const values={taken:tr('กินแล้ว'),missed:tr('ลืมกิน'),partial:tr('กินไม่ครบ'),unknown:tr('ยังไม่ทราบ'),before_meal:tr('ก่อนอาหาร'),after_meal:tr('หลังอาหาร'),fasting:tr('อดอาหาร'),random:tr('เวลาอื่น'),after_medication:tr('หลังใช้ยา'),true:tr('ใช่'),false:tr('ไม่ใช่')};
  if(call.action==='record.delete')return html`ลบ ${describe(record)} · ${stamp(record.occurredAt)} ออกจากบันทึกปัจจุบัน สรุปที่เก็บแล้วคงเดิม`;
  if(call.action==='record.update')return html`แก้ ${describe(record)} · ${stamp(record.occurredAt)} เป็น ${Object.entries(call.patch).map(([k,v])=>`${fields[k] || k} ${values[v] ?? v}`).join(' · ')}${call.occurredAt?tr(' เวลา ')+stamp(call.occurredAt):''}`;
  if(call.action==='calendar.cancel')return html`ยกเลิก ${plan.title} · ${plan.date} เวลา ${plan.at}`;
  if(call.action==='calendar.add' || call.action==='calendar.update')return html`${call.title} · ${thaiDate(new Date(call.date+'T12:00:00+07:00'))} เวลา ${call.at} น.${call.note?' · '+call.note:''}`;
  return [call.action==='health.confirm' && ui.pendingHealth?describe(ui.pendingHealth):'',call.field,call.value,call.id==='morning'?tr('มื้อเช้า'):call.id==='evening'?tr('มื้อเย็น'):'',call.controlStatus?values[call.controlStatus] || call.controlStatus:'',typeof call.enabled==='boolean'?(call.enabled?tr('เปิด'):tr('ปิด')):''].filter(Boolean).join(' · ');
}
async function performTool({tool,args}) {
  if(tool==='app.action') return executeAppAction(args);
  if(tool==='web.search' || tool==='knowledge.lookup' || tool==='medication.lookup') {
    const session=ui.conversationId,request=ui.searchRequest=(ui.searchRequest || 0)+1;
    const path=tool==='medication.lookup'?'/api/medication-lookup':tool==='web.search'?'/api/web-search':'/api/knowledge/search';
    const body=tool==='medication.lookup'?{name:args.name,strength:args.strength ?? null,topic:args.topic || 'general'}:tool==='web.search'?{query:args.query}:{query:args.query,external:args.external===true};
    const result=await requestJSON(path,body);
    if(session!==ui.conversationId || request!==ui.searchRequest)return {ok:false,error:tr('บทสนทนาเปลี่ยนแล้ว ขอค้นอีกครั้งตามคำถามล่าสุด')};
    ui.lastKnowledge=result;
    return result;
  }
  if (tool === 'record_observation') {
    ui.pendingAppAction=null;
    if(!ui.voicePresentation) throw new Error(tr('ไม่มีสายสนทนานี้แล้ว'));
    const recordConversation=ui.conversationId, recordTurn=ui.userTurn;
    if(!workspace?.ready || workspace.blocked)throw new Error(tr('ฐานข้อมูลยังไม่พร้อม ขอเปิดฉบับล่าสุดก่อนจดเพิ่มค่ะ'));
    if (ui.savedTurn != null && ui.savedTurn === ui.userTurn) return {saved:true,message:tr('บันทึกรายการนี้แล้ว ไม่บันทึกซ้ำ')};
    const confirmedSpeech = ui.pendingHealthSource==='voice' && ui.pendingHealthTurn<ui.userTurn && ui.transcriptTurn===ui.userTurn && isExplicitConfirmation(ui.lastUserTranscript) && Date.now()-ui.pendingHealthAt<300000;
    if (ui.pendingHealth && confirmedSpeech && args.confirmed===true) { await confirmHealthObservation(); return {saved:true,message:tr('บันทึกข้อมูลที่ผู้ใช้ยืนยันแล้ว คุยต่อได้')}; }
    const kind = args.kind === 'bloodGlucose' ? 'glucose' : args.kind;
    let observation;
    if(kind === 'meal') {
      const result = await requestJSON('/api/analyze-meal',{language:getLanguage(),description:args.description || args.text,image:ui.stage?.root.dataset.camera==='live'?camera.capture(ui.stage.video):undefined});
      if(!ui.voicePresentation || ui.conversationId!==recordConversation || ui.userTurn!==recordTurn) throw new Error(tr('ข้ามมื้อที่ยกเลิกหรือเปลี่ยนบทสนทนาแล้ว'));
      observation = normalizeObservation({kind,source:'speech',confirmed:false,payload:{description:result.estimate.description,portion:result.estimate.portion,nutrition:knownNutrition(result.estimate.nutrition),confidence:result.estimate.confidence,assumptions:[...(result.estimate.assumptions || []),...(result.estimate.unknowns || [])]}});
      observation.occurredAt=observationTime(args.occurredAt);
      ui.pendingHealthSource='voice';ui.pendingHealthTurn=ui.userTurn;ui.pendingHealthAt=Date.now();
      ui.pendingHealth = observation;
      return {saved:false,requiresConfirmation:true,estimate:result.estimate,instruction:tr('อ่านช่วงโภชนาการและข้อสมมติ แล้วถามยืนยันอีกครั้งก่อนบันทึก')};
    }
    if(['bloodPressure','temperature'].includes(kind)) {
      if(kind==='bloodPressure' && !(args.systolic>=40 && args.systolic<=300 && args.diastolic>=20 && args.diastolic<args.systolic)) throw new Error(tr('ขอค่าจากเครื่องวัดอีกครั้งค่ะ'));
      if(kind==='temperature' && !(args.value>=25 && args.value<=45)) throw new Error(tr('ขออุณหภูมิจากเครื่องวัดอีกครั้งค่ะ'));
      observation = {kind,source:'voice',occurredAt:new Date().toISOString(),confirmed:false,isDemo:false,payload:kind==='bloodPressure'?{systolic:args.systolic,diastolic:args.diastolic}:{value:args.value}};
    } else observation = normalizeObservation({kind,source:'speech',confirmed:false,payload:{...args,measured:args.measured===true,mealRelation:args.mealRelation || 'unknown'}});
    observation.occurredAt=observationTime(args.occurredAt);
    ui.pendingHealthSource='voice';ui.pendingHealthTurn=ui.userTurn;ui.pendingHealthAt=Date.now();
    ui.pendingHealth = observation;
    return {saved:false,requiresConfirmation:true,readback:describe(observation)+' · '+new Date(observation.occurredAt).toLocaleString(intlLocale(),{timeZone:'Asia/Bangkok'}),instruction:tr('อ่านทวนชื่อ ค่า และเวลา แล้วขอคำยืนยันในรอบพูดถัดไป ใช้ health.confirm โดยไม่เปลี่ยนข้อมูลที่อ่านทวน')};
  }
  if(tool === 'report.preview') { navigateWhileTalking('summary'); return {summary:summarizeHealth(state.events,state.profile || {}),instruction:tr('พูดสรุปเฉพาะข้อมูลที่ยืนยัน แยกค่าประมาณและค่าวัด ไม่ปิดสาย')}; }
  if(tool === 'conversation.end') { endConversation(); return {ended:true}; }
  const result = await executeTool({tool,args},voiceToolHandlers);
  return result;
}
async function generatePhysicianNarrative(target) {
  const host=document.querySelector('#physician-ai-narrative'); if(!host)return;
  target.disabled=true; host.textContent=tr('กำลังบันทึกและเรียบเรียงจากข้อมูลที่ยืนยันแล้ว…');
  try {
    const period=summarizeHealth(state.events,state.profile || {}).period;
    const events=state.events.filter(e=>!e.isDemo && (e.confirmed===true || e.payload?.confirmed===true) && Date.parse(e.occurredAt)>=Date.parse(period.from) && Date.parse(e.occurredAt)<=Date.parse(period.to));
    await workspace.flush();
    const result=await requestJSON('/api/physician-summary',{language:getLanguage()});
    if(host.isConnected)host.innerHTML=html`<section class="ai-narrative"><h2>ฉบับเรียบเรียงโดย AI</h2><p>${esc(result.report.summary)}</p>${result.report.sections.map(section=>`<h3>${esc(section.title)}</h3><ul>${[...section.observations,...section.missing,...section.questions].map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`).join('')}<p>เก็บสรุปเวอร์ชัน ${esc(result.snapshotId.slice(0,8))} ใน PostgreSQL แล้ว · ให้แพทย์ตรวจทานร่วมกับบันทึกต้นทาง</p></section>`;
    return {ok:true,report:result.report};
  }catch(error){if(host.isConnected)host.textContent=error.message;return {ok:false,error:error.message};}
  finally{if(target.isConnected)target.disabled=false;}
}
function carePlanDialog() {
  const control=state.profile?.diabetes?.controlStatus || 'unknown';
  showDialog('care-plan',html`${modalHeader(tr('แผนที่แพทย์แจ้ง'),tr('ใช้เพื่อเลือกคำถามติดตาม ไม่ใช้วินิจฉัย'),'file')}<form id="care-plan-form" class="record-form"><label class="field-label">สถานะเบาหวานตามแผน<select name="controlStatus">${[['unknown',tr('ยังไม่มีข้อมูล')],['controlled',tr('แพทย์แจ้งว่าควบคุมได้')],['uncontrolled',tr('แพทย์แจ้งว่ายังควบคุมไม่ได้')]].map(([v,t])=>`<option value="${v}" ${control===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="toggle-row"><span><strong>สถานะนี้มาจากแผนแพทย์ที่ได้รับ</strong><small>เป็นคำยืนยันของผู้ใช้ ยังไม่ได้ตรวจเอกสารกับสถานพยาบาล</small></span><input name="clinicianPlan" type="checkbox" role="switch"><span class="toggle-ui"></span></label><p class="field-help">ทำตามแผนวัดน้ำตาลและแผนยารายบุคคล แม้ระบุว่าควบคุมได้</p><button class="button primary full" type="submit">บันทึกแผนที่แจ้ง</button></form>`);
}

function glucoseMetric() {
 const reading=state.events.filter(e=>e.kind==='glucose' && e.confirmed && !e.isDemo).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt))[0];
 return html`<button class="metric-card glucose-metric" data-action="glucose-talk"><div class="metric-label">${icon('heart')}<span>น้ำตาลในเลือด</span></div><div class="metric-value ${reading?'':'no-reading'}">${reading?esc(reading.payload.value):tr('ยังไม่มีบันทึก')}${reading?'<span class="metric-unit">mg/dL</span>':''}</div><div class="metric-meta">${reading?tr('ค่าจากเครื่องวัด · ')+time(reading.occurredAt)+tr(' น.'):tr('เล่าค่าที่วัดให้ลูกหลานฟังได้')}</div></button>`;
}

function profileDialog(){
  const scrollTop=ui.dialog==='profile'?modal.scrollTop:0;
  const c=settingsCopy(getLanguage());
  showDialog('profile',modalHeader(c.title,'','settings')+settingsMarkup({language:getLanguage(),largeText:state.largeText,audioProfile:state.audioProfile || 'speaker',storageReady:workspace?.ready,storagePending:workspace?.pending}),'settings-modal');
  modal.scrollTop=scrollTop;
}
async function applyLanguage(language){
  const settingsOpen=ui.dialog==='profile';
  await voice.setLanguage(language);
  state.language=language;
  setLanguage(language);
  saveState();
  render();
  toolActivity.render();
  if(settingsOpen)profileDialog();
  return {ok:true,language,message:language==='en'?'Menus and conversation are now in English':'เปลี่ยนเมนูและภาษาสนทนาเป็นภาษาไทยแล้ว'};
}
function currentVoiceContext(includeRecords = true) {
  return {language:getLanguage(),interface:interfaceSnapshot(ui,{form:panelModal.open?panelModal.querySelector('form'):null,activityCollapsed:toolActivity.collapsed}),today:dateKey(),calendarDate:ui.calendarDate || dateKey(),calendarPlans:(state.calendarPlans || []).filter(p=>p.status!=='cancelled' && p.date>=(ui.calendarDate || dateKey())).sort((a,b)=>a.date.localeCompare(b.date)||a.at.localeCompare(b.at)).slice(0,30),audioProfile:state.audioProfile || 'speaker',now:new Date().toISOString(),timeZone:'Asia/Bangkok',knowledge:{local:tr('เอกสารสาธารณะที่คัดไว้'),web:tr('web_search ค้นเว็บไซต์ทั่วไปได้ ไม่แนบข้อมูลผู้ป่วย'),external:tr('MCP เพิ่มเติมต้องตั้งค่า')},route:ui.route,filter:ui.filter,historyQuery:ui.historyQuery || '',showDemo:ui.showDemo===true,largeText:state.largeText,sharing:state.sharing,callPlan:state.callPlan || {},profile:state.profile || {},schedules,activities:state.activities,editingRecordId:(ui.dialog==='record'?ui.editing:ui.editingRecordId) || null,pendingAction:ui.pendingAppAction?.call || null,pendingHealth:ui.pendingHealth || null,records:includeRecords?state.events.filter(e=>!e.isDemo && e.confirmed).slice(-20).map(e=>({...e,payload:Object.fromEntries(Object.entries(e.payload).filter(([k])=>!['image','frames','audio'].includes(k)))})):undefined,alerts:workspace?.alerts.slice(0,20) || [],storage:{revision:workspace?.revision,ready:workspace?.ready,error:workspace?.error},limitations:[tr('ไมค์ที่ปิดแล้วต้องแตะเปิดใหม่'),tr('การแบ่งปันเป็นภาพตัวอย่างในเครื่อง'),tr('โทรเข้าเป็นสายสาธิต'),tr('การบันทึก PDF และเลือกไฟล์ใช้หน้าต่างระบบ')]};
}
function showMascotSuccess() {
  clearTimeout(ui.mascotTimer);
  const session=ui.conversationId;
  ui.mascotSuccessUntil=Date.now()+950;
  setMascotState('success');
  ui.mascotTimer=setTimeout(()=>{if(ui.conversationId===session) setMascotState(ui.voicePhase || 'idle');},950);
}
function findVoiceRecord(id) {
  const entry=state.events.find(e=>e.id===id && !e.isDemo);
  if(!entry) throw new Error(tr('ยังไม่พบบันทึกนี้ ขออ่านรายการล่าสุดให้เลือกก่อนค่ะ'));
  return entry;
}
function updateVoiceRecord(call) {
  const entry=findVoiceRecord(call.id);
  if(['dose','call'].includes(entry.kind)) throw new Error(tr('รายการนี้ใช้การยืนยันหรือยกเลิกกินยาโดยตรงค่ะ'));
  const payload={...entry.payload,...call.patch,confirmed:true};
  const allowed={bloodPressure:['systolic','diastolic'],temperature:['value','unit'],photo:['text'],meal:['text','description','portion'],glucose:['value','unit','measured','mealRelation','minutesAfterMeal'],adherence:['status','medicationName','reason','text'],symptom:['text','noSymptoms','medicationRelation','minutesAfterMedication','medicationName']};
  if(Object.keys(call.patch).some(k=>!allowed[entry.kind]?.includes(k))) throw new Error(tr('ข้อมูลที่ขอแก้ไม่ตรงชนิดบันทึกค่ะ'));
  if(entry.kind==='bloodPressure' && !(payload.systolic>payload.diastolic && payload.systolic>=40 && payload.systolic<=300 && payload.diastolic>=20 && payload.diastolic<=200)) throw new Error(tr('ขอค่าบนและค่าล่างจากเครื่องวัดให้ถูกต้องอีกครั้งค่ะ'));
  if(entry.kind==='temperature' && !(payload.value>=25 && payload.value<=45)) throw new Error(tr('ขอตรวจอุณหภูมิจากเครื่องวัดอีกครั้งค่ะ'));
  let replacement;
  if(['meal','glucose','adherence','symptom'].includes(entry.kind)) {
    if(entry.kind==='meal' && Object.keys(call.patch).length) { payload.description=call.patch.description || call.patch.text || payload.description; payload.nutrition={};payload.nutritionBasis='estimate';payload.confidence='low';payload.assumptions=[tr('แก้รายละเอียดอาหารแล้ว ต้องประมาณโภชนาการใหม่')]; }
    replacement={...entry,...normalizeObservation({kind:entry.kind,source:'speech',occurredAt:entry.occurredAt,confirmed:true,payload})};
  } else replacement={...entry,payload,confirmed:true,source:'voice'};
  if(call.occurredAt)replacement.occurredAt=observationTime(call.occurredAt);
  state.events=state.events.map(e=>e.id===entry.id?{...replacement,id:entry.id,updatedAt:new Date().toISOString()}:e);
  saveState();render();
  return {id:entry.id,kind:entry.kind,text:describe(replacement),nutritionInvalidated:entry.kind==='meal' && Object.keys(call.patch).length>0};
}
async function executeAppAction(raw) {
  const catalog=await loadAppCommandCatalog();
  let call=validateAppAction(raw,catalog);
  if(call.action==='health.confirm' && !ui.pendingAppAction && !ui.pendingHealth)throw new Error(tr('ยังไม่มีรายการรอยืนยันค่ะ'));
  if(call.action==='health.confirm' && ui.pendingAppAction) call={...ui.pendingAppAction.call,confirmed:call.confirmed};
  const confirmationContext={transcript:ui.lastUserTranscript,currentTurn:ui.userTurn,transcriptTurn:ui.transcriptTurn,session:ui.conversationId,explicitConfirmationFn:text=>isExplicitAppConfirmation(text,{action:call.action})};
  if(requiresSpokenConfirmation(call,catalog)) {
    if(!workspace?.ready || workspace.blocked)throw new Error(tr('ฐานข้อมูลยังไม่พร้อม ขอเปิดฉบับล่าสุดก่อนแก้ไขค่ะ'));
    if(['record.delete','record.update'].includes(call.action))findVoiceRecord(call.id);
    if(call.action==='calendar.cancel' && !(state.calendarPlans || []).some(p=>p.id===call.id && p.status!=='cancelled'))throw new Error(tr('ไม่พบนัดที่ต้องการยกเลิกค่ะ'));
    if(call.occurredAt)call.occurredAt=observationTime(call.occurredAt);
    try {
      if(call.action==='health.confirm' && ui.pendingHealth) {
        if(ui.pendingHealthSource!=='voice' || !(ui.userTurn>ui.pendingHealthTurn) || Date.now()-ui.pendingHealthAt>300000)throw new Error(tr('ขออ่านทวนใหม่ค่ะ'));
        call=authorizeAppAction(call,confirmationContext,catalog);
      } else call=authorizeProposal(call,ui.pendingAppAction,confirmationContext,catalog);
    }catch {
      const staged=proposeAction(call,confirmationContext,catalog);
      if(call.action!=='health.confirm'){ui.pendingHealth=null;ui.pendingHealthSource=null;}
      ui.pendingAppAction=staged;
      return {...staged,readback:proposalReadback(call),instruction:tr('ยังไม่ทำรายการ อ่าน readback เป็นภาษาพูด แล้วถามยืนยัน รอเสียงรอบถัดไปก่อนเรียกคำสั่งเดิม confirmed:true หรือ health.confirm ห้ามเปลี่ยนค่าที่ผู้ใช้กำลังยืนยัน')};
    }
  }
  let result={ok:true};
  switch(call.action) {
    case 'language.set': result=await applyLanguage(call.language);break;
    case 'app.inspect': result.interface=currentVoiceContext(false).interface;result.operations=toolActivity.items.slice(-4).map(item=>({label:item.label,status:item.status,phase:item.phase,message:item.message}));result.message=tr('อ่านหน้าจอ รายการที่เลือก และงานล่าสุดแล้ว');break;
    case 'calendar.form.open': {const visible=currentVoiceContext(false).interface.form;const prior=visible?.kind==='calendar-plan-form' && (!call.id || call.id===visible.values.planId)?visible.values:{};const draft=Object.keys(call).length>1?{...prior,...call}:call;const selectedId=call.id || (Object.keys(call).length>1?prior.planId:undefined);if(draft.date && !validCalendarDate(draft.date))throw new Error(tr('วันที่นัดไม่ถูกต้องค่ะ'));if(draft.date)ui.calendarDate=draft.date;calendarPlanDialog(selectedId,draft);result.interface=currentVoiceContext(false).interface;result.message=tr('เตรียมแบบฟอร์มแล้ว ยังไม่บันทึก');break;}
    case 'activity.open': toolActivity.setCollapsed(false);break;
    case 'activity.close': toolActivity.setCollapsed(true);break;
    case 'web.search': result=await performTool({tool:'web.search',args:{query:call.text}});break;
    case 'record.delete': {const entry=findVoiceRecord(call.id);if(['dose','call'].includes(entry.kind))throw new Error(tr('รายการนี้ใช้ยกเลิกการยืนยันกินยาหรือประวัติสายโดยตรงค่ะ'));state.events=state.events.filter(e=>e.id!==entry.id);saveState();render();result.message=tr('ลบออกจากบันทึกปัจจุบันแล้ว สรุปที่เก็บไว้ก่อนหน้านี้คงเดิม');break;}
    case 'calendar.select': selectCalendarDate(call.date);break;
    case 'calendar.move': selectCalendarDate(shiftMonth(ui.calendarDate || dateKey(),call.direction==='next'?1:-1));break;
    case 'calendar.add': {const plan=saveCalendarPlan(call);if(ui.dialog==='calendar-plan')closeDialog();selectCalendarDate(plan.date);result={ok:true,id:plan.id,message:tr('บันทึกนัดส่วนตัวแล้ว ไม่ได้จองกับโรงพยาบาลหรือส่งแจ้งเตือน')};break;}
    case 'calendar.update': {const plan=saveCalendarPlan(call);if(ui.dialog==='calendar-plan')closeDialog();selectCalendarDate(plan.date);result={ok:true,id:plan.id,message:tr('แก้ไขนัดที่ยืนยันแล้ว')};break;}
    case 'calendar.cancel': cancelCalendarPlan(call.id);render();result.message=tr('ยกเลิกนัดแล้ว เก็บประวัติไว้');break;
    case 'audio.settings': audioSettingsDialog();break;
    case 'audio.profile': result=await updateAudioProfile(call.audioProfile);if(ui.dialog==='profile')profileDialog();break;
    case 'knowledge.sources': {const sources=await knowledgeSourcesDialog();result=sources?.ok===false?sources:{ok:true,message:tr('แสดงแหล่งที่คัดไว้และสถานะการตั้งค่าจริง')};break;}
    case 'alert.acknowledge': await workspace.acknowledge(call.id);result.message=tr('รับทราบแล้ว ยังไม่ถือว่าปัญหาจบ');break;
    case 'summary.history': {const reports=await openSummaryHistory();result.summaries=storedSummaryList(reports);result.message=tr('เปิดสรุปที่เก็บในฐานข้อมูลแล้ว');result.instruction=tr('ใช้ summary.read พร้อม id จากรายการนี้เพื่ออ่านเนื้อหา ไม่เดาเนื้อหาจากชื่อหรือจำนวน');break;}
    case 'summary.read': {const reports=await openSummaryHistory(call.id);result.summary=storedSummaryRead(reports,call.id);result.message=tr('เปิดสรุปฉบับที่เลือกแล้ว');break;}
    case 'care.sharing': showDialog('care-sharing',modalHeader(tr('การแบ่งปัน'),tr('ภาพตัวอย่าง'))+careSharingView());break;
    case 'storage.latest': await workspace.openLatest();result.message=tr('เปิดฉบับล่าสุดแล้ว ฉบับที่ยังไม่ส่งสำรองในเครื่อง');break;
    case 'storage.retry': await workspace.retry();result.message=tr('ตรวจการบันทึกอีกครั้งแล้ว');break;
    case 'navigate': navigateWhileTalking(call.route); result.message=tr('เปิดหน้าที่ขอแล้ว ยังคุยในสายเดิม');break;
    case 'history.filter': ui.filter=call.filter;ui.historyQuery=call.text || '';if(typeof call.enabled==='boolean')ui.showDemo=call.enabled;navigateWhileTalking('history');result.message=tr('กรองประวัติแล้ว');break;
    case 'display.large_text': state.largeText=call.enabled;saveState();render();if(ui.dialog==='profile')profileDialog();result.message=call.enabled?tr('ขยายตัวอักษรแล้ว'):tr('ใช้ตัวอักษรปกติแล้ว');break;
    case 'activity.set': state.activities[`${dateKey()}-${call.id}`]=call.enabled;saveState();render();result.message=tr('บันทึกกิจวัตรตามที่ยืนยัน');break;
    case 'call_plan.open': phoneExperience.settings();result.message=tr('เปิดแผนโทรแล้ว พูดเวลาที่อยากแก้ต่อได้');break;
    case 'call_plan.set': state.callPlan={...state.callPlan,[call.field]:call.value};saveState();render();if(ui.dialog==='phone-settings')phoneExperience.settings();result.message=tr('บันทึกแผนโทรสาธิตแล้ว ยังไม่มีการโทรจริง');break;
    case 'mock_call.schedule': minimizeConversation();phoneExperience.action(call.purpose==='symptoms'?'phone-schedule-symptoms':'phone-schedule-mock');result.message=tr('อีก 5 วินาทีจะมีสายเข้าสาธิต');break;
    case 'mock_call.cancel': phoneExperience.action('phone-cancel-mock');result.message=tr('ยกเลิกสายที่รอเรียกเข้าสาธิตแล้ว');break;
    case 'mock_call.preview': phoneExperience.action(call.purpose==='missed'?'phone-preview-missed':call.purpose==='symptoms'?'phone-symptoms':'phone-incoming');result.message=tr('เปิดสายเข้าสาธิตแล้ว');break;
    case 'mock_call.accept': phoneExperience.action('phone-accept');result.message=tr('รับสายสาธิต');break;
    case 'mock_call.decline': phoneExperience.action('phone-decline');result.message=tr('ปฏิเสธสายสาธิต');break;
    case 'sharing.set': state.sharing[call.field]=call.enabled;saveState();navigateWhileTalking('care');result.message=tr('ปรับเฉพาะภาพตัวอย่างฝั่งคนดูแลในเครื่อง ยังไม่ส่งข้อมูลให้บุคคลอื่น');break;
    case 'care_plan.open': carePlanDialog();result.message=tr('เปิดแผนที่แพทย์แจ้งแล้ว พูดสถานะตามแผนได้');break;
    case 'care_plan.set': state.profile={...state.profile,diabetes:{controlStatus:call.controlStatus,confirmedByClinician:call.clinicianReported,provenance:'user-reported-clinician-plan'}};saveState();render();result.message=tr('บันทึกแผนที่ผู้ใช้แจ้ง ไม่ใช่การวินิจฉัยโดยลูกหลาน');break;
    case 'record.open': if(call.kind==='meal')mealDialog();else if(['glucose','adherence'].includes(call.kind)) {voiceDialog({listen:false});result.instruction=call.kind==='glucose'?tr('ถามค่าน้ำตาลจากเครื่องวัดและเวลาเทียบมื้ออาหาร ก่อนอ่านทวนยืนยัน'):tr('ถามความต่อเนื่องของยา มื้อที่กินหรือที่ลืม แล้วอ่านทวนก่อนยืนยัน');}else recordDialog(call.kind || 'bloodPressure');break;
    case 'record.list': {const entries=state.events.filter(e=>!e.isDemo && e.confirmed && (!call.kind || e.kind===call.kind) && (!call.date || dateKey(new Date(e.occurredAt))===call.date) && (!call.text || describe(e).toLocaleLowerCase().includes(call.text.toLocaleLowerCase()))).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.id.localeCompare(b.id));const offset=call.offset || 0,limit=call.limit || 10;result={ok:true,total:entries.length,nextOffset:offset+limit<entries.length?offset+limit:null,records:entries.slice(offset,offset+limit).map(e=>({id:e.id,kind:e.kind,text:describe(e),at:e.occurredAt,confirmed:e.confirmed}))};break;}
    case 'calendar.list': {const entries=(state.calendarPlans || []).filter(p=>(call.includeCancelled || p.status!=='cancelled') && (!call.date || p.date===call.date) && (!call.text || p.title.toLocaleLowerCase().includes(call.text.toLocaleLowerCase()))).sort((a,b)=>a.date.localeCompare(b.date)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id));const offset=call.offset || 0,limit=call.limit || 10;result={ok:true,total:entries.length,nextOffset:offset+limit<entries.length?offset+limit:null,plans:entries.slice(offset,offset+limit)};break;}
    case 'record.edit': {const entry=findVoiceRecord(call.id);ui.editingRecordId=entry.id;ui.filter=entry.kind;navigateWhileTalking('history');result.record={id:entry.id,kind:entry.kind,text:describe(entry),payload:Object.fromEntries(Object.entries(entry.payload).filter(([k])=>!['image','frames','audio'].includes(k)))};result.instruction=tr('อ่านค่าปัจจุบัน แล้วถามว่าจะแก้อะไร ยังไม่บันทึกจนกว่าจะอ่านทวนและยืนยัน');break;}
    case 'record.update': result.record=updateVoiceRecord(call);result.message=tr('แก้บันทึกที่ผู้ใช้ยืนยันแล้ว');break;
    case 'dose.take': takeDose(call.id,'voice');result.message=tr('ยืนยันกินยามื้อนี้แล้ว');break;
    case 'dose.undo': state.events=state.events.filter(e=>!(e.payload.scheduleId===call.id && ((e.kind==='dose' && e.payload.dateKey===dateKey()) || (e.kind==='adherence' && e.confirmed===true && e.payload.status==='taken' && dateKey(new Date(e.occurredAt))===dateKey()))));saveState();render();result.message=tr('ยกเลิกการยืนยันมื้อที่กดผิดแล้ว');break;
    case 'reminder.snooze': state.snooze=Date.now()+600000;saveState();scheduleSnooze();render();result.message=tr('เลื่อนเตือนยา 10 นาที ขณะเปิดเว็บนี้ไว้');break;
    case 'report.preview': navigateWhileTalking('summary');result.summary=summarizeHealth(state.events,state.profile || {});result.instruction=tr('สรุปด้วยเสียงจากข้อมูลที่ยืนยันและค่าที่ขาด แยกค่าประมาณจากค่าวัด');break;
    case 'report.print': reportDialog();window.print();result.message=tr('เปิดหน้าพิมพ์แล้ว ผู้ใช้ต้องเลือกปลายทางและยืนยันบันทึกในหน้าต่างระบบ');break;
    case 'summary.generate': navigateWhileTalking('summary');result=await generatePhysicianNarrative(document.querySelector('[data-action="ai-summary"]'));break;
    case 'meal.open': mealDialog();result.message=tr('เปิดมื้ออาหารแล้ว เล่าอาหารและปริมาณได้เลย');break;
    case 'meal.estimate': { ui.pendingAppAction=null; const session=ui.conversationId, turn=ui.userTurn;const estimate=await requestJSON('/api/analyze-meal',{language:getLanguage(),description:call.text || ui.lastUserTranscript,image:ui.stage?.root.dataset.camera==='live'?camera.capture(ui.stage.video):undefined});if(!ui.voicePresentation || session!==ui.conversationId || turn!==ui.userTurn)throw new Error(tr('ข้ามมื้อที่เปลี่ยนบทสนทนาหรือยกเลิกแล้ว'));ui.pendingHealthSource='voice';ui.pendingHealthTurn=ui.userTurn;ui.pendingHealthAt=Date.now();ui.pendingHealth=normalizeObservation({kind:'meal',source:'speech',confirmed:false,payload:{description:estimate.estimate.description,portion:estimate.estimate.portion,nutrition:knownNutrition(estimate.estimate.nutrition),confidence:estimate.estimate.confidence,assumptions:[...(estimate.estimate.assumptions || []),...(estimate.estimate.unknowns || [])]}});result={ok:true,estimate:estimate.estimate,requiresConfirmation:true,instruction:tr('อ่านช่วงประมาณพร้อมสมมติฐาน แล้วถามยืนยันก่อนบันทึกด้วย health.confirm')};break;}
    case 'meal.talk': voiceDialog({listen:false});result.instruction=tr('ถามว่ามื้อนี้กินอะไรและปริมาณเท่าไร ถามทีละข้อ');break;
    case 'glucose.talk': voiceDialog({listen:false});result.instruction=tr('ถามค่าน้ำตาลที่วัดจริง หน่วย mg/dL และก่อนหรือหลังอาหาร');break;
    case 'health.confirm': result.saved=await confirmHealthObservation();result.message=result.saved?tr('บันทึกรายการที่อ่านทวนแล้ว'):tr('ยังไม่มีรายการรอยืนยัน');break;
    case 'health.cancel': ui.pendingHealth=null;ui.pendingAppAction=null;result.message=tr('ยกเลิกรายการที่ยังไม่บันทึกแล้ว');break;
    case 'voice.repeat': result.instruction=html`อ่านคำตอบล่าสุดซ้ำ: ${ui.lastAssistantTranscript || tr('ลูกหลานฟังอยู่ค่ะ')}`;break;
    case 'voice.mute': voice.mute();result.message=tr('พักไมค์แล้ว ต้องแตะ mascot หรือปุ่มเปิดไมค์เมื่อต้องการพูดต่อ');break;
    case 'voice.unmute': if(voice.active)voice.unmute();else voice.listen();result.message=tr('เปิดไมค์แล้ว');break;
    case 'conversation.minimize': minimizeConversation();result.message=tr('ย่อหน้าคุยแล้ว ยังคุยในสายเดิม');break;
    case 'conversation.restore': voiceDialog({listen:false});result.message=tr('กลับหน้าคุยแล้ว');break;
    case 'conversation.end': endConversation();result.message=tr('จบสายแล้ว');break;
    case 'dialog.close': if(panelModal.open)closeDialog();else minimizeConversation();result.message=tr('ปิดหน้าต่างย่อยแล้ว ยังคุยต่อได้');break;
    case 'profile.open': profileDialog();result.message=tr('เปิดการตั้งค่าแล้ว');break;
    case 'about.open': showDialog('about',html`${modalHeader(tr('ลูกหลาน'),tr('ผู้ช่วย AI สำหรับเรื่องราวระหว่างนัด'),'info')}<div class="simple-modal"><p>เสียงและภาพที่เปิดส่งให้ OpenAI บันทึกที่ยืนยันเก็บใน PostgreSQL และมีสำเนาระหว่างรอในเบราว์เซอร์นี้ โทรเป็นสายสาธิต และการแบ่งปันเป็นเพียงภาพตัวอย่างในเครื่อง</p></div>`);result.message=tr('เปิดข้อมูลเกี่ยวกับลูกหลานแล้ว');break;
    case 'image.choose': {if(ui.dialog!=='meal')mealDialog();const input=document.querySelector('#meal-form input[type="file"]');try{input.showPicker();result.message=tr('เปิดตัวเลือกภาพแล้ว เลือกภาพในหน้าต่างระบบค่ะ');}catch{result={ok:false,message:tr('เบราว์เซอร์ต้องให้ผู้ใช้แตะเลือกภาพเอง หรือพูดเปิดกล้องเพื่อให้ลูกหลานดูภาพสดได้')};}break;}
    default: throw new Error(tr('ยังไม่มีตัวดำเนินการของคำสั่งนี้'));
  }
  if(requiresSpokenConfirmation(call,catalog)) ui.pendingAppAction=null;
  return {...result,view:currentVoiceContext(false)};
}

async function openSummaryHistory(selectedId) {
  showDialog('summary-history',modalHeader(tr('สรุปที่เก็บไว้'),tr('แต่ละฉบับมีเวลาและบันทึกต้นทางให้ทบทวน'))+tr('<div id="summary-archive" class="summary-archive" role="status">กำลังเปิดสรุป…</div>'),'archive-modal');
  const host=document.querySelector('#summary-archive');
  try {const reports=await workspace.summaries();if(selectedId && !reports.some(report=>report.id===selectedId))throw new Error(tr('ไม่พบสรุปฉบับนี้ค่ะ'));if(host.isConnected){host.innerHTML=summaryArchiveMarkup(selectedId?reports.filter(report=>report.id===selectedId):reports);if(selectedId)host.querySelector('.saved-summary')?.setAttribute('open','');}return reports;}
  catch(error){if(host.isConnected)host.textContent=error.message;throw error;}
}
workspace=new WorkspaceClient(state,{
  onChange:()=>{render();},
  onStatus:(phase,message)=>{
    const status=document.querySelector('#storage-status');
    if(status){status.dataset.phase=phase;status.innerHTML=phase==='saved'?tr('เก็บในพื้นที่ครอบครัวแล้ว'):phase==='saving'?tr('กำลังบันทึก…'):phase==='loading'?tr('กำลังเปิดพื้นที่ครอบครัว…'):`${esc(message)} <button class="text-button" data-action="${workspace?.blocked?'storage-latest':'storage-retry'}">${workspace?.blocked?tr('สำรองฉบับนี้ แล้วเปิดฉบับล่าสุด'):tr('ลองอีกครั้ง')}</button>`;}
  }
});
workspace.start();

async function updateAudioProfile(profile){
  const result=await voice.setAudioProfile(profile);
  state.audioProfile=profile;saveState();
  toast(voice.active?tr('ส่งคำขอปรับการรับเสียงในสายเดิมแล้วค่ะ'):tr('เลือกการรับเสียงสำหรับครั้งถัดไปแล้วค่ะ'));
  return {...result,message:tr('บันทึกการรับเสียงที่เลือก ไม่ได้ยืนยันผลลดเสียงจริงบนอุปกรณ์')};
}
function audioSettingsDialog(){
  const current=state.audioProfile || 'speaker';
  showDialog('audio-settings',modalHeader(tr('คุยกันให้ได้ยินชัด'),tr('เลือกให้เหมาะกับวิธีคุย ไม่ต้องเริ่มสายใหม่'),'mic')+html`<div class="simple-modal audio-settings"><p>ลูกหลานจะรอให้เล่าจบ และขอให้ทวนถ้าได้ยินไม่ชัดค่ะ</p>${Object.entries(audioProfileLabels).map(([key,label])=>`<button class="audio-profile-choice" data-action="audio-profile" data-profile="${key}" aria-pressed="${current===key}"><strong>${label}</strong><span>${key==='speaker'?tr('โทรศัพท์หรือลำโพงคอมพิวเตอร์'):key==='headset'?tr('ไมโครโฟนที่อยู่ใกล้ปาก'):tr('กรองเสียงรบกวนและรอช่วงเงียบนานขึ้น')}</span><i aria-hidden="true">${current===key?'✓':''}</i></button>`).join('')}<p class="field-help">เสียงทีวีหรือคนข้าง ๆ อาจยังติดเข้ามาได้ การลดเสียงขึ้นกับอุปกรณ์ หากทำได้ให้หันไมค์เข้าหาตัว และลดเสียงทีวีใกล้ ๆ</p></div>`,'audio-settings-modal');
}
async function knowledgeSourcesDialog(){
  showDialog('knowledge-sources',modalHeader(tr('ลูกหลานใช้ข้อมูลจากไหน'),tr('ดูแหล่งอ้างอิงและสิ่งที่เชื่อมต่อจริง'),'book')+tr('<div class="simple-modal" id="knowledge-sources-body" role="status">กำลังเปิดแหล่งข้อมูล…</div>'),'knowledge-sources-modal');
  const host=document.querySelector('#knowledge-sources-body');
  try {
    const result=await requestJSON('/api/knowledge/sources',{});
    if(!host.isConnected)return;
    host.innerHTML=html`<h3>ค้นเว็บไซต์</h3><p>ค้นความรู้ทั่วไปพร้อมลิงก์อ้างอิง หรือพูดว่า ช่วยค้นเว็บให้หน่อย ได้ขณะคุย</p>${button('web-search-open',tr('ให้ลูกหลานค้นเว็บ'),'book','button primary')}<h3>เอกสารสาธารณะที่คัดไว้</h3><p>ค้นจากคลัง PostgreSQL ก่อนตอบ พร้อมชื่อแหล่งและวันที่ทบทวน</p>${result.local.map(source=>html`<a class="knowledge-source" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(source.title)} ${icon('external')}</strong><small>ทบทวน ${esc(source.reviewedAt)}</small></a>`).join('')}<h3>แหล่งภายนอก</h3><p>${result.mcp.length?result.mcp.map(source=>esc(source.label)+tr(' · ตั้งค่าแล้ว ยังไม่ยืนยันผลเชื่อมต่อ')).join('<br>'):tr('MCP · ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ภายนอก')}</p><p>คลังเอกสาร RAG ภายนอก · ${result.vectorStores?result.vectorStores+tr(' คลังที่ตั้งค่าไว้ ยังไม่ยืนยันผลค้น'):tr('ยังไม่ได้ตั้งค่า')}</p><p>ใช้ค้นความรู้ทั่วไปเมื่อขอค้นภายนอก ไม่แนบบันทึกสุขภาพหรือข้อมูลติดต่อ ไม่ใช้แทนแผนเฉพาะบุคคลจากแพทย์</p>`;
  }catch(error){if(host.isConnected)host.textContent=error.message;return {ok:false,error:error.message};}
}

function selectCalendarDate(date,focus=false){
  if(!validCalendarDate(date))throw new Error(tr('เลือกวันที่ระหว่างปี 2000–2099 ค่ะ'));
  ui.calendarDate=date;
  if(ui.route!=='calendar')navigateWhileTalking('calendar');else render();
  if(focus)document.querySelector(`[data-calendar-date="${date}"]`)?.focus({preventScroll:true});
}
function calendarPlanDialog(id,draft={}){
  if(draft.date && !validCalendarDate(draft.date))throw new Error(tr('วันที่นัดไม่ถูกต้องค่ะ'));
  if(draft.at && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.at))throw new Error(tr('เวลานัดไม่ถูกต้องค่ะ'));
  const plan=id?(state.calendarPlans || []).find(p=>p.id===id&&p.status!=='cancelled'):null;
  if(id&&!plan)throw new Error(tr('ไม่พบนัดนี้ค่ะ'));
  showDialog('calendar-plan',modalHeader(plan?tr('แก้ไขนัดหมาย'):tr('เพิ่มเรื่องที่อยากให้ช่วยจำ'),tr('นัดหมายและกิจกรรมของคนที่เรารัก'),'calendar')+calendarFormMarkup(ui.calendarDate || dateKey(),Object.keys(draft).some(key=>key!=='action')?{...plan,...draft,id:plan?.id}:plan),'calendar-plan-modal');
}
function saveCalendarPlan(raw){
  const existing=raw.id?(state.calendarPlans || []).find(p=>p.id===raw.id&&p.status!=='cancelled'):null;
  if(raw.id&&!existing)throw new Error(tr('ไม่พบนัดนี้ ขอเปิดรายการก่อนค่ะ'));
  const plan=normalizeCalendarPlan({...existing,...raw,id:existing?.id || crypto.randomUUID(),status:'active'});
  state.calendarPlans=existing?state.calendarPlans.map(p=>p.id===plan.id?plan:p):[...(state.calendarPlans || []),plan];
  if(state.calendarPlans.length>300){state.calendarPlans=state.calendarPlans.filter(p=>p!==plan);throw new Error(tr('พื้นที่แผนรองรับ 300 รายการค่ะ'));}
  ui.calendarDate=plan.date;saveState();return plan;
}
function cancelCalendarPlan(id){
  const plan=(state.calendarPlans || []).find(p=>p.id===id&&p.status!=='cancelled');
  if(!plan)throw new Error(tr('ไม่พบนัดที่ต้องการยกเลิกค่ะ'));
  state.calendarPlans=state.calendarPlans.map(p=>p.id===id?{...p,status:'cancelled'}:p);saveState();
}
document.addEventListener('keydown',event=>{
  const target=event.target.closest('[data-calendar-date]');if(!target)return;
  const date=target.dataset.calendarDate;
  const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  const next={ArrowRight:()=>shiftDate(date,1),ArrowLeft:()=>shiftDate(date,-1),ArrowDown:()=>shiftDate(date,7),ArrowUp:()=>shiftDate(date,-7),Home:()=>shiftDate(date,-weekday),End:()=>shiftDate(date,6-weekday),PageUp:()=>shiftMonth(date,-1),PageDown:()=>shiftMonth(date,1)}[event.key];
  if(next){event.preventDefault();const value=next();if(validCalendarDate(value))selectCalendarDate(value,true);}
});

function webSearchDialog(){
  showDialog('web-search',modalHeader(tr('ให้ลูกหลานช่วยค้น'),tr('ค้นความรู้ทั่วไป พร้อมแหล่งอ้างอิง'),'book')+html`<form id="web-search-form" class="record-form" method="post"><label class="field-label">อยากรู้อะไรคะ<input name="query" required minlength="2" maxlength="400" placeholder="เช่น วิธีเตรียมตัวก่อนวัดความดัน"></label><p class="field-help">ส่งเฉพาะคำถามทั่วไปให้ OpenAI ค้นเว็บ กรุณาไม่ใส่ชื่อ ข้อมูลติดต่อ หรือประวัติส่วนตัว</p><button class="button primary" type="submit">ค้นเว็บไซต์</button><p id="web-search-status" role="status"></p><div id="web-search-results"></div></form>`,'web-search-modal');
}
async function submitWebSearch(form){
  const submit=form.querySelector('[type=submit]'),status=form.querySelector('#web-search-status');submit.disabled=true;status.textContent=tr('กำลังค้นแหล่งข้อมูลให้ค่ะ…');
  try{
    const result=await realtimeTool({tool:'web.search',args:{query:new FormData(form).get('query')}});
    if(!form.isConnected)return;
    if(result.ok===false)throw new Error(result.error);
    status.textContent=tr('พบข้อมูลแล้ว เลือกอ่านแหล่งอ้างอิงได้ด้านล่างค่ะ');
    const host=form.querySelector('#web-search-results');host.replaceChildren();const details=document.createElement('details'),summary=document.createElement('summary'),answer=document.createElement('p');summary.textContent=tr('อ่านรายละเอียดผลค้น');details.append(summary,answer);host.append(details);answer.textContent=result.answer.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g,'$1').replace(/\*\*/g,'');
    for(const source of result.sources || []){
      const link=document.createElement('a');link.className='knowledge-source';link.textContent=source.title;link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';host.append(link);
    }
  }catch(error){if(form.isConnected)status.textContent=error.message;}
  finally{if(form.isConnected)submit.disabled=false;}
}
