import {tr,html,getLanguage} from './i18n.js';
import { mascotStageMarkup } from './mascot.js';
import { CallRingtone } from './call-ringtone.js';
import { conversationStageMarkup } from './conversation-stage.js';
import { icon } from './icons.js';
import { thaiDate, time, escapeHTML as esc, newEvent } from './data.js';

export const defaultCallPlan = { medication: true, medicationAt: '08:15', symptoms: true, symptomsAt: '18:30', retry: true };
export function createPhoneCall(purpose = 'medication') {
  return { id: crypto.randomUUID(), purpose: purpose === 'symptoms' ? 'symptoms' : 'medication', step: 'incoming', disposition: null, confirmed: false, answers: {}, startedAt: null, endedAt: null };
}
export function advancePhoneCall(call, event) {
  const now = new Date().toISOString();
  if (['summary', 'unanswered'].includes(call.step)) return call;
  if (event.type === 'defer') return { ...call, step: 'unanswered', disposition: 'deferred', endedAt: now };
  if (event.type === 'wrong-person' && call.step === 'consent') return { ...call, step: 'unanswered', disposition: 'wrong-person', endedAt: now };
  if (call.step === 'incoming') {
    if (event.type === 'accept') return { ...call, step: 'consent', startedAt: now };
    if (['decline', 'missed'].includes(event.type)) return { ...call, step: 'unanswered', disposition: event.type, endedAt: now };
    return call;
  }
  if (event.type === 'end') return { ...call, step: 'summary', disposition: 'partial', endedAt: now };
  if (call.step === 'consent' && event.type === 'ready') return { ...call, step: call.purpose === 'medication' ? 'dose' : 'symptom' };
  if (call.step === 'dose' && event.type === 'dose' && ['taken', 'not-yet'].includes(event.value)) return { ...call, step: 'symptom', answers: { ...call.answers, dose: event.value } };
  if (call.step === 'symptom' && event.type === 'symptom' && typeof event.text === 'string' && event.text.trim()) return { ...call, step: 'review', answers: { ...call.answers, symptom: event.text.trim().slice(0, 1000) } };
  if (call.step === 'review' && event.type === 'confirm') return { ...call, step: 'summary', disposition: 'completed', confirmed: true, endedAt: now };
  if (call.step === 'review' && event.type === 'correct') return { ...call, step: call.purpose === 'medication' ? 'dose' : 'symptom', answers: {} };
  return call;
}

const purposeLabel = purpose => purpose === 'symptoms' ? tr('โทรถามอาการ') : tr('โทรเตือนยา');
const doseLabel = value => value === 'taken' ? tr('บอกว่ากินยาแล้ว') : value === 'not-yet' ? tr('บอกว่ายังไม่ได้กินยา') : tr('ยังไม่ได้ตอบเรื่องยา');
const outcomeLabel = { get completed(){return tr('ยืนยันสรุปแล้ว');}, get partial(){return tr('จบสายก่อนยืนยัน');}, get missed(){return tr('ไม่ได้รับสาย');}, get decline(){return tr('ปฏิเสธสาย');}, get deferred(){return tr('ขอให้โทรภายหลัง');}, get 'wrong-person'(){return tr('ไม่ใช่ผู้รับที่ต้องการ');} };

export function createPhoneExperience({ state, modal, showDialog, closeDialog, voice, persist, render, toast, mockDelayMs = 5000, ringTimeoutMs = 30000 }) {
  let call = null;
  let clock = null;
  let queuedCall = null;
  let mockTimer = null;
  let countdownTimer = null;
  let unansweredTimer = null;
  const ringtone = new CallRingtone();
  function cancelMock() {
    clearTimeout(mockTimer);
    clearInterval(countdownTimer);
    queuedCall = null;
    syncMockPreview();
  }
  function syncMockPreview() {
    if (typeof document === 'undefined') return;
    const label = document.querySelector('#mock-call-countdown');
    const action = document.querySelector('#mock-call-action');
    if (label) label.textContent = queuedCall ? html`ลูกหลานจะโทรมาใน ${Math.max(0, Math.ceil((queuedCall.deadline - Date.now()) / 1000))} วินาที · เปิดหน้านี้ไว้ค่ะ` : tr('ลองสายเตือนยาใน 5 วินาที · เปิดเว็บนี้ไว้และเปิดเสียงอุปกรณ์');
    if (action) { action.dataset.action = queuedCall ? 'phone-cancel-mock' : 'phone-schedule-mock'; action.querySelector('span').textContent = queuedCall ? tr('ยกเลิก') : tr('ลองให้ลูกหลานโทรมา'); }
  }
  function scheduleMock(purpose = 'medication') {
    if (modal.open) closeDialog();
    cancelMock();
    ringtone.unlock();
    queuedCall = { deadline: Date.now() + mockDelayMs };
    syncMockPreview();
    countdownTimer = setInterval(syncMockPreview, 250);
    mockTimer = setTimeout(() => { cancelMock(); incoming(purpose); }, mockDelayMs);
    toast(tr('อีก 5 วินาที ลูกหลานจะโทรเข้าสาธิตค่ะ เปิดเว็บนี้ไว้ได้เลย'));
  }
  function stopRinging() { clearTimeout(unansweredTimer); ringtone.stop(); }
  const button = (action, label, glyph, className = 'button outline', attrs = '') => `<button type="button" data-action="${action}" class="${className}" ${attrs}>${glyph ? icon(glyph) : ''}<span>${label}</span></button>`;
  const plan = () => ({ ...defaultCallPlan, ...state.callPlan });
  function homeCard() {
    const p = plan();
    const scheduled = [p.medication ? html`เตือนยา ${p.medicationAt}` : '', p.symptoms ? html`ถามอาการ ${p.symptomsAt}` : ''].filter(Boolean);
    return html`<button type="button" class="phone-plan-card" data-action="calendar-open" aria-label="ดูปฏิทินแผนดูแล"><span class="phone-plan-icon">${icon('phone')}</span><span class="phone-plan-copy"><strong>ลูกหลานโทรมาดูแล</strong><span>${scheduled.length ? scheduled.join(' · ') : tr('พักแผนการโทรไว้')}</span><small>เปิดดูแผนในปฏิทิน · การโทรยังเป็นสาธิต</small></span>${icon('chevron')}</button><div class="mock-call-preview"><div><strong>ลองรับสายจากลูกหลาน</strong><p id="mock-call-countdown">${queuedCall ? html`ลูกหลานจะโทรมาใน ${Math.max(0, Math.ceil((queuedCall.deadline - Date.now()) / 1000))} วินาที · เปิดหน้านี้ไว้ค่ะ` : tr('ลองสายเตือนยาใน 5 วินาที · เปิดเว็บนี้ไว้และเปิดเสียงอุปกรณ์')}</p></div>${button(queuedCall ? 'phone-cancel-mock' : 'phone-schedule-mock', queuedCall ? tr('ยกเลิก') : tr('ลองให้ลูกหลานโทรมา'), 'phone', 'button outline', 'id="mock-call-action"')}</div>`;
  }
  function settings() {
    const p = plan();
    const history = state.events.filter(e => e.kind === 'call').slice().reverse().slice(0, 3);
    showDialog('phone-settings', html`<header class="modal-header"><div><h2 id="modal-title">ให้ลูกหลานโทรมาดูแล</h2><p>เลือกเวลาที่คุณสะดวกรับสาย</p></div>${button('close', tr('ปิด'), 'close', 'icon-button close-button', tr('aria-label="ปิดหน้าต่าง"'))}</header><div class="phone-settings-body"><div class="phone-channel-note">${icon('phone')}<p><strong>สายเข้าเบอร์โทรปกติ</strong><span>รูปแบบใช้งานจริงรับสายได้โดยไม่ต้องเปิดแอป<br>ต้นแบบนี้จำลองหน้าสายเข้า ยังไม่โทรออกจริง</span></p></div><form id="phone-plan-form"><div class="phone-setting-line"><label class="toggle-row"><span><strong>โทรเตือนยา</strong><small>ถามว่าได้กินยาตามแผนแล้วหรือยัง</small></span><input type="checkbox" role="switch" name="medication" ${p.medication ? 'checked' : ''}><span class="toggle-ui"></span></label><label class="phone-time-label">เวลาโทรเตือนยา<input name="medicationAt" type="time" value="${esc(p.medicationAt)}" required></label></div><div class="phone-setting-line"><label class="toggle-row"><span><strong>โทรถามอาการ</strong><small>ชวนเล่าอาการและความรู้สึกระหว่างวัน</small></span><input type="checkbox" role="switch" name="symptoms" ${p.symptoms ? 'checked' : ''}><span class="toggle-ui"></span></label><label class="phone-time-label">เวลาโทรถามอาการ<input name="symptomsAt" type="time" value="${esc(p.symptomsAt)}" required></label></div><label class="toggle-row"><span><strong>ลองโทรใหม่เมื่อไม่รับสาย</strong><small>ตัวอย่างแผน ลองใหม่ 1 ครั้งหลัง 15 นาที<br>ไม่ได้รับสาย ไม่ถือว่ายังไม่ได้กินยา</small></span><input type="checkbox" role="switch" name="retry" ${p.retry ? 'checked' : ''}><span class="toggle-ui"></span></label><p class="phone-plan-disclaimer">เวลาตามประเทศไทย · บันทึกเป็นแผนสาธิตในเครื่องนี้<br>ยังไม่ได้ตั้งบริการโทรหรือแจ้งคนดูแลจริง</p><button type="submit" class="button primary full">${icon('check')} บันทึกแผนตัวอย่าง</button></form><div class="phone-demo-launch"><h3>ลองดูรูปแบบสายเข้า</h3>${button('phone-schedule-mock', tr('ให้โทรมาใน 5 วินาที'), 'phone', 'button primary')}${button('phone-incoming', tr('สายเตือนยา'), 'pill')}${button('phone-symptoms', tr('สายถามอาการ'), 'heart')}${button('phone-preview-missed', tr('กรณีไม่ได้รับสาย'), 'clock', 'text-button')}</div>${history.length ? html`<div class="phone-recent"><h3>ประวัติสายสาธิต</h3>${history.map(e => html`<div><span>${esc(e.payload.text)}</span><small>${time(e.occurredAt)} น. · ${outcomeLabel[e.payload.disposition] || tr('สาธิต')}</small></div>`).join('')}</div>` : ''}</div>`, 'phone-settings-modal');
  }
  function savePlan(form) {
    const values = new FormData(form);
    const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!validTime.test(values.get('medicationAt') || '') || !validTime.test(values.get('symptomsAt') || '')) return;
    state.callPlan = { medication: values.has('medication'), medicationAt: values.get('medicationAt'), symptoms: values.has('symptoms'), symptomsAt: values.get('symptomsAt'), retry: values.has('retry') };
    persist(); closeDialog(); render(); toast(tr('เก็บแผนโทรตัวอย่างแล้ว ยังไม่มีการโทรจริงค่ะ'));
  }
  function incoming(purpose = 'medication') {
    cancelMock();
    stopRinging();
    showDialog('phone', '', 'phone-modal phone-incoming');
    call = createPhoneCall(purpose);
    paint();
    voice.listen();
    const ringingCall = call;
    ringtone.unlock().then(ready => { if (ready && call === ringingCall && call.step === 'incoming') ringtone.start(); });
    unansweredTimer = setTimeout(() => { if (call === ringingCall && call.step === 'incoming') transition({ type: 'missed' }); }, ringTimeoutMs);
    clock = setInterval(() => {
      const element = document.querySelector('#phone-elapsed');
      if (element && call?.startedAt) element.textContent = elapsed();
    }, 1000);
  }
  function elapsed() {
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(call.startedAt)) / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function question() {
    if (call.step === 'consent') return tr('สวัสดีค่ะ หนูเป็นผู้ช่วยลูกหลานนะคะ ขอคุยกับคุณสมใจค่ะ ตอนนี้สะดวกคุยไหมคะ');
    if (call.step === 'dose') return tr('ยาหลังอาหารเช้าตามแผน วันนี้กินแล้วหรือยังคะ');
    if (call.step === 'symptom') return tr('วันนี้มีอาการอะไรที่อยากให้หนูจดไว้ไหมคะ');
    if(call.step==='review' && getLanguage()==='en')return `${call.answers.dose ? `You ${doseLabel(call.answers.dose)}. ` : ''}You said ${call.answers.symptom}. Have I got that right? If so, say confirm.`;
    if (call.step === 'review') return html`${call.answers.dose ? html`คุณ${doseLabel(call.answers.dose)} และ` : tr('คุณเล่าว่า')} ${call.answers.symptom} หนูจดแบบนี้ถูกไหมคะ ถ้าถูกพูดว่ายืนยันได้เลยค่ะ`;
    return '';
  }
  function paint() {
    if (!call || !modal.open) return;
    const isIncoming = call.step === 'incoming';
    const done = ['summary', 'unanswered'].includes(call.step);
    modal.dataset.callStep = call.step;
    modal.className = `phone-modal ${isIncoming ? 'phone-incoming' : done ? 'phone-finished' : 'phone-connected immersive-conversation'}`;
    if (isIncoming) {
      modal.innerHTML = html`<div class="phone-demo-label">สาธิตสายโทรเข้า · ไม่มีการโทรจริง</div><div class="phone-caller-mark">${icon('phone')}</div><h2 id="modal-title">ลูกหลาน</h2><p class="phone-purpose">${purposeLabel(call.purpose)}</p><p class="phone-channel">สายเข้าเบอร์โทรปกติ</p><div class="phone-ring-visual" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><p class="phone-incoming-copy">พูดว่า “รับสาย” หรือ “ไม่รับสาย” ได้เลยค่ะ</p><div class="phone-incoming-actions">${button('phone-decline', tr('ไม่รับสาย'), 'phone', 'phone-round-action decline')}${button('phone-accept', tr('รับสาย'), 'phone', 'phone-round-action accept')}</div>${button('close', tr('ปิดตัวอย่าง'), 'close', 'phone-dismiss-top', tr('aria-label="ปิดตัวอย่างสายเข้า"'))}`;
      return;
    }
    if (done) { paintSummary(); return; }
    const sphere = mascotStageMarkup();
    modal.innerHTML = html`<header class="conversation-header"><div><h2 id="modal-title">ลูกหลาน</h2><span>${purposeLabel(call.purpose)}</span></div><span class="conversation-presence"><i></i> <span id="phone-elapsed">${elapsed()}</span></span></header><div class="conversation-shell">${conversationStageMarkup(sphere, { cameraEnabled: false })}<div class="stage-controls phone-stage-controls" aria-label="ควบคุมการสนทนา">${button('voice-toggle', voice.active ? tr('พักไมค์') : tr('เปิดไมค์'), 'mic', 'stage-control mic-control', `aria-label="${voice.active ? tr('พักไมโครโฟน') : tr('เปิดไมโครโฟน')}" aria-pressed="${voice.active}"`)}${button('phone-end', tr('วางสาย'), 'phone', 'stage-control end-control')}</div></div>`;
  }
  function paintSummary() {
    const unanswered = call.step === 'unanswered';
    const isWrongPerson = call.disposition === 'wrong-person';
    const title = unanswered ? outcomeLabel[call.disposition] : call.confirmed ? tr('คุยเรียบร้อยแล้วค่ะ') : tr('จบสายสาธิตแล้ว');
    modal.innerHTML = html`<div class="phone-demo-label">สรุปสายสาธิต · ไม่มีการโทรจริง</div><div class="phone-summary-icon">${icon(unanswered ? 'clock' : 'check')}</div><h2 id="modal-title">${title}</h2><p class="phone-summary-subtitle">${purposeLabel(call.purpose)} · ${thaiDate()}</p>${unanswered ? html`<div class="phone-unanswered-note"><h3>${isWrongPerson ? tr('หยุดคุยก่อนถามข้อมูลสุขภาพ') : tr('ยังไม่มีคำตอบเรื่องสุขภาพ')}</h3><p>${isWrongPerson ? tr('ไม่เปิดเผยเรื่องยาและอาการกับผู้ที่ไม่ใช่ผู้รับ') : tr('ไม่ได้รับสาย ไม่ได้แปลว่ายังไม่ได้กินยา และไม่ได้ยืนยันว่ามีอาการผิดปกติ')}</p></div><div class="phone-next-step">${icon('clock')}<p>${isWrongPerson ? tr('ในระบบจริงต้องตรวจเบอร์กับผู้ใช้ก่อนติดต่อใหม่') : call.disposition === 'deferred' || plan().retry ? tr('ตัวอย่างแผน ลองติดต่อใหม่หลัง 15 นาที') : tr('ไม่มีแผนโทรซ้ำ รอเวลารอบถัดไป')}<small>ยังไม่ได้ตั้งการโทรซ้ำหรือแจ้งคนดูแลจริง</small></p></div>` : html`<div class="phone-summary-record"><h3>สิ่งที่คุณเล่าในสาย</h3>${call.answers.dose ? html`<div><span>การกินยา</span><strong>${getLanguage()==='en'?'The user ':tr('ผู้ใช้')}${doseLabel(call.answers.dose)}</strong></div>` : ''}<div><span>อาการที่เล่า</span><strong>${esc(call.answers.symptom || tr('ยังไม่ได้เล่าอาการ'))}</strong></div><div><span>การตรวจทาน</span><strong>${call.confirmed ? tr('ผู้ใช้ยืนยันสรุปแล้ว') : tr('ยังไม่ได้ยืนยันสรุป')}</strong></div></div><p class="phone-summary-note">เก็บเป็นบันทึกสายสาธิตในสมุดสุขภาพ<br>ไม่เพิ่มการยืนยันกินยาจริง และยังไม่ส่งให้คนดูแล</p>`}<div class="phone-summary-actions">${button('phone-settings', tr('ดูแผนและประวัติการโทร'), 'calendar', 'button outline full')}${button('close', tr('กลับหน้าหลัก'), 'home', 'button primary full')}</div>`;
  }
  function finishRecord() {
    voice.stop();
    clearInterval(clock);
    if (state.events.some(e => e.id === call.id)) return;
    const record = newEvent('call', { text: `${purposeLabel(call.purpose)} · ${outcomeLabel[call.disposition]}${call.answers.symptom ? ` · ${call.answers.symptom}` : ''}`, purpose: call.purpose, disposition: call.disposition, confirmed: call.confirmed, answers: { ...call.answers }, startedAt: call.startedAt, endedAt: call.endedAt }, 'phone-demo');
    state.events.push({ ...record, id: call.id, isDemo: true });
    persist(); render();
  }
  function transition(event) {
    if (!call) return;
    const next = advancePhoneCall(call, event);
    if (next === call) return;
    call = next;
    if (call.step !== 'incoming') stopRinging();
    if (['summary', 'unanswered'].includes(call.step)) finishRecord();
    paint();
    if (!['summary', 'unanswered', 'incoming'].includes(call.step)) {
      voice.listen();
      voice.speak(question());
    }
  }
  function hear(text) {
    if (!call || typeof text !== 'string' || !text.trim()) return;
    const before = call;
    if(call.step==='incoming') { if(/ไม่รับ|ปฏิเสธ|วางสาย|decline|reject|do not answer|don't answer/i.test(text)) transition({type:'decline'});else if(/รับสาย|คุยได้|รับค่ะ|รับครับ|answer|accept/i.test(text)) transition({type:'accept'});return; }
    if (/วางสาย|หยุดคุย|จบการคุย|hang up|end (?:the )?(?:call|conversation)|stop talking/i.test(text)) { transition({ type: 'end' }); return; }
    if (/ไม่สะดวก|โทร.*(ภายหลัง|ทีหลัง)|call.*later|not a good time|busy now/i.test(text)) { transition({ type: 'defer' }); return; }
    if (call.step === 'consent') {
      if (/ไม่ใช่|ผิดคน|ผิดเบอร์|wrong (?:person|number)|not (?:somjai|the person)/i.test(text)) transition({ type: 'wrong-person' });
      else if (/สะดวก|ใช่|คุยได้|yes|available|ready|good time/i.test(text)) transition({ type: 'ready' });
    } else if (call.step === 'dose') {
      if (/ยังไม่|ไม่ได้กิน|ไม่ได้ทาน|not yet|not taken|haven.t (?:taken|had)|didn.t (?:take|have)/i.test(text)) transition({ type: 'dose', value: 'not-yet' });
      else if (/กิน.*แล้ว|ทาน.*แล้ว|i.ve taken|i have taken|already (?:taken|had)|took|taken (?:it|my medicine)/i.test(text)) transition({ type: 'dose', value: 'taken' });
    } else if (call.step === 'symptom') transition({ type: 'symptom', text });
    else if (call.step === 'review') {
      if (/ไม่ถูก|แก้|ผิด|ไม่ยืนยัน|do not confirm|don.t confirm|not correct|change|incorrect/i.test(text)) transition({ type: 'correct' });
      else if (/ยืนยัน|ถูกต้อง|confirm|correct/i.test(text)) transition({ type: 'confirm' });
    }
    if (call === before && !['summary', 'unanswered', 'incoming'].includes(call.step)) voice.speak(html`ขอฟังอีกครั้งนะคะ ${question()}`);
  }
  function action(name) {
    if (name === 'phone-schedule-mock' || name === 'phone-schedule-symptoms') { scheduleMock(name==='phone-schedule-symptoms'?'symptoms':'medication'); return true; }
    if (name === 'phone-cancel-mock') { cancelMock(); toast(tr('ยกเลิกสายสาธิตแล้วค่ะ')); return true; }
    if (name === 'phone-settings') { settings(); return true; }
    if (name === 'phone-incoming' || name === 'phone-symptoms') { incoming(name === 'phone-symptoms' ? 'symptoms' : 'medication'); return true; }
    if (name === 'phone-preview-missed') { incoming(); transition({ type: 'missed' }); return true; }
    const events = { 'phone-accept': { type: 'accept' }, 'phone-decline': { type: 'decline' }, 'phone-missed': { type: 'missed' }, 'phone-defer': { type: 'defer' }, 'phone-end': { type: 'end' } };
    if (events[name]) { transition(events[name]); return true; }
    return false;
  }
  return { homeCard, settings, savePlan, action, hear, stop: () => { cancelMock(); stopRinging(); clearInterval(clock); call = null; } };
}
