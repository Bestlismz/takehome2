import {tr,html} from './i18n.js';
export function bloodPressureMarkup(){
  return html`<section id="bp-inline" class="bp-lab" aria-label="${tr('ความดันจากเครื่องวัด','Blood pressure from a cuff monitor')}" hidden><header><span>${tr('ความดันโลหิต','Blood pressure')}</span><button type="button" data-action="bp-close">${tr('กลับกล้อง','Back to camera')}</button></header><div class="bp-reading"><output id="bp-value">— / —</output><span>mmHg</span></div><p id="bp-status" role="status">${tr('เชื่อมต่อเครื่องวัด Bluetooth หรือให้กล้องอ่านตัวเลขบนหน้าจอเครื่อง','Connect a Bluetooth cuff, or let the camera read the monitor display.')}</p><div class="bp-actions"><button type="button" data-action="bp-connect">${tr('เชื่อมเครื่องวัด','Connect cuff')}</button><button type="button" data-action="bp-camera-read">${tr('อ่านหน้าจอเครื่อง','Read cuff display')}</button><button type="button" data-action="bp-confirm" hidden>${tr('บันทึกค่านี้','Save this reading')}</button></div><small>${tr('ต้องใช้เครื่องวัดความดันจริง · ภาพใบหน้าอย่างเดียวไม่ใช่ค่าความดัน','A real cuff monitor is required. A face image alone is not a blood pressure reading.')}</small></section>`;
}
export function updateBloodPressureView(root,snapshot){
  if(!root)return;
  const reading=snapshot?.reading;
  const output=root.querySelector('#bp-value'),status=root.querySelector('#bp-status');
  const confirm=root.querySelector('[data-action="bp-confirm"]'),connect=root.querySelector('[data-action="bp-connect"]');
  if(output)output.textContent=reading?`${reading.systolic} / ${reading.diastolic}`:'— / —';
  if(status)status.textContent=(snapshot?.message || tr('เชื่อมต่อเครื่องวัด Bluetooth หรือให้กล้องอ่านหน้าจอเครื่อง','Connect a Bluetooth cuff, or let the camera read the cuff display.'))+(reading?.irregularPulse?tr(' เครื่องแจ้งชีพจรไม่สม่ำเสมอ',' The monitor reported an irregular pulse.'):'');
  if(confirm)confirm.hidden=!reading || snapshot.phase!=='reading';
  if(connect){connect.disabled=['choosing','connecting'].includes(snapshot?.phase);connect.textContent=tr('เชื่อมเครื่องวัด','Connect cuff');}
}
