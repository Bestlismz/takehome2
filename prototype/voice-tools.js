export const toolDefinitions = Object.freeze({
  'camera.open': { label: 'เปิดกล้อง', icon: 'camera', effect: 'camera', parameters: { facing: ['user', 'environment'] } },
  'camera.close': { label: 'ปิดกล้อง คุยต่อ', icon: 'camera', effect: 'camera', parameters: {} },
  'conversation.end': { label: 'จบการคุย', icon: 'phone', effect: 'session', parameters: {} },
  'camera.switch': { label: 'สลับกล้องหน้า / หลัง', icon: 'switch', effect: 'camera', parameters: {} },
  'camera.capture': { label: 'ถ่ายภาพจากกล้อง', icon: 'camera', effect: 'capture', parameters: {} },
  'history.open': { label: 'เปิดสมุดสุขภาพ', icon: 'history', effect: 'navigate', parameters: {} },
  'care.open': { label: 'เปิดหน้าคนดูแล', icon: 'users', effect: 'navigate', parameters: {} },
  'medication.open': { label: 'เปิดแผนยา', icon: 'pill', effect: 'navigate', parameters: {} },
  'today.open': { label: 'เปิดหน้าวันนี้', icon: 'home', effect: 'navigate', parameters: {} },
  'report.preview': { label: 'เปิดสรุปให้คุณหมอ', icon: 'file', effect: 'preview', parameters: {} },
});

export async function executeTool(call, handlers) {
  const definition = toolDefinitions[call.tool];
  if (!definition || !handlers[call.tool]) throw new Error('ยังไม่มีเครื่องมือนี้ค่ะ');
  if (call.tool === 'camera.open' && !definition.parameters.facing.includes(call.args?.facing)) throw new Error('กรุณาเลือกกล้องหน้าหรือหลังค่ะ');
  return handlers[call.tool](call.args || {});
}
