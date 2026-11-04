import {tr,html,intlLocale} from './i18n.js';
const routes = Object.freeze({get today(){return tr('วันนี้');},get history(){return tr('บันทึกสุขภาพ');},get calendar(){return tr('ปฏิทินดูแลกัน');},get medication(){return tr('ยาของฉัน');},get care(){return tr('คนที่เรารัก');},get summary(){return tr('สรุปให้แพทย์');}});
const dialogs = Object.freeze({get profile(){return tr('ตั้งค่า');},get record(){return tr('จดสุขภาพ');},get meal(){return tr('มื้ออาหาร');},get 'calendar-plan'(){return tr('นัดหมาย');},get 'calendar-cancel'(){return tr('ยกเลิกนัด');},get 'summary-history'(){return tr('สรุปที่เก็บไว้');},get 'summary-read'(){return tr('อ่านสรุปที่เก็บไว้');},get 'audio-settings'(){return tr('การรับเสียง');},get 'phone-settings'(){return tr('แผนโทร');},get phone(){return tr('สายสาธิต');},get voice(){return tr('หน้าคุย');},get 'web-search'(){return tr('ค้นเว็บไซต์');},get 'knowledge-sources'(){return tr('แหล่งข้อมูล');},get 'care-plan'(){return tr('แผนที่แพทย์แจ้ง');},get 'care-sharing'(){return tr('การแบ่งปัน');},get report(){return tr('สรุปให้แพทย์');},get about(){return tr('เกี่ยวกับลูกหลาน');}});
const bounded = value => typeof value === 'string' ? value.trim().slice(0,180) : '';

export function activityLocation({route,dialog} = {}) {
  return [routes[route],dialogs[dialog]].filter(Boolean).join(' · ');
}

export function actionPresentation({tool,args = {}}, {route,dialog,plans = [],records = [],describe = () => ''} = {}) {
  const plan = plans.find(entry => entry.id === args.id);
  const record = records.find(entry => entry.id === args.id && !entry.isDemo);
  let target = '';
  if(tool === 'app.action') {
    if(args.action === 'navigate') target = routes[args.route] || '';
    else if(args.action?.startsWith('calendar.')) target = [args.title || plan?.title,args.date || plan?.date,args.at || plan?.at].filter(Boolean).join(' · ');
    else if(args.action?.startsWith('record.') && record) target = [describe(record),record.occurredAt ? new Date(record.occurredAt).toLocaleString(intlLocale(),{timeZone:'Asia/Bangkok',dateStyle:'short',timeStyle:'short'}) : ''].filter(Boolean).join(' · ');
    else if(args.action === 'web.search') target = args.text;
  } else if(tool === 'medication.lookup') target = [args.name,args.strength].filter(Boolean).join(' ');
  else if(tool === 'web.search' || tool === 'knowledge.lookup') target = args.query;
  return {target:bounded(target),location:activityLocation({route,dialog})};
}

export function activityResultMessage(result = {}) {
  if(result.error || result.message) return result.error || result.message;
  if(Array.isArray(result.records)) return html`พบ ${result.total ?? result.records.length} บันทึก`;
  if(Array.isArray(result.plans)) return html`พบ ${result.total ?? result.plans.length} นัดหมาย`;
  if(result.storage?.saved) return html`เก็บในฐานข้อมูลแล้ว · ฉบับ ${result.storage.revision}`;
  if(Array.isArray(result.sources)) return html`ตรวจข้อมูลแล้ว มีแหล่งอ้างอิง ${result.sources.length} แห่ง`;
  return tr('ดำเนินการตามคำขอแล้ว');
}
