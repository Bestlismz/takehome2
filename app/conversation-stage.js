import {bloodPressureMarkup} from './blood-pressure-view.js';
import {tr,html} from './i18n.js';
import { icon } from './icons.js';

export function conversationStageMarkup(sphere, { cameraEnabled = true } = {}) {
  return html`<section id="conversation-stage" class="conversation-stage" data-camera="off" aria-label="พื้นที่สนทนา ${cameraEnabled ? tr('และกล้อง') : tr('สายโทรศัพท์สาธิต')}">${cameraEnabled ? html`<div id="session-camera" class="stage-camera" aria-label="ภาพกล้องในบทสนทนา" aria-hidden="true"><video id="camera-video" autoplay playsinline muted></video><img id="camera-freeze" class="camera-freeze" alt="" aria-hidden="true"><div class="stage-camera-shade"></div></div>` : tr('<span class="stage-channel-label">สายสาธิต · ไม่มีการโทรจริง</span>')}<div class="stage-thought" aria-hidden="true"><span class="thought-label">อยู่ข้าง ๆ คุณค่ะ</span><span class="thought-dots"><i></i><i></i><i></i></span></div><div class="stage-companion">${sphere}</div>${cameraEnabled ? html`<div class=stage-health-tools><button type="button" class="stage-bp-open" data-action="bp-open">${tr('ความดัน','Blood pressure')}</button></div>${bloodPressureMarkup()}<div id="camera-empty" class="stage-camera-notice" role="status" hidden></div><span id="camera-live-badge" class="stage-camera-badge" hidden><i></i> ภาพสด · ส่งให้ OpenAI</span><button type="button" class="stage-flip" data-action="camera-switch" aria-label="สลับกล้องหน้าและหลัง" hidden>${icon('switch')}</button>` : ''}<div class="stage-caption"><h3 id="voice-transcript">ลูกหลานอยู่ในสาย</h3><p id="voice-status" role="status">กำลังเริ่มการคุยค่ะ</p></div><div id="capture-preview" class="stage-capture" hidden><img id="captured-photo" alt="ภาพที่เพิ่งถ่าย"><span>เก็บภาพแล้ว</span></div></section>`;
}

export class ConversationStage {
  constructor(root, { reducedMotion = false } = {}) {
    this.root = root;
    this.reducedMotion = reducedMotion;
    this.video = root.querySelector('#camera-video');
    this.cameraLayer = root.querySelector('#session-camera');
    this.notice = root.querySelector('#camera-empty');
    this.badge = root.querySelector('#camera-live-badge');
    this.flip = root.querySelector('[data-action="camera-switch"]');
    this.freeze = root.querySelector('#camera-freeze');
    this.closeTimer = null;
  }
  get cameraRequested() { return ['loading', 'live'].includes(this.root.dataset.camera); }
  refreshLanguage() {
    const cameraEnabled=Boolean(this.video);
    this.root.setAttribute('aria-label',`${tr('พื้นที่สนทนา')} ${tr(cameraEnabled?'และกล้อง':'สายโทรศัพท์สาธิต')}`);
    const update=(selector,value)=>{const element=this.root.querySelector(selector);if(element)element.textContent=tr(value);};
    update('.thought-label','อยู่ข้าง ๆ คุณค่ะ');
    update('.stage-channel-label','สายสาธิต · ไม่มีการโทรจริง');
    update('.stage-capture span','เก็บภาพแล้ว');
    this.flip?.setAttribute('aria-label',tr('สลับกล้องหน้าและหลัง'));
    this.root.querySelector('#captured-photo')?.setAttribute('alt',tr('ภาพที่เพิ่งถ่าย'));
    this.cameraLayer?.setAttribute('aria-label',tr('ภาพกล้องในบทสนทนา'));
    if(this.badge)this.badge.innerHTML=`<i></i> ${tr('ภาพสด · ส่งให้ OpenAI')}`;
    if(this.root.dataset.camera==='loading' && this.notice)this.notice.textContent=tr('กำลังเปิดกล้อง');
  }
  requesting() {
    clearTimeout(this.closeTimer);
    this.root.dataset.camera = 'loading';
    this.cameraLayer.setAttribute('aria-hidden', 'false');
    this.freeze.removeAttribute('src');
    this.notice.hidden = false;
    this.notice.textContent = tr('กำลังเปิดกล้อง');
    this.badge.hidden = true;
    this.flip.hidden = true;
  }
  live({ canSwitch = false } = {}) {
    clearTimeout(this.closeTimer);
    this.root.dataset.camera = 'live';
    this.cameraLayer.setAttribute('aria-hidden', 'false');
    this.notice.hidden = true;
    this.badge.hidden = false;
    this.flip.hidden = !canSwitch;
  }
  error(message) {
    this.root.dataset.camera = 'error';
    this.cameraLayer.setAttribute('aria-hidden', 'true');
    this.notice.hidden = false;
    this.notice.textContent = message;
    this.badge.hidden = true;
    this.flip.hidden = true;
  }
  closing(frame = null) {
    clearTimeout(this.closeTimer);
    const wasLive = this.root.dataset.camera === 'live';
    if (wasLive && frame) this.freeze.src = frame;
    this.root.dataset.camera = wasLive && !this.reducedMotion ? 'closing' : 'off';
    this.cameraLayer.setAttribute('aria-hidden', 'true');
    this.notice.hidden = true;
    this.badge.hidden = true;
    this.flip.hidden = true;
    const clear = () => {
      if (!['closing', 'off'].includes(this.root.dataset.camera)) return;
      this.root.dataset.camera = 'off';
      this.video.srcObject = null;
      this.freeze.removeAttribute('src');
    };
    if (this.root.dataset.camera === 'closing') this.closeTimer = setTimeout(clear, 460);
    else clear();
  }
  destroy() {
    clearTimeout(this.closeTimer);
    this.video.srcObject = null;
    this.freeze.removeAttribute('src');
  }
}
