import {dateKey,describe,labels} from './data.js';

export function journalEntries(events,{kind='all',query='',includeDemo=false}={}){
  const needle=query.trim().toLocaleLowerCase('th-TH');
  return events.filter(event=>(includeDemo || !event.isDemo) && (kind==='all' || event.kind===kind) && (!needle || `${labels[event.kind] || ''} ${describe(event)} ${dateKey(new Date(event.occurredAt))}`.toLocaleLowerCase('th-TH').includes(needle))).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt));
}
export function journalDays(entries){
  const groups=new Map();
  for(const event of entries){const day=dateKey(new Date(event.occurredAt));if(!groups.has(day))groups.set(day,[]);groups.get(day).push(event);}
  return [...groups].map(([date,events])=>({date,events}));
}
