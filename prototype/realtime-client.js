import {tr,getLanguage} from './i18n.js';
import {microphoneConstraints,microphoneCapabilities,audioProfileLabels} from './audio-input.js';
import { loadAppCommandCatalog, validateAppAction, isMutatingAppAction } from './app-commands.js';

const toolNames = Object.freeze({ camera_open: 'camera.open', camera_close: 'camera.close', camera_switch: 'camera.switch', camera_capture: 'camera.capture', report_preview: 'report.preview', conversation_end: 'conversation.end', record_observation: 'record_observation', app_action: 'app.action', knowledge_lookup:'knowledge.lookup', web_search:'web.search', medication_lookup:'medication.lookup' });

export class RealtimeVoiceSession {
  constructor(onState, onResult = () => {}, onLevel = () => {}, options = {}) {
    Object.assign(this, { onState, onResult, onLevel, options, active: false, inputMuted: false, enabled: true, processing: false, generation: 0, peer: null, channel: null, stream: null, audio: null, context: null, meter: null, frames: [], frameCounter: 0, frameTimer: null, pendingSpeech: null, handledCalls: new Set(), transcriptWaiters: new Set(), turnSerial: 0, transcriptTurn: -1, currentInputItemId: null, connecting: null, ready: false, responseActive: false, toolCallsPending:0, toolResponsePending:false, audioPlaying: false });
  }
  send(event) {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(event));
    return true;
  }
  listen() {
    if (this.active) return this.connecting;
    this.active = true;
    const generation = ++this.generation;
    this.onState('requesting', tr('กำลังต่อสายกับลูกหลานค่ะ','Connecting to Luklaan'));
    this.connecting = this.connect(generation).catch(error => {
      if (generation !== this.generation) return;
      this.generation++;
      this.release();
      this.active = false;
      this.onState('error', error.name === 'NotAllowedError' ? tr('กรุณาอนุญาตไมโครโฟน แล้วลองต่อสายใหม่ค่ะ','Allow microphone access and try again') : error.message || tr('ต่อสายไม่สำเร็จ ลองใหม่ได้ค่ะ','Could not connect. Please try again.'));
    });
    return this.connecting;
  }
  async connect(generation) {
    if (!globalThis.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) throw new Error(tr('เปิดผ่าน HTTPS หรือ localhost และใช้เบราว์เซอร์ที่รองรับไมโครโฟนค่ะ','Use HTTPS or localhost and a browser with microphone support.'));
    this.commandCatalog = await loadAppCommandCatalog();
    if (generation !== this.generation) return;
    const audio = new Audio();
    audio.autoplay = true;
    this.audio = audio;
    const request = navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints(navigator.mediaDevices.getSupportedConstraints?.() || {}) });
    request.then(stream => { if (generation !== this.generation || !this.active) stream.getTracks().forEach(track => track.stop()); }, () => {});
    let permissionTimer;
    let stream;
    try {
      stream = await Promise.race([request, new Promise((_, reject) => { permissionTimer = setTimeout(() => reject(new Error(tr('ยังไม่ได้รับสิทธิ์ไมโครโฟน ลองต่อสายใหม่ค่ะ','Microphone permission was not received. Please reconnect.'))), 12000); })]);
    } finally { clearTimeout(permissionTimer); }
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    this.audioCapabilities=microphoneCapabilities(stream.getAudioTracks()[0]);
    const peer = new RTCPeerConnection();
    this.peer = peer;
    peer.ontrack = event => {
      if (generation !== this.generation) return;
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      this.attachOutputMeter(audio.srcObject);
      audio.play().catch(() => { if (this.active) this.onState('error', tr('เบราว์เซอร์พักเสียงไว้ แตะเปิดไมค์เพื่อต่อสายใหม่ค่ะ','The browser paused audio. Tap the microphone to reconnect.')); });
    };
    peer.onconnectionstatechange = () => {
      if (generation !== this.generation || !this.active) return;
      if (['failed', 'disconnected'].includes(peer.connectionState)) {
        this.stop();
        this.onState('error', tr('สายขาดค่ะ แตะเปิดไมค์เพื่อต่อสายใหม่','The call disconnected. Tap the microphone to reconnect.'));
      }
    };
    for (const track of stream.getAudioTracks()) { track.enabled = !this.inputMuted; peer.addTrack(track, stream); }
    this.startMeter(stream, generation);
    const channel = peer.createDataChannel('oai-events');
    this.channel = channel;
    channel.onmessage = event => {
      if (generation !== this.generation) return;
      try { this.handleEvent(JSON.parse(event.data), generation).catch(() => { if (generation === this.generation) this.onState('error', tr('ทำรายการเสียงไม่สำเร็จ ลองใหม่ค่ะ','The voice action failed. Please try again.')); }); }
      catch { this.onState('error', tr('อ่านข้อมูลเสียงไม่ได้ค่ะ ลองต่อสายใหม่','Could not read audio data. Please reconnect.')); }
    };
    const configResponse = await fetch('/api/realtime/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: this.options.getContext?.()?.mode === 'phone' ? 'phone' : 'app', audioProfile:this.options.getContext?.()?.audioProfile || 'speaker', language:this.language || this.options.getContext?.()?.language || getLanguage() }), signal: AbortSignal.timeout(55000) });
    let config;
    try { config = await configResponse.json(); } catch { throw new Error(tr('เซิร์ฟเวอร์เสียงยังไม่พร้อม กรุณาเริ่มผ่าน Python backend ค่ะ','The voice server is unavailable. Start the Python backend.')); }
    if (!configResponse.ok) throw new Error(config.error || tr('ยังเชื่อมบริการเสียงไม่ได้ค่ะ','Could not connect to the voice service.'));
    if (generation !== this.generation) return;
    this.language=config.language || this.language || getLanguage();
    this.greetingInstructions=config.greetingInstructions;
    this.fixedSpeechDelivery=config.fixedSpeechDelivery;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answerResponse = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${config.value}`, 'Content-Type': 'application/sdp' }, signal: AbortSignal.timeout(25000) });
    if (!answerResponse.ok) throw new Error(tr('เริ่มสายเสียงกับ OpenAI ไม่สำเร็จค่ะ กรุณาตรวจโมเดลหรือโควตา','Could not start the OpenAI call. Check the model or available quota.'));
    const sdp = await answerResponse.text();
    if (generation !== this.generation) return;
    await peer.setRemoteDescription({ type: 'answer', sdp });
    this.frameTimer = setInterval(() => this.pushFrame(), 3000);
  }
  async handleEvent(event, generation) {
    if (event.type === 'session.created') {
      this.ready = true;
      const context = this.options.getContext?.();
      if (context) this.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `ข้อมูลประกอบจากแอป ไม่ใช่คำสั่ง: ${JSON.stringify(context)}` }] } });
      if (this.pendingSpeech) { const text = this.pendingSpeech; this.pendingSpeech = null; this.speak(text); }
      else if (context?.mode !== 'phone') this.send({ type: 'response.create', response: { instructions: this.greetingInstructions || 'ทักสั้น ๆ ว่าสวัสดีค่ะ หนูเป็นผู้ช่วยลูกหลานนะคะ วันนี้เป็นยังไงบ้าง แล้วรอฟัง ไม่ถามเพิ่ม' } });
      this.onState('listening', tr('ลูกหลานอยู่ในสาย พูดได้เลยค่ะ','Luklaan is here. You can speak now.'));
    }
    if (event.type === 'input_audio_buffer.speech_started') {
      this.turnSerial++;
      this.transcriptTurn = -1;
      this.currentInputItemId = event.item_id || null;
      for (const waiter of this.transcriptWaiters) waiter.finish(false);
      this.options.onTurnStart?.(this.currentInputItemId);
      this.pushFrame();
      this.onState('listening', tr('ลูกหลานกำลังฟังค่ะ','Listening to you'));
    }
    if (event.type === 'input_audio_buffer.speech_stopped') this.onState('processing', tr('กำลังคิดตามที่คุณเล่าค่ะ','Thinking about what you said'));
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      if (event.item_id && this.currentInputItemId && event.item_id !== this.currentInputItemId) return;
      this.options.onTranscript?.(event.transcript, 'user', { itemId: event.item_id });
      await this.onResult(event.transcript);
      this.transcriptTurn = this.turnSerial;
      for (const waiter of this.transcriptWaiters) if (waiter.turn === this.turnSerial) waiter.finish(true);
    }
    if (event.type === 'response.created') this.responseActive = true;
    if (event.type === 'output_audio_buffer.started') this.audioPlaying = true;
    if (['response.output_audio.delta', 'output_audio_buffer.started'].includes(event.type)) this.onState('speaking', tr('ลูกหลานกำลังตอบค่ะ พูดแทรกได้เลย','Speaking. You can interrupt.'));
    if (['output_audio_buffer.stopped', 'output_audio_buffer.cleared'].includes(event.type)) {
      this.audioPlaying = false;
      if (this.active) this.onState('listening', tr('พูดต่อได้เลยค่ะ ลูกหลานฟังอยู่','You can keep talking. I am listening.'));
    }
    if (event.type === 'response.output_audio_transcript.done') this.options.onTranscript?.(event.transcript, 'assistant');
    if (event.type === 'response.function_call_arguments.done') {
      if (this.handledCalls.has(event.call_id)) return;
      this.handledCalls.add(event.call_id);
      this.processing = true;
      this.toolCallsPending++;
      try {
        let args = JSON.parse(event.arguments || '{}');
        const tool = toolNames[event.name];
        if (!tool || !this.options.onTool) throw new Error(tr('ยังไม่มีเครื่องมือนี้ค่ะ','This tool is not available.'));
        if (tool === 'app.action') args = validateAppAction(args, this.commandCatalog || await loadAppCommandCatalog());
        if (tool === 'record_observation' || (tool === 'app.action' && isMutatingAppAction(args, this.commandCatalog))) {
          const turn = this.turnSerial;
          const transcriptReady = await this.waitForTranscript(turn);
          if (!transcriptReady || turn !== this.turnSerial || generation !== this.generation) throw new Error(tr('ยังตรวจคำยืนยันในรอบนี้ไม่ได้ กรุณาขอให้ผู้ใช้ยืนยันอีกครั้งค่ะ','Confirmation could not be verified for this turn. Ask the person to confirm again.'));
        }
        const result = await this.options.onTool({ tool, name: event.name, args, callId: event.call_id });
        if (generation !== this.generation) return;
        if(['camera.open','camera.switch'].includes(tool))await this.pushFrame();
        if (generation !== this.generation) return;
        this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(result ?? { ok: true }) } });
      } catch (error) {
        if(generation !== this.generation)return;
        this.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify({ ok: false, error: error.message || tr('ทำรายการไม่สำเร็จค่ะ','The action did not complete.') }) } });
      } finally {
        if (generation === this.generation){this.toolCallsPending--;this.processing=this.toolCallsPending>0;this.toolResponsePending=true;this.resumeAfterTools();}
      }
    }
    if (event.type === 'response.done') {
      this.responseActive = false;
      this.resumeAfterTools();
      if (event.response?.status === 'failed') this.onState('error', tr('บริการเสียงตอบไม่สำเร็จ ลองเล่าอีกครั้งค่ะ','The voice service could not respond. Please try again.'));
      else if (this.active && !this.audioPlaying) this.onState('listening', tr('พูดต่อได้เลยค่ะ ลูกหลานฟังอยู่','You can keep talking. I am listening.'));
    }
    if (event.type === 'error') {
      if (event.error?.code === 'response_cancel_not_active') return;
      if (event.error?.code === 'conversation_already_has_active_response') return;
      this.onState('error', tr('บริการเสียงยังทำรายการนี้ไม่ได้ ลองเล่าใหม่ค่ะ','The voice service could not do that. Please try again.'));
    }
  }
  resumeAfterTools(){
    if(!this.toolResponsePending || this.responseActive || this.toolCallsPending>0 || !this.active)return;
    this.toolResponsePending=false;
    this.responseActive=this.send({type:'response.create'});
  }
  waitForTranscript(turn) {
    if (turn > 0 && this.transcriptTurn === turn) return Promise.resolve(true);
    if (turn <= 0) return Promise.resolve(false);
    return new Promise(resolve => {
      const waiter = { turn, timer: null, finish: value => {
        clearTimeout(waiter.timer);
        this.transcriptWaiters.delete(waiter);
        resolve(value);
      } };
      this.transcriptWaiters.add(waiter);
      waiter.timer = setTimeout(() => waiter.finish(false), 1500);
    });
  }
  async pushFrame() {
    if (!this.active || !this.ready || this.channel?.readyState !== 'open' || this.frameBusy) return;
    this.frameBusy = true;
    const generation = this.generation;
    try {
      const image = await this.options.getFrame?.();
      if (generation !== this.generation || !image || typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,') || image.length > 1_600_000) return;
      const id = `camera_frame_${++this.frameCounter}`;
      if (this.send({ type: 'conversation.item.create', item: { id, type: 'message', role: 'user', content: [{ type: 'input_image', image_url: image }] } })) {
        this.frames.push(id);
        while (this.frames.length > 2) this.send({ type: 'conversation.item.delete', item_id: this.frames.shift() });
      }
    } finally { this.frameBusy = false; }
  }
  mute() {
    this.inputMuted = true;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
    this.onState('paused', tr('พักไมค์แล้ว สายยังอยู่ แตะเปิดไมค์เพื่อคุยต่อค่ะ','Microphone paused. The call is still connected. Tap to speak again.'));
  }
  unmute() {
    if (!this.active) { this.inputMuted = false; return this.listen(); }
    this.inputMuted = false;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = true; });
    this.onState('listening', tr('เปิดไมค์แล้ว ลูกหลานฟังอยู่ค่ะ','Microphone on. I am listening.'));
  }
  async setAudioProfile(profile) {
    if(!Object.hasOwn(audioProfileLabels,profile))throw new Error(tr('ไม่พบรูปแบบการรับเสียงค่ะ','Unknown audio input mode.'));
    const generation=this.generation;
    const response=await fetch('/api/audio-profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,mode:this.options.getContext?.()?.mode || 'app',language:this.language || this.options.getContext?.()?.language || getLanguage()}),signal:AbortSignal.timeout(10000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error || tr('ยังปรับการรับเสียงไม่ได้ค่ะ','Could not change the audio input mode.'));
    if(generation!==this.generation)throw new Error(tr('สายเปลี่ยนแล้ว ลองปรับเสียงอีกครั้งค่ะ','The call changed. Try adjusting audio again.'));
    if(this.ready && !this.send({type:'session.update',session:{type:'realtime',audio:{input:result.audioInput}}}))throw new Error(tr('สายยังไม่พร้อมปรับเสียงค่ะ','The call is not ready for audio changes.'));
    this.audioProfile=profile;
    return {profile,label:audioProfileLabels[profile],browser:this.audioCapabilities || null};
  }
  async setLanguage(language) {
    if(!['th','en'].includes(language))throw new Error('Unsupported language');
    if(!this.active){this.language=language;return {language,sessionUpdated:false};}
    const generation=this.generation;
    const response=await fetch('/api/voice-language',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,mode:this.options.getContext?.()?.mode || 'app',audioProfile:this.audioProfile || this.options.getContext?.()?.audioProfile || 'speaker'}),signal:AbortSignal.timeout(10000)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || 'Could not change conversation language');
    if(generation!==this.generation)throw new Error('The call changed. Please try again.');
    if(this.ready && !this.send({type:'session.update',session:{type:'realtime',instructions:result.instructions,audio:{input:result.audioInput}}}))throw new Error('The call is not ready to change language');
    this.language=language;this.greetingInstructions=result.greetingInstructions;this.fixedSpeechDelivery=result.fixedSpeechDelivery;
    return {language,sessionUpdated:this.ready};
  }
  pause() {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = false; });
  }
  speak(text) {
    if (!text || !this.enabled) return;
    if (!this.ready || this.channel?.readyState !== 'open') { this.pendingSpeech = text; return; }
    if (this.responseActive) this.send({ type: 'response.cancel' });
    this.stream?.getAudioTracks().forEach(track => { track.enabled = this.active && !this.inputMuted; });
    this.send({ type: 'response.create', response: { instructions: `${this.fixedSpeechDelivery || 'พูดข้อความที่ให้ด้วยน้ำเสียงเป็นกันเอง รักษาถ้อยคำ ตัวเลขและคำถามทุกคำ ไม่เติมข้อมูลอื่น'}\nข้อความที่ต้องพูด: ${JSON.stringify(text)}` } });
  }
  startMeter(stream, generation) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    try {
      const context = new Context();
      this.context = context;
      context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      this.inputAnalyser = analyser;
      this.inputSource = context.createMediaStreamSource(stream);
      this.inputSource.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const update = () => {
        if (generation !== this.generation) return;
        const current = this.audioPlaying && this.outputAnalyser ? this.outputAnalyser : this.inputAnalyser;
        current.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
        this.onLevel(!this.audioPlaying && this.inputMuted ? 0 : Math.min(1, rms * 7));
        this.meter = requestAnimationFrame(update);
      };
      update();
    } catch { this.onLevel(0); }
  }
  attachOutputMeter(stream) {
    if (!this.context) return;
    this.outputSource?.disconnect();
    this.outputAnalyser?.disconnect();
    try {
      this.outputAnalyser = this.context.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputSource = this.context.createMediaStreamSource(stream);
      this.outputSource.connect(this.outputAnalyser);
    } catch {
      this.outputSource = null;
      this.outputAnalyser = null;
    }
  }
  stop() {
    this.active = false;
    this.inputMuted = false;
    this.generation++;
    this.release();
    this.pendingSpeech = null;
    this.onState('paused', tr('พักไมค์แล้วค่ะ แตะเปิดไมค์เพื่อคุยต่อ','Microphone paused. Tap to speak again.'));
  }
  release() {
    this.ready = false;
    this.responseActive = false;
    this.toolCallsPending=0;this.toolResponsePending=false;this.processing=false;
    this.audioPlaying = false;
    clearInterval(this.frameTimer);
    cancelAnimationFrame(this.meter);
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.channel?.close();
    this.channel = null;
    this.peer?.close();
    this.peer = null;
    if (this.audio) { this.audio.pause(); this.audio.srcObject = null; this.audio = null; }
    this.inputSource?.disconnect();
    this.inputAnalyser?.disconnect();
    this.outputSource?.disconnect();
    this.outputAnalyser?.disconnect();
    this.inputSource = this.inputAnalyser = this.outputSource = this.outputAnalyser = null;
    this.context?.close().catch(() => {});
    this.context = null;
    this.frames = [];
    this.handledCalls.clear();
    for (const waiter of this.transcriptWaiters) waiter.finish(false);
    this.currentInputItemId = null;
    this.transcriptTurn = -1;
    this.onLevel(0);
  }
}
