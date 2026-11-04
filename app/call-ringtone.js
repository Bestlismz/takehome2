export class CallRingtone {
  constructor() { this.context = null; this.timer = null; this.tones = new Set(); }
  async unlock() {
    const AudioContext = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      return this.context.state === 'running';
    } catch { return false; }
  }
  start() {
    this.stop();
    if (!this.context || this.context.state !== 'running') return;
    const pulse = () => {
      const ctx = this.context;
      for (const offset of [0, .65]) {
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        const at = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.035, at + .035);
        gain.gain.setValueAtTime(.035, at + .32);
        gain.gain.linearRampToValueAtTime(0, at + .43);
        let remaining = 2;
        for (const frequency of [440, 480]) {
          const tone = ctx.createOscillator();
          tone.frequency.value = frequency;
          tone.connect(gain);
          this.tones.add(tone);
          tone.onended = () => { this.tones.delete(tone); tone.disconnect(); if (--remaining === 0) gain.disconnect(); };
          tone.start(at);
          tone.stop(at + .45);
        }
      }
    };
    pulse();
    this.timer = setInterval(pulse, 2600);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const tone of this.tones) { try { tone.stop(); } catch {} }
    this.tones.clear();
  }
}
