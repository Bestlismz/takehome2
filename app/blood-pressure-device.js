import {tr} from './i18n.js';

const SPECIAL_SFLOAT = new Set([0x07fe,0x07ff,0x0800,0x0801,0x0802]);
const fail = message => {throw new Error(message);};
function sfloat(view,offset){
  const raw=view.getUint16(offset,true);
  if(SPECIAL_SFLOAT.has(raw))return null;
  let mantissa=raw & 0x0fff,exponent=raw>>12;
  if(mantissa & 0x0800)mantissa-=0x1000;
  if(exponent & 8)exponent-=16;
  return mantissa * 10**exponent;
}
function timestamp(view,offset){
  const year=view.getUint16(offset,true),month=view.getUint8(offset+2),day=view.getUint8(offset+3);
  const hour=view.getUint8(offset+4),minute=view.getUint8(offset+5),second=view.getUint8(offset+6);
  if((year!==0 && (year<1582 || year>9999)) || month>12 || day>31 || hour>23 || minute>59 || second>59)fail('timestamp');
  if(!year || !month || !day)return null;
  const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  if(date.getUTCMonth()!==month-1 || date.getUTCDate()!==day)fail('timestamp');
  return date.toISOString().slice(0,19);
}

export function parseBloodPressureMeasurement(value,{receivedAt=new Date().toISOString(),deviceName='',features=0}={}){
  if(!(value instanceof DataView) || value.byteLength<7)fail('truncated');
  let offset=1;
  const flags=value.getUint8(0);
  const required=7+(flags&2?7:0)+(flags&4?2:0)+(flags&8?1:0)+(flags&16?2:0);
  if(value.byteLength<required)fail('truncated');
  const pressures=[sfloat(value,offset),sfloat(value,offset+2),sfloat(value,offset+4)];offset+=6;
  if(pressures.slice(0,2).some(number=>number===null || !Number.isFinite(number)))fail('unavailable');
  const scale=flags&1?1000/133.3224:1;
  const [systolic,diastolic,meanArterialPressure]=pressures.map(number=>number===null?null:Math.round(number*scale*10)/10);
  if(systolic<40 || systolic>300 || diastolic<20 || diastolic>200 || systolic<=diastolic || (meanArterialPressure!==null && (meanArterialPressure<20 || meanArterialPressure>300)))fail('range');
  let deviceTimestamp=null,pulse,userId,status=0;
  if(flags&2){deviceTimestamp=timestamp(value,offset);offset+=7;}
  if(flags&4){pulse=sfloat(value,offset);offset+=2;if(pulse!==null && (pulse<20 || pulse>300))fail('pulse');}
  if(flags&8){userId=value.getUint8(offset);offset++;}
  if(flags&16)status=value.getUint16(offset,true);
  const supportedStatus=(features&1?1:0)|(features&2?2:0)|(features&4?4:0)|(features&8?24:0)|(features&16?32:0);
  status &= supportedStatus;
  if(status & 0x23)fail('measurement-quality');
  if((status & 0x18)===0x18)fail('pulse-status');
  const receipt=new Date(receivedAt);
  if(!Number.isFinite(receipt.getTime()))fail('timestamp');
  return {systolic,diastolic,meanArterialPressure,unit:'mmHg',...(pulse===null || pulse===undefined?{}:{pulse}),
    occurredAt:receipt.toISOString(),receivedAt:receipt.toISOString(),deviceTimestamp,timeBasis:'received',
    provenance:'bluetooth-cuff',deviceName:String(deviceName).slice(0,100),...(userId===undefined?{}:{userId}),
    irregularPulse:Boolean(status&4),pulseRange:status&8?'above':status&16?'below':'within-or-not-supported',
    sourceUnit:flags&1?'kPa':'mmHg'};
}

const messages=()=>({
  unsupported:tr('เบราว์เซอร์นี้ยังเชื่อม Bluetooth ไม่ได้ ใช้กล้องอ่านหน้าจอเครื่องวัดแทนได้ค่ะ','Bluetooth is unavailable in this browser. Use the camera to read the cuff display instead.'),
  cancelled:tr('ยังไม่ได้เลือกเครื่องวัด แตะเชื่อมต่อเมื่อต้องการค่ะ','No monitor was selected. Tap Connect when ready.'),
  connecting:tr('กำลังเชื่อมต่อเครื่องวัดความดัน','Connecting to the blood pressure monitor'),
  waiting:tr('เชื่อมต่อแล้ว กดวัดที่เครื่องตามคู่มือ แล้วรอค่าความดันค่ะ','Connected. Measure on the cuff following its instructions, then wait for the reading.'),
  reading:tr('รับค่าจากเครื่องแล้ว อ่านทวนก่อนบันทึกค่ะ','Reading received from the monitor. Review it before saving.'),
  invalid:tr('ค่าจากเครื่องยังไม่สมบูรณ์ หรือเครื่องแจ้งว่าขยับ/พันผ้าไม่พอดี กรุณาวัดใหม่ค่ะ','The reading is incomplete or the monitor reported a movement or cuff-fit issue. Measure again.'),
  connection:tr('ยังเชื่อมต่อเครื่องวัดไม่ได้ ตรวจว่าเปิด Bluetooth และโหมดจับคู่ตามคู่มือค่ะ','The monitor could not connect. Check Bluetooth and the monitor pairing instructions.'),
  disconnected:tr('ตัดการเชื่อมต่อเครื่องวัดแล้วค่ะ','Monitor disconnected.'),
});
const initial=()=>({phase:'idle',reading:null,error:null,message:''});

export class BloodPressureDevice{
  constructor({onUpdate=()=>{},bluetooth=globalThis.navigator?.bluetooth,now=()=>Date.now()}={}){
    this.onUpdate=onUpdate;this.bluetooth=bluetooth;this.now=now;this.generation=0;this.current=initial();
    this.device=null;this.characteristic=null;this.features=0;this.measurementListener=null;this.disconnectListener=null;
  }
  get snapshot(){return {...this.current,reading:this.current.reading?{...this.current.reading}:null};}
  update(patch){this.current={...this.current,...patch};this.onUpdate(this.snapshot);}
  async connect(){
    this.disconnect();
    const generation=this.generation;
    if(!this.bluetooth?.requestDevice){this.update({phase:'error',error:'unsupported',message:messages().unsupported});return this.snapshot;}
    this.update({phase:'choosing',message:messages().connecting});
    let device;
    const active=()=>generation===this.generation;
    try{
      device=await this.bluetooth.requestDevice({filters:[{services:['blood_pressure']}]});
      if(!active())return this.snapshot;
      this.device=device;
      this.disconnectListener=()=>{if(active()){this.disconnect();this.update({message:messages().disconnected});}};
      device.addEventListener('gattserverdisconnected',this.disconnectListener);
      this.update({phase:'connecting',message:messages().connecting});
      const server=await device.gatt.connect();
      if(!active()){if(this.device!==device)device.gatt.disconnect();return this.snapshot;}
      const service=await server.getPrimaryService('blood_pressure');
      if(!active())return this.snapshot;
      const feature=await service.getCharacteristic('blood_pressure_feature');
      const featureValue=await feature.readValue();
      if(!active())return this.snapshot;
      if(!(featureValue instanceof DataView) || featureValue.byteLength<2)fail('features');
      this.features=featureValue.getUint16(0,true);
      const characteristic=await service.getCharacteristic('blood_pressure_measurement');
      if(!active())return this.snapshot;
      this.characteristic=characteristic;
      this.measurementListener=event=>{
        if(!active())return;
        try{
          const reading=parseBloodPressureMeasurement(event.target.value,{receivedAt:new Date(this.now()).toISOString(),deviceName:device.name,features:this.features});
          this.update({phase:'reading',reading,error:null,message:messages().reading});
        }catch{this.update({phase:'waiting',reading:null,error:'invalid-reading',message:messages().invalid});}
      };
      characteristic.addEventListener('characteristicvaluechanged',this.measurementListener);
      await characteristic.startNotifications();
      if(active() && this.current.phase!=='reading')this.update({phase:'waiting',reading:null,error:null,message:messages().waiting});
    }catch(error){
      if(active()){
        this.disconnect();
        const cancelled=error?.name==='NotFoundError';
        this.update({phase:'error',error:cancelled?'cancelled':'connection',message:cancelled?messages().cancelled:messages().connection});
      }
    }
    return this.snapshot;
  }
  disconnect(){
    this.generation++;
    if(this.characteristic && this.measurementListener)this.characteristic.removeEventListener('characteristicvaluechanged',this.measurementListener);
    if(this.device && this.disconnectListener)this.device.removeEventListener('gattserverdisconnected',this.disconnectListener);
    const characteristic=this.characteristic,device=this.device;
    this.characteristic=null;this.device=null;this.measurementListener=null;this.disconnectListener=null;this.features=0;
    try{characteristic?.stopNotifications()?.catch?.(()=>{});}catch{}
    try{if(device?.gatt?.connected)device.gatt.disconnect();}catch{}
    this.current=initial();this.onUpdate(this.snapshot);
  }
}
