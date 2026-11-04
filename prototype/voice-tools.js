import {tr} from './i18n.js';
export const toolDefinitions = Object.freeze({
  'camera.open': { get label(){return tr('เปิดกล้อง');}, icon: 'camera', effect: 'camera', parameters: { facing: ['user', 'environment'] } },
  'camera.close': { get label(){return tr('ปิดกล้อง คุยต่อ');}, icon: 'camera', effect: 'camera', parameters: {} },
  'conversation.end': { get label(){return tr('จบการคุย');}, icon: 'phone', effect: 'session', parameters: {} },
  'camera.switch': { get label(){return tr('สลับกล้องหน้า / หลัง');}, icon: 'switch', effect: 'camera', parameters: {} },
  'camera.capture': { get label(){return tr('ถ่ายภาพจากกล้อง');}, icon: 'camera', effect: 'capture', parameters: {} },
  'history.open': { get label(){return tr('เปิดสมุดสุขภาพ');}, icon: 'history', effect: 'navigate', parameters: {} },
  'care.open': { get label(){return tr('เปิดหน้าคนดูแล');}, icon: 'users', effect: 'navigate', parameters: {} },
  'medication.open': { get label(){return tr('เปิดแผนยา');}, icon: 'pill', effect: 'navigate', parameters: {} },
  'today.open': { get label(){return tr('เปิดหน้าวันนี้');}, icon: 'home', effect: 'navigate', parameters: {} },
  'report.preview': { get label(){return tr('เปิดสรุปให้คุณหมอ');}, icon: 'file', effect: 'preview', parameters: {} },
});

export async function executeTool(call, handlers) {
  const definition = toolDefinitions[call.tool];
  if (!definition || !handlers[call.tool]) throw new Error(tr('ยังไม่มีเครื่องมือนี้ค่ะ'));
  if (call.tool === 'camera.open' && !definition.parameters.facing.includes(call.args?.facing)) throw new Error(tr('กรุณาเลือกกล้องหน้าหรือหลังค่ะ'));
  return handlers[call.tool](call.args || {});
}
