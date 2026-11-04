import {authorizeAppAction,stageAppAction} from './app-commands.js';

function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>k!=='confirmed').sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function sameProposal(left,right){return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));}
export function proposeAction(call,context,catalog,previous){
  if(previous && previous.session===context.session && (context.now ?? Date.now())-previous.createdAt<=300000 && sameProposal(call,previous.call))return previous;
  return {...stageAppAction(call,catalog),turn:context.currentTurn,session:context.session,createdAt:context.now ?? Date.now()};
}
export function authorizeProposal(call,proposal,context,catalog){
  if(!proposal || proposal.session!==context.session || !(context.currentTurn>proposal.turn) || (context.now ?? Date.now())-proposal.createdAt>300000 || !sameProposal(call,proposal.call))throw new Error('ขออ่านทวนรายการนี้ แล้วให้ยืนยันอีกครั้งค่ะ');
  return authorizeAppAction(call,context,catalog);
}
export function observationTime(value,now=Date.now()){
  if(value==null)return new Date(now).toISOString();
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw new Error('ขอวันที่ เวลา และเขตเวลาให้ชัดเจนค่ะ');
  const date=Date.parse(value),day=value.slice(0,10);
  if(!Number.isFinite(date) || new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day || date>now+60000 || date<Date.parse('2000-01-01T00:00:00Z'))throw new Error('วันเวลาบันทึกไม่ถูกต้อง หรือเป็นเวลาในอนาคตค่ะ');
  return new Date(date).toISOString();
}
