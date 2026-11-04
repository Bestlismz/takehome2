import {persist} from './data.js';

export class WorkspaceClient {
  constructor(state,{onChange=()=>{},onStatus=()=>{}}={}) {
    this.state=state;this.onChange=onChange;this.onStatus=onStatus;this.ready=false;this.pending=false;this.running=null;this.revision=0;this.blocked=false;this.alerts=[];this.brief=null;this.error=null;
  }
  async request(body,path='/api/workspace') {
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!response.ok){if(response.status===409)this.blocked=true;throw new Error(result.error || 'ยังบันทึกลงฐานข้อมูลไม่ได้ค่ะ');}
    return result;
  }
  accept(result) {
    this.revision=result.revision;this.alerts=result.alerts || [];this.brief=result.brief;this.snapshotId=result.snapshotId;
    this.state.storageRevision=this.revision;this.error=null;
  }
  async start() {
    try {
      this.onStatus('loading');const result=await this.request({operation:'load'});
      if(result.revision>0) {
        if(this.state.storagePending || this.pending) {
          if(this.state.storageRevision!==result.revision){this.blocked=true;throw new Error('มีข้อมูลที่ยังไม่บันทึกและอีกหน้าต่างแก้ไขแล้ว เปิดข้อมูลล่าสุดก่อนแก้ไขต่อค่ะ');}
        } else {
          const demos=this.state.events.filter(e=>e.isDemo);
          for(const key of ['profile','sharing','activities','callPlan','largeText','snooze','audioProfile','calendarPlans','language'])delete this.state[key];
          Object.assign(this.state,result.state,{events:[...demos,...result.state.events]});
        }
      }
      this.accept(result);this.ready=true;persist(this.state);this.onChange();
      if(!result.revision || this.state.storagePending || this.pending){this.pending=true;await this.flush();}else this.onStatus('saved');
    }catch(error){this.error=error.message;this.onStatus('error',error.message);}
  }
  queue() {
    this.pending=true;this.state.storagePending=true;persist(this.state);
    if(this.ready)this.flush().catch(()=>{});
  }
  async flush() {
    if(!this.ready || this.blocked)throw new Error(this.error || 'ฐานข้อมูลยังไม่พร้อม กรุณาตรวจการเชื่อมต่อค่ะ');
    if(this.running)return this.running;
    if(!this.pending)return;
    this.running=(async()=>{
      try {
        while(this.pending) {
          this.pending=false;this.onStatus('saving');
          const snapshot=JSON.parse(JSON.stringify(this.state));
          const result=await this.request({operation:'save',revision:this.revision,state:snapshot});this.accept(result);
          this.state.storagePending=this.pending;persist(this.state);this.onChange();
        }
        this.onStatus('saved');
      }catch(error){this.pending=true;this.state.storagePending=true;this.error=error.message;persist(this.state);this.onStatus('error',error.message);throw error;}
      finally{this.running=null;}
    })();
    return this.running;
  }
  async openLatest(){
    // Preserve the unsent draft before replacing it with another tab's version.
    localStorage.setItem('luklaan-recovery-draft',JSON.stringify(this.state));
    const result=await this.request({operation:'load'});
    const demos=this.state.events.filter(e=>e.isDemo);
    for(const key of ['profile','sharing','activities','callPlan','largeText','snooze','audioProfile','calendarPlans','language'])delete this.state[key];
    Object.assign(this.state,result.state,{events:[...demos,...result.state.events],storagePending:false});
    this.pending=false;this.blocked=false;this.ready=true;this.accept(result);persist(this.state);this.onChange();this.onStatus('saved');
  }
  async retry(){if(!this.ready || this.blocked)return this.start();return this.flush();}
  async acknowledge(id){await this.flush();const result=await this.request({operation:'acknowledge',alertId:id});this.accept(result);this.onChange();}
  async summaries(){await this.flush();return (await this.request({},'/api/summary-history')).summaries;}
}
