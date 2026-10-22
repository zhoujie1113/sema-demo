/** 全部用 WebAudio 实时合成：引擎、海潮、风噪、界面提示音，无需外部音频素材。 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private waveGain: GainNode | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private muted = false;
  private started = false;
  private paused = false;

  get isMuted() {
    return this.muted;
  }

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(ctx.destination);
    this.master = master;

    // ---- 引擎 ----
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 3.4;
    filter.connect(engineGain);
    engineGain.connect(master);

    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.value = 60;
    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    osc1.connect(g1).connect(filter);
    osc1.start();

    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = 30;
    const g2 = ctx.createGain();
    g2.gain.value = 0.32;
    osc2.connect(g2).connect(filter);
    osc2.start();

    this.engineGain = engineGain;
    this.osc1 = osc1;
    this.osc2 = osc2;
    this.filter = filter;

    // ---- 风噪 / 轮胎 ----
    const noise = this.noiseBuffer(ctx, 2);
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 900;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();
    this.windGain = windGain;

    // ---- 海浪 ----
    const surf = ctx.createBufferSource();
    surf.buffer = this.noiseBuffer(ctx, 4);
    surf.loop = true;
    const surfFilter = ctx.createBiquadFilter();
    surfFilter.type = "lowpass";
    surfFilter.frequency.value = 620;
    const surfGain = ctx.createGain();
    surfGain.gain.value = 0.12;
    surf.connect(surfFilter).connect(surfGain).connect(master);
    surf.start();
    this.waveGain = surfGain;

    // 潮汐起伏
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(surfGain.gain);
    lfo.start();

    this.started = true;
  }

  private noiseBuffer(ctx: AudioContext, seconds: number) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buf;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, this.ctx.currentTime + 0.15);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  suspend() {
    this.paused = true;
    if (this.ctx) void this.ctx.suspend();
  }

  resume() {
    this.paused = false;
    if (this.ctx) void this.ctx.resume();
  }

  update(opts: { rpm: number; throttle: number; speed: number; slip: number }) {
    if (!this.ctx || !this.started || this.paused) return;
    const t = this.ctx.currentTime;
    const { rpm, throttle, speed, slip } = opts;

    const base = 34 + rpm * 0.021;
    if (this.osc1 && this.osc2) {
      this.osc1.frequency.setTargetAtTime(base, t, 0.08);
      this.osc2.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    }
    if (this.filter) {
      this.filter.frequency.setTargetAtTime(420 + rpm * 0.22 + throttle * 400, t, 0.1);
    }
    if (this.engineGain) {
      const target = 0.035 + throttle * 0.075 + Math.min(speed, 40) * 0.0016;
      this.engineGain.gain.setTargetAtTime(target, t, 0.12);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0026) + slip * 0.02, t, 0.15);
    }
    if (this.waveGain) {
      this.waveGain.gain.setTargetAtTime(0.1, t, 0.5);
    }
  }

  /** 简短提示音 */
  blip(freq = 660, dur = 0.09, gain = 0.1) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 碰撞闷响 */
  thud(strength: number) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const amp = Math.min(0.35, 0.06 + strength * 0.02);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }
}
