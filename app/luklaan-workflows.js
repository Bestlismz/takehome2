import {tr,html} from './i18n.js';
import {icon} from './icons.js';
import { mascotIconMarkup } from './mascot.js';
import { escapeHTML as esc, describe, thaiDate, time } from './data.js';
import { renderPhysicianSummary, renderTrackingOverview } from './health-tracking.js';

export function mealJournalMarkup(state) {
  const meals = state.events.filter(e => e.kind === 'meal' && e.confirmed && !e.isDemo).slice(-2).reverse();
  return html`<section class="meal-journal"><div class="meal-art" aria-hidden="true">◒</div><div><h2>มื้อวันนี้</h2><p>${meals.length ? esc(meals[0].payload.description || meals[0].payload.text) : tr('เล่าให้ฟังว่ากินอะไร ปริมาณเท่าไร')}</p><span>แคลอรี ไขมัน และคาร์บเป็นช่วงประมาณ</span></div><button type="button" class="button primary" data-action="meal-talk">${mascotIconMarkup()}<span>เล่ามื้ออาหาร</span></button><button type="button" class="text-button" data-action="meal-record">จดด้วยตัวเอง</button></section>`;
}
export function summaryTeaserMarkup() {
  return html`<section class="summary-teaser"><h2>สรุปก่อนพบแพทย์</h2>${[[tr('เบาหวาน'),tr('ความต่อเนื่องของยา · น้ำตาลที่วัด')],[tr('ความดัน'),tr('อาหาร · ค่าความดัน')],[tr('ไขมัน'),tr('อาหาร · ไขมันที่ประมาณ')]].map(([title,sub])=>`<a href="#summary"><strong>${title}</strong><span>${sub}</span>${icon('chevron')}</a>`).join('')}<p>เฉพาะข้อมูลที่ยืนยันแล้ว<br>ไม่รวมข้อมูลตัวอย่าง</p><a class="button outline" href="#summary">เปิดสรุป 7 วัน ${icon('chevron')}</a></section>`;
}
export function summaryPageMarkup(state) {
  return html`<div class="full-page modern-page clinical-page"><div class="page-heading"><div><h1>เรื่องราวระหว่างนัด</h1><p>เรื่องกิน เรื่องยา และค่าที่วัด ให้คุณหมอเห็นภาพเดียวกัน</p></div><button class="button primary" data-action="report">พิมพ์สรุปให้แพทย์</button></div><div class="summary-toolbar"><button class="button outline" data-action="care-plan">แผนที่แพทย์แจ้ง</button><button class="button outline" data-action="ai-summary">เรียบเรียงและเก็บสรุป</button><button class="text-button" data-action="summary-history">ฉบับที่เก็บไว้ ${icon('chevron')}</button><span>ข้อมูลที่ยืนยันใน 7 วันล่าสุด · ${thaiDate()}</span></div><div id="physician-ai-narrative" role="status"></div>${renderPhysicianSummary(state.events,state.profile || {})}</div>`;
}
export const trackingMarkup = state => renderTrackingOverview(state.events,state.profile || {});
export function mealEstimateMarkup(estimate) {
  const range = r => r && r.min != null && r.max != null ? `${esc(r.min)}–${esc(r.max)}` : tr('ยังประมาณไม่ได้');
  return html`<div class="meal-estimate"><h3>${esc(estimate.description)}</h3><p>${esc(estimate.portion)}</p><div class="nutrition-ranges">${[[tr('พลังงาน'),estimate.energy,'kcal'],[tr('ไขมัน'),estimate.fat,tr('กรัม')],[tr('คาร์บ'),estimate.carbohydrate,tr('กรัม')],[tr('โซเดียม'),estimate.sodium,'mg']].map(([label,r,unit])=>`<div><span>${label}</span><strong>${range(r)}</strong><small>${unit}</small></div>`).join('')}</div><p>ค่าประมาณจากคำเล่าหรือภาพ ไม่ใช่ผลตรวจอาหาร</p><p><a href="https://anamai.moph.go.th/th/news-anamai/38204" target="_blank" rel="noopener">หน่วยข้าวมาตรฐานอ้างอิงกรมอนามัย ${icon('chevron')}</a> · ขนาดที่กินจริงอาจต่างกัน</p><ul>${[...(estimate.assumptions || []),...(estimate.unknowns || [])].map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`;
}
