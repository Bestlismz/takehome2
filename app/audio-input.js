import {tr} from './i18n.js';
export const audioProfileLabels={get speaker(){return tr('คุยผ่านลำโพง');},get headset(){return tr('คุยผ่านหูฟัง');},get noisy(){return tr('บริเวณที่มีเสียงรบกวน');}};
export function microphoneConstraints(supported={}) {
  const ideal={echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1};
  return Object.fromEntries(Object.entries(ideal).filter(([key])=>supported[key]===true).map(([key,value])=>[key,{ideal:value}]));
}
export function microphoneCapabilities(track) {
  const settings=track?.getSettings?.() || {};
  return Object.fromEntries(['echoCancellation','noiseSuppression','autoGainControl'].map(key=>[key,typeof settings[key]==='boolean'?settings[key]:null]));
}
