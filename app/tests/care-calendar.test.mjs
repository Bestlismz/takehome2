import test from 'node:test';
import assert from 'node:assert/strict';
import {monthCells,shiftMonth,shiftDate,validCalendarDate,normalizeCalendarPlan,agendaForDate,calendarPageMarkup} from '../care-calendar.js';

test('Monday-start November 2026 has Sunday first and Wednesday fourth',()=>{
 const cells=monthCells('2026-11-04');assert.equal(cells[6],'2026-11-01');assert.equal(cells[9],'2026-11-04');assert.equal(cells.filter(Boolean).length,30);
});
test('month navigation clamps dates and leap days without local timezone drift',()=>{
 assert.equal(shiftMonth('2026-01-31',1),'2026-02-28');assert.equal(shiftMonth('2024-01-31',1),'2024-02-29');assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
 assert.equal(validCalendarDate('2026-02-30'),false);assert.equal(validCalendarDate('1999-12-31'),false);
});
test('agenda combines actual configured call times with read-only example medication and selected date plans',()=>{
 const state={callPlan:{medication:false,symptoms:true,symptomsAt:'17:45'},calendarPlans:[{id:'visit',date:'2026-11-04',at:'10:00',title:'นัดติดตาม',status:'active',planType:'appointment'},{id:'cancelled',date:'2026-11-04',at:'11:00',title:'ยกเลิก',status:'cancelled'},{id:'other',date:'2026-11-05',at:'09:00',title:'พรุ่งนี้',status:'active'}]};
 const agenda=agendaForDate(state,'2026-11-04');assert.deepEqual(agenda.map(p=>p.at),['08:00','10:00','17:45','20:00']);assert.equal(agenda.filter(p=>!p.isExample).length,1);assert.equal(agenda.find(p=>p.type==='medicine').action,'calendar-medication');
});
test('personal calendar does not accept a prescription type or invalid time',()=>{
 const p={id:'one',title:'นัดหมอ',date:'2026-11-04',at:'09:00'};assert.equal(normalizeCalendarPlan(p).planType,'appointment');
 for(const raw of [{...p,at:'25:00'},{...p,date:'2026-02-31'},{...p,planType:'medicine'},{...p,title:''}])assert.throws(()=>normalizeCalendarPlan(raw));
});
test('calendar exposes selected day, today navigation and readable agenda without decorative arrow glyphs',()=>{
 const html=calendarPageMarkup({calendarPlans:[]},'2026-11-04');assert.ok(html.includes('data-calendar-date="2026-11-04"'));assert.ok(html.includes('aria-pressed="true"'));assert.ok(html.includes('calendar-today'));assert.ok(html.includes('ยังไม่โทรจริงตามเวลา'));assert.equal(/[↗→]/.test(html),false);
});
