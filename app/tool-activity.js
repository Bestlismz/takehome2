import {tr,html} from './i18n.js';
const labels = Object.freeze({get running(){return tr('กำลังทำ');},get confirmation(){return tr('รอคำยืนยัน');},get success(){return tr('เรียบร้อยแล้ว');},get error(){return tr('ยังทำไม่สำเร็จ');},get cancelled(){return tr('ยกเลิกแล้ว');}});
const escape = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const phases = Object.freeze({get executing(){return tr('กำลังดำเนินการ');},get saving(){return tr('กำลังเก็บในฐานข้อมูล');},get confirmation(){return tr('รอคำยืนยัน');},get success(){return tr('เสร็จแล้ว');},get error(){return tr('หยุดเพราะข้อผิดพลาด');},get cancelled(){return tr('ยกเลิกแล้ว');}});
const terminal = new Set(['success','error','cancelled']);

function sourcesOnly(sources) {
  return (Array.isArray(sources) ? sources : []).slice(0,5).flatMap(source => {
    try {
      const url = new URL(source.url);
      if(url.protocol !== 'https:' || url.username || url.password) return [];
      return [{url:url.href,title:text(source.title,100) || url.hostname}];
    } catch { return []; }
  });
}

export function reduceActivity(items, event) {
  if(event.type === 'clear') return [];
  const id = text(event.id,150);
  if(!id) return items;
  if(event.type === 'start') {
    if(items.some(item => item.id === id)) return items;
    return [...items,{id,label:text(event.label,100) || tr('ลูกหลานกำลังช่วย'),detail:text(event.detail,500),target:text(event.target,180),location:text(event.location,100),phase:'executing',steps:['executing'],status:'running',message:'',sources:[]}].slice(-6);
  }
  if(event.type === 'progress') {
    if(!['executing','saving'].includes(event.phase)) return items;
    return items.map(item => item.id === id && item.status === 'running' && !(item.phase === 'saving' && event.phase === 'executing') ? {...item,phase:event.phase,steps:item.steps.includes(event.phase)?item.steps:[...item.steps,event.phase],location:text(event.location,100) || item.location} : item);
  }
  if(event.type !== 'finish' || !Object.hasOwn(labels,event.status) || event.status === 'running') return items;
  return items.map(item => item.id === id && !terminal.has(item.status) ? {...item,status:event.status,phase:event.status,steps:item.steps.includes(event.status)?item.steps:[...item.steps,event.status],location:text(event.location,100) || item.location,message:text(event.message,300),sources:sourcesOnly(event.sources)} : item);
}

export function activityMarkup(items, {collapsed = false, regionId = 'tool-activity-items'} = {}) {
  const latest = items.at(-1);
  if(!latest) return '';
  const busy = items.some(item => item.status === 'running');
  return html`<button class="tool-activity-toggle" type="button" aria-expanded="${!collapsed}" aria-controls="${escape(regionId)}"><span class="tool-activity-mark${busy?' is-working':''}" aria-hidden="true">${busy?'<i></i><i></i><i></i>':latest.status==='error'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m7 7 10 10M17 7 7 17"/></svg>':latest.status==='confirmation'?'<i></i><i></i><i></i>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m5 12 4 4 10-10"/></svg>'}</span><span><strong>ลูกหลานกำลังช่วยอะไร</strong><small>${escape(latest.label)} · ${escape(phases[latest.phase] || labels[latest.status])}</small></span><svg class="tool-activity-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m7 14 5-5 5 5"/></svg></button><div class="tool-activity-body" id="${escape(regionId)}"${collapsed?' hidden':''}><p class="tool-activity-note">ดูขั้นตอนที่เกิดขึ้นจริง คุยต่อได้เลยค่ะ</p><ol>${items.slice().reverse().map(item => html`<li class="tool-activity-item" data-status="${item.status}"><span class="tool-activity-step" aria-hidden="true"></span><div><div class="tool-activity-row"><strong>${escape(item.label)}</strong><span>${labels[item.status]}</span></div>${item.location?`<span class="tool-activity-location">${escape(item.location)}</span>`:''}${item.target?`<p class="tool-activity-target">${escape(item.target)}</p>`:''}<ul class="tool-activity-trail" aria-label="ขั้นตอนที่เกิดขึ้น">${(item.steps || []).map(phase=>`<li data-phase="${phase}"${phase===item.phase?' aria-current="step"':''}>${escape(phases[phase])}</li>`).join('')}</ul>${item.status === 'confirmation' && item.detail?`<p class="tool-activity-proposal">${escape(item.detail)}</p>`:''}${item.message?`<p>${escape(item.message)}</p>`:''}${item.sources.length?html`<details class="tool-activity-sources"><summary>แหล่งอ้างอิง ${item.sources.length} แห่ง</summary>${item.sources.map(source=>`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}<span class="tool-source-host">${escape(new URL(source.url).hostname)}</span></a>`).join('')}</details>`:''}</div></li>`).join('')}</ol></div>`;
}

let nextRegion = 0;

export class ToolActivity {
  constructor({mount = document.body} = {}) {
    this.items = [];
    this.collapsed = false;
    this.regionId = `tool-activity-items-${++nextRegion}`;
    this.element = document.createElement('aside');
    this.element.className = 'tool-activity';
    this.element.setAttribute('aria-label',tr('สิ่งที่ลูกหลานกำลังทำ'));
    this.element.hidden = true;
    this.announcement = document.createElement('span');
    this.announcement.className = 'tool-activity-announcement';
    this.announcement.setAttribute('role','status');
    this.announcement.setAttribute('aria-live','polite');
    this.announcement.setAttribute('aria-atomic','true');
    this.content = document.createElement('div');
    this.element.append(this.announcement,this.content);
    this.element.addEventListener('click',event => {
      if(event.target.closest('.tool-activity-toggle')) this.setCollapsed(!this.collapsed);
    });
    this.attachTo(mount);
  }
  attachTo(root) {
    if(root && this.element.parentElement !== root) root.append(this.element);
    this.element.dataset.inDialog = String(Boolean(root?.closest('dialog')));
  }
  start({id,label,detail,target,location} = {}) {
    this.update({type:'start',id,label,detail,target,location});
  }
  progress(id, {phase,location} = {}) {
    this.update({type:'progress',id,phase,location});
  }
  finish(id, {status = 'success',message,sources,location} = {}) {
    this.update({type:'finish',id,status,message,sources,location});
  }
  update(event) {
    const next = reduceActivity(this.items,event);
    if(next === this.items) return;
    this.items = next;
    this.render();
    const item = this.items.find(entry => entry.id === event.id);
    if(item) this.announcement.textContent = `${item.label} ${labels[item.status]}${item.message?` ${item.message}`:''}`;
  }
  setCollapsed(collapsed) {
    this.collapsed = Boolean(collapsed);
    this.element.dataset.collapsed = String(this.collapsed);
    const toggle = this.content.querySelector('.tool-activity-toggle');
    const body = this.content.querySelector('.tool-activity-body');
    if(toggle) toggle.setAttribute('aria-expanded',String(!this.collapsed));
    if(body) body.hidden = this.collapsed;
  }
  clear() {
    this.items = [];
    this.announcement.textContent = '';
    this.render();
  }
  render() {
    const active = document.activeElement;
    const returnFocus = Boolean(active?.closest('.tool-activity-toggle') && this.element.contains(active));
    this.element.hidden = !this.items.length;
    this.element.dataset.collapsed = String(this.collapsed);
    this.content.innerHTML = activityMarkup(this.items,{collapsed:this.collapsed,regionId:this.regionId});
    if(returnFocus) this.content.querySelector('.tool-activity-toggle')?.focus({preventScroll:true});
  }
}
