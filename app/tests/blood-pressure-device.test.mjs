import test from 'node:test';
import assert from 'node:assert/strict';
import {BloodPressureDevice,parseBloodPressureMeasurement} from '../blood-pressure-device.js';
import {bloodPressureMarkup,updateBloodPressureView} from '../blood-pressure-view.js';
const packet=bytes=>new DataView(Uint8Array.from(bytes).buffer);
const receivedAt='2026-11-04T10:00:00.000Z';
const measurement=[0,120,0,80,0,93,0];

test('literal mmHg measurement and optional timestamp, pulse, user and status are decoded',()=>{
 const basic=parseBloodPressureMeasurement(packet(measurement),{receivedAt});
 assert.equal(basic.systolic,120);assert.equal(basic.diastolic,80);assert.equal(basic.meanArterialPressure,93);assert.equal(basic.unit,'mmHg');
 const missingMap=parseBloodPressureMeasurement(packet([0,120,0,80,0,0xff,7]),{receivedAt});assert.equal(missingMap.meanArterialPressure,null);assert.equal(missingMap.systolic,120);
 const detailed=parseBloodPressureMeasurement(packet([30,128,0,78,0,95,0,0xea,0x07,11,4,16,30,5,72,0,2,4,0]),{receivedAt,deviceName:'Test cuff',features:4});
 assert.equal(detailed.systolic,128);assert.equal(detailed.pulse,72);assert.equal(detailed.userId,2);assert.equal(detailed.irregularPulse,true);
 assert.equal(detailed.deviceTimestamp,'2026-11-04T16:30:05');assert.equal(detailed.occurredAt,receivedAt);assert.equal(detailed.timeBasis,'received');assert.equal(detailed.provenance,'bluetooth-cuff');
});
test('kPa SFLOAT negative decimal exponent converts explicitly to mmHg',()=>{
 const reading=parseBloodPressureMeasurement(packet([1,160,0xf0,107,0xf0,125,0xf0]),{receivedAt});
 assert.equal(reading.systolic,120);assert.equal(reading.diastolic,80.3);assert.equal(reading.meanArterialPressure,93.8);assert.equal(reading.sourceUnit,'kPa');
});
test('missing fields, special values, invalid ranges and impossible dates cannot produce readings',()=>{
 for(const flags of [2,4,8,16,30])assert.throws(()=>parseBloodPressureMeasurement(packet([flags,...measurement.slice(1)])),/truncated/);
 for(const word of [0x07fe,0x07ff,0x0800,0x0801,0x0802])assert.throws(()=>parseBloodPressureMeasurement(packet([0,word&255,word>>8,80,0,90,0])),/unavailable/);
 assert.throws(()=>parseBloodPressureMeasurement(packet([0,80,0,120,0,93,0])),/range/);
 assert.throws(()=>parseBloodPressureMeasurement(packet([2,...measurement.slice(1),0xea,7,2,30,12,0,0])),/timestamp/);
});
test('RFU bits and extra octets are ignored per collector spec; supported quality flags require retake',()=>{
 const reading=parseBloodPressureMeasurement(packet([0xe0,...measurement.slice(1),255]),{receivedAt});assert.equal(reading.systolic,120);
 const status=value=>packet([16,...measurement.slice(1),value,0]);
 assert.throws(()=>parseBloodPressureMeasurement(status(1),{features:1}),/measurement-quality/);
 assert.throws(()=>parseBloodPressureMeasurement(status(2),{features:2}),/measurement-quality/);
 assert.throws(()=>parseBloodPressureMeasurement(status(32),{features:16}),/measurement-quality/);
 assert.equal(parseBloodPressureMeasurement(status(2),{features:0}).systolic,120);
 assert.equal(parseBloodPressureMeasurement(status(128),{features:31}).systolic,120);
});

function fakeMonitor(){
 const listeners=new Map(),deviceListeners=new Map();let stopped=0;
 const characteristic={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),startNotifications:async()=>{},stopNotifications:async()=>{stopped++;}};
 const feature={readValue:async()=>packet([31,0])};
 const device={name:'Fixture cuff',addEventListener:(name,fn)=>deviceListeners.set(name,fn),removeEventListener:name=>deviceListeners.delete(name),gatt:{connected:false,async connect(){this.connected=true;return {getPrimaryService:async()=>({getCharacteristic:async name=>name==='blood_pressure_feature'?feature:characteristic})};},disconnect(){this.connected=false;}}};
 return {device,bluetooth:{requestDevice:async options=>{assert.deepEqual(options,{filters:[{services:['blood_pressure']}]});return device;}},emit:bytes=>listeners.get('characteristicvaluechanged')?.({target:{value:packet(bytes)}}),listeners,deviceListeners,get stopped(){return stopped;}};
}
test('device reads features, receives real indication data and disconnect clears listeners and reading',async()=>{
 const monitor=fakeMonitor(),states=[];const device=new BloodPressureDevice({bluetooth:monitor.bluetooth,onUpdate:value=>states.push(value),now:()=>Date.parse(receivedAt)});
 await device.connect();assert.equal(device.snapshot.phase,'waiting');
 monitor.emit(measurement);assert.equal(device.snapshot.reading.systolic,120);assert.equal(device.snapshot.phase,'reading');
 monitor.emit([0,0xff,7,80,0,93,0]);assert.equal(device.snapshot.reading,null);assert.equal(device.snapshot.error,'invalid-reading');
 device.disconnect();assert.equal(monitor.device.gatt.connected,false);assert.equal(monitor.listeners.size,0);assert.equal(monitor.deviceListeners.size,0);assert.equal(device.snapshot.reading,null);assert.equal(monitor.stopped,1);
});
test('unsupported Bluetooth, chooser cancellation and late chooser result do not retain a connection',async()=>{
 const unsupported=new BloodPressureDevice({bluetooth:null});await unsupported.connect();assert.equal(unsupported.snapshot.error,'unsupported');
 const denied=new BloodPressureDevice({bluetooth:{requestDevice:async()=>{throw Object.assign(new Error(),{name:'NotFoundError'});}}});await denied.connect();assert.equal(denied.snapshot.error,'cancelled');
 let resolve;const late=new BloodPressureDevice({bluetooth:{requestDevice:()=>new Promise(done=>resolve=done)}});const pending=late.connect();late.disconnect();resolve(fakeMonitor().device);await pending;assert.equal(late.snapshot.phase,'idle');
});
test('inline view only offers confirmation for an actual device reading',()=>{
 const nodes=Object.fromEntries(['#bp-value','#bp-status','[data-action="bp-confirm"]','[data-action="bp-connect"]'].map(key=>[key,{}]));const root={querySelector:key=>nodes[key]};
 updateBloodPressureView(root,{phase:'waiting',reading:null});assert.equal(nodes['[data-action="bp-confirm"]'].hidden,true);
 updateBloodPressureView(root,{phase:'reading',reading:{systolic:128,diastolic:78},message:'received'});assert.equal(nodes['#bp-value'].textContent,'128 / 78');assert.equal(nodes['[data-action="bp-confirm"]'].hidden,false);
 assert.match(bloodPressureMarkup(),/bp-camera-read/);
});
