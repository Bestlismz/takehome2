const formFields = Object.freeze({
  'calendar-plan-form':['planId','title','date','at','planType','note'],
  'record-form':['kind','systolic','diastolic','value','text'],
  'meal-form':['description','portion'],
});

export function interfaceSnapshot(ui, {form = null, activityCollapsed = false} = {}) {
  const fields = formFields[form?.id];
  const values = {};
  if (fields) for (const field of fields) {
    const control = form.elements.namedItem(field);
    if (control && typeof control.value === 'string') values[field] = control.value.slice(0,500);
  }
  return {
    route:ui.route, dialog:ui.dialog || null,
    conversation:ui.voicePresentation || 'closed',
    camera:ui.cameraPhase || 'closed',
    selection:{recordId:ui.dialog==='record' ? ui.editing || null : ui.editingRecordId || null, calendarPlanId:values.planId || null, calendarDate:ui.calendarDate || null},
    form:fields ? {kind:form.id,values} : null,
    activityCollapsed:Boolean(activityCollapsed),
  };
}

export function storedSummaryList(reports) {
  return reports.slice(0,20).map(report=>({id:report.id,kind:report.kind,createdAt:report.createdAt,confirmedCount:report.body?.confirmedCount ?? report.body?.evidence?.length ?? 0}));
}

export function storedSummaryRead(reports,id) {
  const report=reports.find(entry=>entry.id===id);
  if(!report) throw new Error('ไม่พบสรุปฉบับนี้ ขอเปิดรายการสรุปที่เก็บไว้ก่อนค่ะ');
  const body=report.body || {};
  return {...storedSummaryList([report])[0],report:body.report || null,period:body.period || null,missing:body.missing || [],evidence:(body.evidence || []).slice(0,100).map(entry=>({id:entry.id,kind:entry.kind,occurredAt:entry.occurredAt,payload:Object.fromEntries(Object.entries(entry.payload || {}).filter(([key])=>!['image','audio','frames'].includes(key)))})),evidenceTruncated:(body.evidence || []).length>100,instruction:'สรุปฉบับ ณ วันที่เก็บ ไม่ใช่สถานะปัจจุบัน และยังไม่ได้รับการรับรองจากแพทย์ แยกค่าประมาณกับค่าจากเครื่องวัด'};
}
