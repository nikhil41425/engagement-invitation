/**
 * Everything is generated with the Web Audio API — no audio files, and nothing
 * ever plays until the listener asks for it. The invitation must be perfect
 * with sound off.
 */

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastSweep = 0;
  on = false;

  private init(): boolean {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;

    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // a low drone: five detuned sines through a lowpass with slow LFO breathing
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    lp.Q.value = 0.7;
    lp.connect(master);

    const freqs = [55, 55.4, 82.5, 110, 164.8];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = (i - 2) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.2 / (1 + i * 0.55);
      o.connect(g);
      g.connect(lp);
      o.start();
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 150;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();

    this.ctx = ctx;
    this.master = master;
    return true;
  }

  toggle(): boolean {
    if (!this.ctx && !this.init()) return false;
    const ctx = this.ctx!;
    const master = this.master!;
    if (ctx.state === "suspended") void ctx.resume();
    this.on = !this.on;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(this.on ? 0.2 : 0.0001, t + (this.on ? 2.4 : 0.9));
    return this.on;
  }

  /** a soft two-oscillator chime on face change */
  chime() {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    g.connect(this.master);
    [660, 990].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i ? "triangle" : "sine";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i ? 0.35 : 1;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 2.3);
    });
  }

  /** a quiet filtered sweep on swipe */
  sweep() {
    if (!this.on || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (t - this.lastSweep < 0.35) return;
    this.lastSweep = t;

    const len = 0.5;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + len);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.on = false;
  }
}
