import {tr} from './i18n.js';
const labels = Object.freeze({get running(){return tr('กำลังทำ');},get confirmation(){return tr('รอคำยืนยัน');},get success(){return tr('เรียบร้อยแล้ว');},get error(){return tr('ยังทำไม่สำเร็จ');},get cancelled(){return tr('ยกเลิกแล้ว');}});
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
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

export class ToolActivity {
  constructor({mount=document.body}={}) {
    this.items=[];
    this.collapsed=true;
    this.element=document.createElement('aside');
    this.element.className='tool-activity-announcement-only';
    this.element.hidden=true;
    this.announcement=document.createElement('span');
    this.announcement.setAttribute('role','status');
    this.announcement.setAttribute('aria-live','polite');
    this.announcement.setAttribute('aria-atomic','true');
    this.element.append(this.announcement);
    this.attachTo(mount);
  }
  attachTo(root){if(root && this.element.parentElement!==root)root.append(this.element);}
  start({id,label,detail,target,location}={}){this.update({type:'start',id,label,detail,target,location});}
  progress(id,{phase,location}={}){this.update({type:'progress',id,phase,location});}
  finish(id,{status='success',message,sources,location}={}){this.update({type:'finish',id,status,message,sources,location});}
  update(event){
    const next=reduceActivity(this.items,event);
    if(next===this.items)return;
    this.items=next;
    this.render();
    const item=this.items.find(entry=>entry.id===event.id);
    if(item)this.announcement.textContent=`${item.label} ${labels[item.status]}${item.message?' '+item.message:''}`;
  }
  clear(){this.items=[];this.announcement.textContent='';this.render();}
  render(){this.element.hidden=!this.items.length;}
}
