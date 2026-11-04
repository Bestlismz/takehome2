export function waitForVideoFrame(video) {
  if (!video.requestVideoFrameCallback) return video.readyState >= 2 ? Promise.resolve() : Promise.reject(new Error('ยังไม่ได้รับภาพจากกล้องค่ะ'));
  return new Promise((resolve, reject) => {
    const callbackId = video.requestVideoFrameCallback(() => { clearTimeout(timer); resolve(); });
    const timer = setTimeout(() => {
      video.cancelVideoFrameCallback?.(callbackId);
      if (video.readyState >= 2) resolve();
      else reject(new Error('ยังไม่ได้รับภาพจากกล้องค่ะ'));
    }, 1500);
  });
}

export class CameraSession {
  constructor() {
    this.stream = null;
    this.generation = 0;
    this.facing = 'environment';
    this.deviceId = '';
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }
  async open(video, { facing = this.facing, deviceId = '' } = {}) {
    this.stop();
    const generation = this.generation;
    this.facing = facing;
    this.deviceId = deviceId;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('เปิดผ่าน HTTPS หรือ localhost เพื่อใช้กล้องค่ะ');
    const request = navigator.mediaDevices.getUserMedia({
      audio: false,
      video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
    });
    let timeout;
    request.then(stream => {
      if (generation !== this.generation) stream.getTracks().forEach(track => track.stop());
    }, () => {});
    let stream;
    try {
      stream = await Promise.race([request, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('ยังไม่ได้รับสิทธิ์กล้อง แตะกล้องเพื่อลองอีกครั้งค่ะ')), 12000);
      })]);
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    } finally { clearTimeout(timeout); }
    if (generation !== this.generation || !video.isConnected) {
      stream.getTracks().forEach(track => track.stop());
      return null;
    }
    this.stream = stream;
    video.srcObject = stream;
    try {
      await video.play();
      if (generation !== this.generation || !video.isConnected) { stream.getTracks().forEach(track => track.stop()); return null; }
      await waitForVideoFrame(video);
      const settings = stream.getVideoTracks()[0].getSettings();
      video.classList.toggle('mirrored', settings.facingMode === 'user');
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      if (generation !== this.generation || !video.isConnected) { stream.getTracks().forEach(track => track.stop()); return null; }
      return { settings, devices };
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }
  capture(video) {
    if (!this.stream || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 900 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * ratio);
    canvas.height = Math.round(video.videoHeight * ratio);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65);
  }
}

export function photoFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) return reject(new Error('กรุณาเลือกไฟล์ภาพค่ะ'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('กรุณาเลือกภาพขนาดไม่เกิน 15 MB ค่ะ'));
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const ratio = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านภาพนี้ไม่ได้ ลองเลือกภาพอื่นค่ะ')); };
    image.src = url;
  });
}

export class VoiceSession {
  constructor(onState, onResult, onLevel = () => {}) {
    Object.assign(this, { onState, onResult, onLevel, active: false, recognition: null, generation: 0, speechGeneration: 0, enabled: true, processing: false, networkErrors: 0, meterStream: null, audioContext: null, meterFrame: null, permissionTimer: null, resumeTimer: null });
  }
  stopMeter() {
    cancelAnimationFrame(this.meterFrame);
    this.meterStream?.getTracks().forEach(track => track.stop());
    this.meterStream = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.onLevel(0);
  }
  async startMeter(generation) {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (generation !== this.generation || !this.recognition || !this.active) { stream.getTracks().forEach(track => track.stop()); return; }
      this.meterStream = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      if (generation !== this.generation) return;
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      this.audioContext.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const update = () => {
        if (generation !== this.generation || !this.meterStream) return;
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        this.onLevel(Math.min(1, rms * 7));
        this.meterFrame = requestAnimationFrame(update);
      };
      update();
    } catch { if (generation === this.generation) this.stopMeter(); }
  }
  pause() {
    this.generation++;
    clearTimeout(this.permissionTimer);
    clearTimeout(this.resumeTimer);
    const recognition = this.recognition;
    this.recognition = null;
    recognition?.abort();
    this.stopMeter();
  }
  stop() {
    this.active = false;
    this.speechGeneration++;
    this.pause();
    window.speechSynthesis?.cancel();
    this.onState('paused', 'พักไมค์แล้วค่ะ กดเปิดไมค์เพื่อคุยต่อ');
  }
  listen() {
    if (this.active) return;
    this.active = true;
    this.networkErrors = 0;
    this.resume();
  }
  scheduleResume(delay = 220) {
    clearTimeout(this.resumeTimer);
    if (this.active) this.resumeTimer = setTimeout(() => this.resume(), delay);
  }
  speak(text) {
    this.pause();
    const speechGeneration = ++this.speechGeneration;
    window.speechSynthesis?.cancel();
    if (!this.enabled || !window.speechSynthesis) { this.scheduleResume(); return; }
    const message = new SpeechSynthesisUtterance(text);
    message.lang = 'th-TH';
    message.rate = 0.85;
    const thaiVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('th'));
    if (thaiVoice) message.voice = thaiVoice;
    message.onstart = () => { if (speechGeneration === this.speechGeneration) this.onState('speaking', 'ลูกหลานกำลังพูดค่ะ ฟังจบแล้วพูดต่อได้เลย'); };
    const finish = () => {
      if (speechGeneration !== this.speechGeneration) return;
      this.onState(this.active ? 'ready' : 'paused', this.active ? 'กำลังกลับมาฟังค่ะ' : 'พักไมค์อยู่ค่ะ');
      this.scheduleResume();
    };
    message.onend = finish;
    message.onerror = finish;
    window.speechSynthesis.speak(message);
  }
  resume() {
    if (!this.active || this.recognition || this.processing) return;
    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) { this.scheduleResume(); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      this.active = false;
      this.onState('error', 'เบราว์เซอร์นี้ยังไม่รองรับการฟังเสียง กรุณาเปิดด้วยเบราว์เซอร์ที่รองรับค่ะ');
      return;
    }
    const generation = ++this.generation;
    const recognition = new Recognition();
    let received = false;
    let retryDelay = 250;
    this.recognition = recognition;
    recognition.lang = 'th-TH';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      if (generation !== this.generation) return;
      clearTimeout(this.permissionTimer);
      this.onState('listening', 'กำลังฟังค่ะ พูดได้เลย ไม่ต้องกดไมค์ซ้ำ');
      this.startMeter(generation);
    };
    recognition.onresult = event => {
      if (generation !== this.generation || received) return;
      const result = event.results[event.results.length - 1];
      if (!result.isFinal) { this.onState('transcribing', result[0].transcript); return; }
      received = true;
      this.networkErrors = 0;
      this.processing = true;
      recognition.stop();
      this.stopMeter();
      this.onState('processing', 'กำลังฟังสิ่งที่คุณบอกค่ะ');
      Promise.resolve().then(() => this.onResult(result[0].transcript)).catch(() => {
        this.onState('error', 'ทำรายการไม่สำเร็จ ลองบอกใหม่ได้ค่ะ');
      }).finally(() => { this.processing = false; this.scheduleResume(); });
    };
    recognition.onerror = event => {
      if (generation !== this.generation) return;
      clearTimeout(this.permissionTimer);
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        this.active = false;
        this.pause();
        this.onState('error', 'ไมค์หรือบริการเสียงยังไม่พร้อม ตรวจสิทธิ์แล้วเปิดไมค์อีกครั้งได้ค่ะ');
      } else if (event.error === 'network') {
        this.networkErrors++;
        retryDelay = 1200;
        if (this.networkErrors >= 3) {
          this.active = false;
          this.pause();
          this.onState('error', 'บริการเสียงเชื่อมต่อไม่ได้ กดเปิดไมค์เพื่อลองใหม่ได้ค่ะ');
        } else this.onState('reconnecting', 'กำลังเชื่อมต่อเสียงใหม่ค่ะ');
      }
    };
    recognition.onend = () => {
      if (generation !== this.generation) return;
      clearTimeout(this.permissionTimer);
      this.recognition = null;
      this.stopMeter();
      if (this.active && !this.processing) this.scheduleResume(retryDelay);
    };
    this.onState('requesting', 'กำลังเชื่อมต่อไมโครโฟนค่ะ');
    try {
      recognition.start();
      this.permissionTimer = setTimeout(() => {
        if (generation !== this.generation) return;
        this.stop();
        this.onState('error', 'ยังเริ่มฟังไม่ได้ ตรวจสิทธิ์ไมค์แล้วลองใหม่ได้ค่ะ');
      }, 12000);
    } catch {
      this.stop();
      this.onState('error', 'เริ่มไมโครโฟนไม่ได้ ตรวจสิทธิ์แล้วเปิดไมค์อีกครั้งได้ค่ะ');
    }
  }
}

export function interpret(text) {
  const normalized = text.replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
  const numbers = normalized.match(/\d+(?:[.,]\d+)?/g)?.map(n => Number(n.replace(',', '.'))) || [];
  if (/ไม่ยืนยัน|ไม่ถูกต้อง|ค่าผิด|ยกเลิกบันทึก|ไม่บันทึก/.test(normalized)) return { action: 'cancel-record' };
  if (/จบการคุย|วางสาย|หยุดคุย/.test(normalized)) return { tool: 'conversation.end', args: {} };
  if (/ไม่ต้องเปิดกล้อง|อย่าเปิดกล้อง|ยังไม่เปิดกล้อง/.test(normalized)) return { tool: 'camera.close', args: {} };
  if (/(?:^|[^เ])ปิดกล้อง|หยุดกล้อง/.test(normalized)) return { tool: 'camera.close', args: {} };
  if (/ยืนยัน|บันทึกเลย|ถูกต้อง/.test(normalized)) return { action: 'confirm' };
  if (/สลับกล้อง/.test(normalized)) return { tool: 'camera.switch', args: {} };
  if (/ถ่ายภาพ|ถ่ายรูป/.test(normalized)) return { tool: 'camera.capture', args: {} };
  if (/กล้อง/.test(normalized)) return { tool: 'camera.open', args: { facing: /หน้า/.test(normalized) ? 'user' : 'environment' } };
  if (/สรุป.*(หมอ|แพทย์)|รายงาน/.test(normalized)) return { tool: 'report.preview', args: {} };
  if (/ประวัติ|สมุดสุขภาพ|ดูบันทึก/.test(normalized)) return { tool: 'history.open', args: {} };
  if (/คนดูแล|ลูกหลาน/.test(normalized)) return { tool: 'care.open', args: {} };
  if (/แผนยา|ดูยา|ยาของฉัน/.test(normalized)) return { tool: 'medication.open', args: {} };
  if (/หน้าหลัก|กลับหน้าแรก|ดูวันนี้/.test(normalized)) return { tool: 'today.open', args: {} };
  if (/กินยา|ทานยา/.test(normalized) && /แล้ว/.test(normalized)) return { action: 'dose' };
  if (/ความดัน/.test(normalized)) return numbers.length >= 2
    ? { kind: 'bloodPressure', payload: { systolic: numbers[0], diastolic: numbers[1] } }
    : { action: 'record', kind: 'bloodPressure' };
  if (/อุณหภูมิ|วัดไข้|องศา/.test(normalized)) return numbers.length
    ? { kind: 'temperature', payload: { value: numbers[0] } }
    : { action: 'record', kind: 'temperature' };
  if (/เวียน|ปวด|เหนื่อย|รู้สึก|อาการ|สบาย|ไอ|นอน|กินข้าว|กังวล/.test(normalized)) return { kind: 'symptom', payload: { text: text.trim() } };
  return { action: 'unknown' };
}
