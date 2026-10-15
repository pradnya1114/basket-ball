/**
 * Tiny WebAudio synth for arcade feedback — no external assets, so it works
 * offline and never blocks the game loop.
 */
type Ctor = typeof AudioContext;

export class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC: Ctor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  resume() {
    this.ensure();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.3, slideTo?: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, gain: number, filterFreq: number, q = 1, sweepTo?: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.enabled) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(80, sweepTo), t0 + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  bounce(power = 1) {
    this.tone(150 + power * 60, 0.13, "sine", 0.22, 70);
    this.noise(0.06, 0.06, 900);
  }
  rim() {
    this.tone(520, 0.18, "triangle", 0.16, 300);
    this.noise(0.12, 0.1, 2200, 6);
  }
  board() {
    this.tone(230, 0.14, "square", 0.12, 130);
    this.noise(0.08, 0.07, 700);
  }
  whoosh() {
    this.noise(0.22, 0.12, 500, 1.2, 2600);
  }
  grab() {
    this.tone(660, 0.07, "sine", 0.14, 900);
  }
  release() {
    this.tone(420, 0.06, "sine", 0.1, 260);
  }
  swish() {
    this.noise(0.3, 0.16, 5200, 0.9, 900);
  }
  score(points: number) {
    const base = points >= 3 ? 523.25 : 440;
    this.tone(base, 0.16, "triangle", 0.24);
    this.tone(base * 1.26, 0.16, "triangle", 0.2, undefined, 0.08);
    this.tone(base * 1.5, 0.3, "triangle", 0.22, undefined, 0.16);
    this.noise(0.34, 0.1, 4200, 0.8, 800, 0.02);
  }
  miss() {
    this.tone(196, 0.2, "sawtooth", 0.1, 130);
    this.tone(150, 0.26, "sine", 0.08, 96, 0.05);
  }
  combo(level: number) {
    for (let i = 0; i < 3; i += 1) this.tone(660 + level * 80 + i * 160, 0.1, "square", 0.1, undefined, i * 0.06);
  }
  countdown(final = false) {
    this.tone(final ? 880 : 520, final ? 0.3 : 0.1, "sine", final ? 0.28 : 0.16);
  }
  buzzer() {
    this.tone(196, 0.75, "square", 0.24, 180);
    this.tone(146, 0.75, "sawtooth", 0.16, 130);
  }
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, i) => this.tone(n, 0.42, "triangle", 0.22, undefined, i * 0.12));
    this.noise(0.9, 0.09, 2600, 0.6, 600, 0.1);
  }
  ui() {
    this.tone(740, 0.05, "sine", 0.1, 880);
  }
}

export const sfx = new SoundBoard();
