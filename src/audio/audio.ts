/**
 * Procedural soundscape: airflow over the wings, wingbeats, and the Mojave's
 * voices by season and hour — cactus wrens, Gambel's quail, mourning doves,
 * ravens, summer cicadas, spadefoot toads after a monsoon, burros, coyotes and
 * passing trucks on US-95 — plus each species' own call. Everything is
 * synthesised with WebAudio; no samples.
 */

export interface AudioState {
  speed: number;
  agl: number;
  flapPhase: number;
  flapAmount: number;
  perched: boolean;
  night: number;
  month: number; // 1..12
  hour: number; // 0..24 solar
  wet: number; // 0..1 lake shore / water nearby
  scrub: number; // 0..1 open desert scrub nearby
  town: number; // 0..1 houses and yards nearby
  ravens: number; // distance to nearest raven flock (m)
  burro: number; // distance to nearest wild burro (m)
  car: number; // distance to nearest vehicle (m)
  carSpeed: number;
  active: boolean; // flying (not in the menu)
  drive: number; // 1 while in the pickup
  rpm: number; // 0..1
  throttle: number;
  tyre: number; // surface roughness 0..1
  slip: number; // 0..1 lateral slide
  horn: boolean;
  rain: number; // rainfall 0..1
  snow: number; // snow cover 0..1 (hushes everything)
  roadWet: number; // ground wetness 0..1 (tyre swish)
  windSpeed: number; // surface wind (m/s)
}

type CallType = 'scream' | 'kak' | 'whistle' | 'raven' | 'croak' | 'coo' | 'quail' | 'hoot' | 'screech' | 'peent' | 'chitter' | 'hiss';

const CALLS: Record<string, CallType> = {
  redtail: 'scream',
  raven: 'raven',
  goldeneagle: 'whistle',
  vulture: 'hiss',
  prairiefalcon: 'kak',
  kestrel: 'kak',
  roadrunner: 'coo',
  quail: 'quail',
  hornedowl: 'hoot',
  burrowingowl: 'screech',
  nighthawk: 'peent',
  swift: 'chitter',
  hummingbird: 'chitter',
  osprey: 'whistle',
  baldeagle: 'chitter',
  heron: 'croak',
};

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export class SoundScape {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private whistleGain!: GainNode;
  private whistleFilter!: BiquadFilterNode;
  private roadGain!: GainNode;
  private roadFilter!: BiquadFilterNode;
  private ambience!: GainNode;
  private engineGain!: GainNode;
  private engineFilter!: BiquadFilterNode;
  private engineOsc: { o: OscillatorNode; mul: number }[] = [];
  private tyreGain!: GainNode;
  private tyreFilter!: BiquadFilterNode;
  private squealGain!: GainNode;
  private hornGain!: GainNode;
  private rainHiss!: GainNode;
  private rainHissFilter!: BiquadFilterNode;
  private rainPatter!: GainNode;
  private roofDrum!: GainNode;
  private muffle!: BiquadFilterNode;
  private bubbleGain!: GainNode;
  private ghostGain!: GainNode;
  private ghostFilter!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  private dripT = 0;
  private lastSin = 0;
  private timers = { wren: 4, quail: 7, dove: 5, cicada: 3, toad: 0, raven: 2, bray: 10, coyote: 30 };
  private crickets: { rate: number; pan: number; next: number }[] = [];
  muted = false;
  volume = 0.8;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    // Everything passes a low-pass that closes when the camera goes under water.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);
    this.ambience = ctx.createGain();
    this.ambience.connect(this.master);

    // Pink-ish noise buffer shared by wind, flaps and hisses.
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = this.noise.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029591;
        b1 = 0.985 * b1 + w * 0.032534;
        b2 = 0.95 * b2 + w * 0.048056;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
      }
    }
    const loop = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start(0, Math.random() * 2);
      return s;
    };
    // Rushing air: low roar that opens up with speed.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    loop().connect(this.windFilter).connect(this.windGain).connect(this.master);
    // High whistle of a stoop.
    this.whistleFilter = ctx.createBiquadFilter();
    this.whistleFilter.type = 'bandpass';
    this.whistleFilter.Q.value = 6;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;
    loop().connect(this.whistleFilter).connect(this.whistleGain).connect(this.master);
    // Tyre roar from the nearest road.
    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = 'lowpass';
    this.roadFilter.frequency.value = 700;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    loop().connect(this.roadFilter).connect(this.roadGain).connect(this.ambience);

    // Pickup: V8 firing note, tyre roar, skid squeal and horn.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 2;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    for (const [type, mul, g] of [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sine', 0.25, 0.6]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(this.engineFilter);
      o.start();
      this.engineOsc.push({ o, mul });
    }
    this.tyreFilter = ctx.createBiquadFilter();
    this.tyreFilter.type = 'lowpass';
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    loop().connect(this.tyreFilter).connect(this.tyreGain).connect(this.master);
    const sq = ctx.createBiquadFilter();
    sq.type = 'bandpass';
    sq.frequency.value = 1300;
    sq.Q.value = 9;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    loop().connect(sq).connect(this.squealGain).connect(this.master);
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 2200;
    hf.connect(this.hornGain).connect(this.master);
    for (const f of [349, 440]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(hf);
      o.start();
    }

    // Rain: broadband hiss of drops on grass and leaves, a softer patter
    // underneath, and a hollow drumming on the cab roof.
    this.rainHissFilter = ctx.createBiquadFilter();
    this.rainHissFilter.type = 'bandpass';
    this.rainHissFilter.frequency.value = 4200;
    this.rainHissFilter.Q.value = 0.45;
    this.rainHiss = ctx.createGain();
    this.rainHiss.gain.value = 0;
    loop().connect(this.rainHissFilter).connect(this.rainHiss).connect(this.master);
    const pf = ctx.createBiquadFilter();
    pf.type = 'bandpass';
    pf.frequency.value = 1100;
    pf.Q.value = 0.8;
    this.rainPatter = ctx.createGain();
    this.rainPatter.gain.value = 0;
    loop().connect(pf).connect(this.rainPatter).connect(this.master);
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 420;
    rf.Q.value = 1.4;
    this.roofDrum = ctx.createGain();
    this.roofDrum.gain.value = 0;
    loop().connect(rf).connect(this.roofDrum).connect(this.master);

    // Under water: a dull, close rumble of current and bubbles.
    const bub = ctx.createBiquadFilter();
    bub.type = 'lowpass';
    bub.frequency.value = 260;
    bub.Q.value = 3;
    this.bubbleGain = ctx.createGain();
    this.bubbleGain.gain.value = 0;
    loop().connect(bub).connect(this.bubbleGain).connect(comp);
    // Ghosts: breathy, wandering formants over a low moan.
    this.ghostFilter = ctx.createBiquadFilter();
    this.ghostFilter.type = 'bandpass';
    this.ghostFilter.frequency.value = 900;
    this.ghostFilter.Q.value = 7;
    this.ghostGain = ctx.createGain();
    this.ghostGain.gain.value = 0;
    loop().connect(this.ghostFilter).connect(this.ghostGain).connect(this.master);
    for (const f of [146.8, 148.1, 220.4]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const vib = ctx.createOscillator();
      vib.frequency.value = 0.13 + Math.random() * 0.1;
      const vg = ctx.createGain();
      vg.gain.value = f * 0.04;
      vib.connect(vg).connect(o.frequency);
      const og = ctx.createGain();
      og.gain.value = 0.12;
      o.connect(og).connect(this.ghostGain);
      o.start();
      vib.start();
    }
    // Deep volcanic rumble.
    const rb = ctx.createBiquadFilter();
    rb.type = 'lowpass';
    rb.frequency.value = 75;
    rb.Q.value = 1.2;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    loop().connect(rb).connect(this.rumbleGain).connect(this.master);

    for (let i = 0; i < 7; i++) this.crickets.push({ rate: rand(0.9, 1.1), pan: rand(-1, 1), next: rand(0, 1) });
  }

  /**
   * Thunder from a strike `dist` metres away, arriving at the speed of sound:
   * a ripping crack when close, a long low rumble rolling in from afar.
   */
  thunder(dist: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + dist / 343;
    const near = Math.max(0, 1 - dist / 2500);
    const loud = Math.min(0.9, 900 / Math.max(dist, 300));
    const pan = rand(-0.7, 0.7);
    const out = this.panner(pan, this.master);
    if (near > 0) {
      this.noiseBurst(t, 0.25 + near * 0.3, 2500, 0.4, loud * near * 0.8, out, 'bandpass');
      this.noiseBurst(t + 0.05, 0.6, 600, 0.5, loud * near * 0.6, out, 'bandpass');
    }
    const len = 2.5 + Math.min(5, dist / 1500);
    const cutoff = 90 + 500 * near;
    for (let i = 0; i < 5; i++) {
      const ti = t + 0.1 + i * len * 0.17 + rand(0, 0.3);
      this.noiseBurst(ti, len * rand(0.35, 0.6), cutoff * rand(0.7, 1.3), 0.7, loud * rand(0.35, 0.7), out, 'lowpass');
    }
  }

  /** Special ambience levels 0..1: under water, haunted, erupting. */
  setFx(underwater: number, ghost: number, rumble: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const on = this.muted ? 0 : 1;
    this.muffle.frequency.setTargetAtTime(underwater > 0.5 ? 420 : 20000, t, 0.08);
    this.bubbleGain.gain.setTargetAtTime(underwater * 0.5 * on, t, 0.15);
    this.ghostGain.gain.setTargetAtTime(ghost * 0.22 * (0.6 + 0.4 * Math.sin(t * 0.7)), t, 0.4);
    this.ghostFilter.frequency.setTargetAtTime(700 + 600 * (0.5 + 0.5 * Math.sin(t * 0.9 + Math.sin(t * 0.31) * 3)), t, 0.3);
    this.rumbleGain.gain.setTargetAtTime(rumble * 1.4 * on, t, 0.5);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  private panner(pan: number, dest: AudioNode = this.ambience) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(dest);
    return p;
  }

  private noiseBurst(t: number, dur: number, f: number, q: number, gain: number, out: AudioNode, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bf = ctx.createBiquadFilter();
    bf.type = type;
    bf.frequency.value = f;
    bf.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf).connect(g).connect(out);
    s.start(t, Math.random() * 2, dur + 0.05);
    return bf;
  }

  /** A tone with pitch and gain envelopes: [time offset, value] pairs. */
  private tone(t: number, type: OscillatorType, freq: [number, number][], gain: [number, number][], out: AudioNode, filter?: { f: number; q: number }) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq[0][1], t);
    for (const [dt, f] of freq.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const [dt, v] of gain) g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), t + dt);
    let node: AudioNode = o;
    if (filter) {
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = filter.f;
      bf.Q.value = filter.q;
      o.connect(bf);
      node = bf;
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + gain[gain.length - 1][0] + 0.05);
  }

  /** The player's own species call (key V). */
  /** Truck hitting something: low body thud plus a crunch, scaled by impact speed. */
  crash(speed: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const k = Math.min(1, speed / 12);
    this.noiseBurst(t, 0.35 + k * 0.3, 140, 0.8, 0.5 * k + 0.1, this.master, 'lowpass');
    this.noiseBurst(t + 0.01, 0.18 + k * 0.25, 1800, 0.7, 0.25 * k + 0.03, this.master, 'bandpass');
    this.tone(t, 'sine', [[0, 70], [0.25, 38]], [[0.01, 0.4 * k + 0.08], [0.35, 0.0001]], this.master);
  }

  call(speciesId: string) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.02;
    const out = this.master;
    switch (CALLS[speciesId] ?? 'whistle') {
      case 'scream': {
        // Red-tail: a hoarse, descending keee-eeer.
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(3200, t);
        o.frequency.exponentialRampToValueAtTime(2900, t + 0.25);
        o.frequency.exponentialRampToValueAtTime(1700, t + 1.6);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 90;
        const lg = ctx.createGain();
        lg.gain.value = 220;
        lfo.connect(lg).connect(o.frequency);
        const bf = ctx.createBiquadFilter();
        bf.type = 'bandpass';
        bf.frequency.value = 2600;
        bf.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
        g.gain.setValueAtTime(0.22, t + 0.9);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
        o.connect(bf).connect(g).connect(out);
        this.noiseBurst(t, 1.6, 2800, 3, 0.12, out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 1.8);
        lfo.stop(t + 1.8);
        break;
      }
      case 'kak':
        for (let i = 0; i < 7; i++) {
          const ti = t + i * 0.16;
          this.tone(ti, 'sawtooth', [[0, 2300], [0.1, 1900]], [[0.01, 0.12], [0.11, 0.0001]], out, { f: 2200, q: 2 });
        }
        break;
      case 'whistle':
        this.tone(t, 'sine', [[0, 1900], [0.15, 2600], [0.5, 2100]], [[0.05, 0.16], [0.45, 0.12], [0.6, 0.0001]], out);
        this.tone(t + 0.75, 'sine', [[0, 2000], [0.2, 2500]], [[0.04, 0.12], [0.3, 0.0001]], out);
        break;
      case 'raven':
        for (let i = 0; i < 3; i++) this.croak(t + i * 0.42, 0, 0.22, out);
        break;
      case 'coo':
        // Roadrunner: slow, descending dove-like coos.
        for (let i = 0; i < 6; i++) {
          const f = 620 - i * 45;
          this.tone(t + i * 0.42, 'sine', [[0, f], [0.25, f * 0.92]], [[0.06, 0.2], [0.32, 0.0001]], out);
        }
        break;
      case 'quail':
        this.gambelQuail(t, 0, 0.2, out);
        break;
      case 'hoot':
        // Great horned owl: hoo, h'hoo, hoo, hoo.
        for (const [dt, d] of [[0, 0.35], [0.6, 0.12], [0.78, 0.3], [1.3, 0.4], [1.95, 0.4]]) {
          this.tone(t + dt, 'sine', [[0, 330], [d, 300]], [[0.05, 0.3], [d, 0.0001]], out, { f: 330, q: 1 });
        }
        break;
      case 'screech':
        // Burrowing owl: a soft coo-cooo, or a rasping alarm.
        this.tone(t, 'sine', [[0, 820], [0.12, 900]], [[0.03, 0.18], [0.15, 0.0001]], out);
        this.tone(t + 0.22, 'sine', [[0, 900], [0.35, 760]], [[0.04, 0.2], [0.4, 0.0001]], out);
        this.noiseBurst(t + 0.8, 0.5, 3200, 2.5, 0.15, out);
        break;
      case 'peent':
        // Nighthawk: a nasal peent, then the booming dive.
        this.tone(t, 'sawtooth', [[0, 2600], [0.18, 2300]], [[0.02, 0.12], [0.2, 0.0001]], out, { f: 2500, q: 3 });
        this.noiseBurst(t + 0.8, 0.7, 220, 1.2, 0.35, out, 'lowpass');
        break;
      case 'croak':
        this.tone(t, 'sawtooth', [[0, 260], [0.4, 180]], [[0.03, 0.25], [0.45, 0.0001]], out, { f: 700, q: 1.5 });
        break;
      case 'chitter':
        for (let i = 0; i < 8; i++) {
          const ti = t + i * 0.09 + (i > 3 ? 0.2 : 0);
          const f = 3400 - i * 120;
          this.tone(ti, 'sine', [[0, f], [0.06, f * 0.9]], [[0.01, 0.12], [0.07, 0.0001]], out);
        }
        break;
      case 'hiss':
        this.noiseBurst(t, 0.9, 1800, 0.7, 0.15, out);
        break;
    }
  }

  /** Common raven: a deep, hollow kraa. */
  private croak(t: number, pan: number, gain: number, out?: AudioNode) {
    const f = rand(300, 420);
    this.tone(t, 'sawtooth', [[0, f], [0.08, f * 1.08], [0.3, f * 0.8]], [[0.03, gain], [0.2, gain * 0.7], [0.34, 0.0001]], out ?? this.panner(pan), { f: 900, q: 1.6 });
  }

  /** Cactus wren: a harsh, chugging run like a car that won't start. */
  private cactusWren(t: number, pan: number, gain: number) {
    const out = this.panner(pan);
    const n = 6 + Math.floor(rand(0, 5));
    for (let i = 0; i < n; i++) this.noiseBurst(t + i * 0.085, 0.06, rand(2300, 2700), 4, gain, out);
  }

  /** Gambel's quail: the rallying chi-CA-go-go. */
  private gambelQuail(t: number, pan: number, gain: number, out?: AudioNode) {
    const o = out ?? this.panner(pan);
    this.tone(t, 'sine', [[0, 1500], [0.08, 1800]], [[0.02, gain * 0.6], [0.1, 0.0001]], o);
    this.tone(t + 0.16, 'sine', [[0, 1700], [0.12, 2300], [0.24, 1900]], [[0.03, gain], [0.26, 0.0001]], o);
    for (let i = 0; i < 2; i++) this.tone(t + 0.48 + i * 0.16, 'sine', [[0, 1800], [0.1, 1500]], [[0.02, gain * 0.7], [0.12, 0.0001]], o);
  }

  /** Mourning dove: ooo-AH, coo, coo, coo. */
  private dove(t: number, pan: number, gain: number) {
    const out = this.panner(pan);
    this.tone(t, 'sine', [[0, 470], [0.25, 560], [0.6, 440]], [[0.1, gain], [0.55, gain * 0.8], [0.7, 0.0001]], out);
    for (let i = 0; i < 3; i++) this.tone(t + 1.0 + i * 0.75, 'sine', [[0, 420], [0.5, 380]], [[0.1, gain * 0.8], [0.55, 0.0001]], out);
  }

  /** Apache cicada: a long electric buzz from the creosote in the summer heat. */
  private cicada(t: number, pan: number, gain: number) {
    const ctx = this.ctx!;
    const out = this.panner(pan);
    const dur = rand(3, 7);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = rand(4800, 5600);
    const am = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rand(180, 240);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    am.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 5200;
    bf.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.8);
    g.gain.setValueAtTime(gain, t + dur - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bf).connect(am).connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  /** Couch's spadefoot: a bleating maaa from the flooded washes after a storm. */
  private spadefoot(t: number, pan: number, gain: number) {
    const f = rand(700, 1000);
    this.tone(t, 'sawtooth', [[0, f], [0.15, f * 1.1], [0.6, f * 0.85]], [[0.05, gain], [0.5, gain * 0.7], [0.65, 0.0001]], this.panner(pan), { f: f * 1.5, q: 2 });
  }

  /** Wild burro: a wheezing hee-haw from the hills toward the river. */
  private bray(t: number, pan: number, gain: number) {
    const out = this.panner(pan);
    for (let i = 0; i < 3; i++) {
      const ti = t + i * 0.9;
      this.tone(ti, 'sawtooth', [[0, 900], [0.3, 1100]], [[0.05, gain], [0.35, 0.0001]], out, { f: 1200, q: 1.5 });
      this.tone(ti + 0.4, 'sawtooth', [[0, 180], [0.4, 150]], [[0.06, gain * 1.2], [0.45, 0.0001]], out, { f: 500, q: 1.2 });
    }
  }

  private coyote(t: number, pan: number, gain: number) {
    const out = this.panner(pan);
    // Yips building into a wavering howl.
    for (let i = 0; i < 5; i++) {
      const ti = t + i * 0.18;
      const f = rand(700, 1100);
      this.tone(ti, 'sine', [[0, f], [0.08, f * 1.4]], [[0.02, gain * 0.7], [0.1, 0.0001]], out);
    }
    this.tone(t + 1.1, 'sine', [[0, 600], [0.5, 1200], [1.6, 1050], [2.3, 700]], [[0.3, gain], [1.8, gain * 0.8], [2.4, 0.0001]], out);
  }

  update(dt: number, s: AudioState) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const k = 0.15;

    // Pickup sounds; the cab muffles the wind.
    const drv = s.active ? s.drive : 0;
    const firing = 26 + s.rpm * 230;
    for (const e of this.engineOsc) e.o.frequency.setTargetAtTime(firing * e.mul * (1 + Math.sin(t * 31) * 0.004), t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(220 + s.rpm * 900 + s.throttle * 1100, t, 0.08);
    this.engineGain.gain.setTargetAtTime(drv * (0.05 + s.throttle * 0.07 + s.rpm * 0.05), t, 0.08);
    const sp = Math.abs(s.speed) * drv;
    // Wet tarmac: tyres hiss and swish through the film of water.
    const swish = s.roadWet * (1 - s.tyre);
    this.tyreGain.gain.setTargetAtTime(Math.min(0.35, sp * 0.006 * (1 + s.tyre * 2.5 + swish * 1.8)), t, 0.15);
    this.tyreFilter.frequency.setTargetAtTime(250 + sp * 18 + s.tyre * 500 + swish * 2600, t, 0.15);
    this.squealGain.gain.setTargetAtTime(drv * Math.max(0, s.slip - 0.25) * (1 - s.tyre) * 0.5 * Math.min(1, sp / 6), t, 0.05);
    this.hornGain.gain.setTargetAtTime(s.horn && drv ? 0.07 : 0, t, 0.02);

    // Wind: louder and brighter with airspeed; quieter when perched or in the menu.
    const v = (s.active && !s.perched ? s.speed : 1.5) * (1 - drv * 0.55);
    const gale = Math.pow(s.windSpeed / 12, 2) * 0.25 * (1 - drv * 0.6);
    this.windGain.gain.setTargetAtTime(Math.min(0.9, 0.04 + Math.pow(v / 22, 2) * 0.5 + gale), t, k);
    this.windFilter.frequency.setTargetAtTime(180 + v * v * 3.2, t, k);
    const stoop = Math.max(0, (v - 28) / 30);
    this.whistleGain.gain.setTargetAtTime(stoop * 0.25, t, k);
    this.whistleFilter.frequency.setTargetAtTime(900 + v * 28, t, k);

    // Wingbeat: a soft whump on each downstroke.
    const sn = Math.sin(s.flapPhase);
    if (s.active && s.flapAmount > 0.25 && this.lastSin > 0 && sn <= 0) {
      this.noiseBurst(t, 0.16, rand(380, 620), 0.9, 0.18 * s.flapAmount, this.master, 'bandpass');
    }
    this.lastSin = sn;

    // Rain: hiss and patter outside, a muffled drumming on the roof in the cab.
    const r = s.active ? s.rain : s.rain * 0.4;
    const ground = Math.max(0.35, Math.min(1, 1.2 - s.agl / 300));
    this.rainHiss.gain.setTargetAtTime(r * 0.16 * ground * (1 - drv * 0.7), t, 0.4);
    this.rainHissFilter.frequency.setTargetAtTime(drv ? 1800 : 4200, t, 0.2);
    this.rainPatter.gain.setTargetAtTime(r * 0.12 * ground * (1 - drv * 0.5), t, 0.4);
    this.roofDrum.gain.setTargetAtTime(r * drv * 0.45, t, 0.3);
    // Individual fat drops ticking on the glass and roof.
    this.dripT -= dt * r * (drv ? 22 : 9);
    while (this.dripT < 0) {
      this.dripT += rand(0.3, 1.7);
      const ti = t + rand(0, 0.08);
      this.noiseBurst(ti, 0.03, drv ? rand(1500, 3200) : rand(2500, 6000), 3, (drv ? 0.06 : 0.025) * rand(0.4, 1), this.panner(rand(-0.8, 0.8), this.master));
    }

    // Ground ambience fades with height above ground; fresh snow hushes it.
    const near = Math.max(0, Math.min(1, 1.15 - s.agl / 260));
    this.ambience.gain.setTargetAtTime((near * 0.9 + 0.1) * (1 - 0.55 * s.snow), t, 0.5);
    const raining = s.rain > 0.15;

    // Road noise from the nearest vehicle.
    const road = s.car < 300 ? Math.min(0.35, (40 / Math.max(s.car, 8)) * (s.carSpeed / 25)) : 0;
    this.roadGain.gain.setTargetAtTime(road, t, 0.3);
    this.roadFilter.frequency.setTargetAtTime(400 + s.carSpeed * 25, t, 0.3);

    const T = this.timers;
    for (const key of Object.keys(T) as (keyof typeof T)[]) T[key] -= dt;
    const m = s.month;
    const day = s.night < 0.3;
    const breeding = m >= 3 && m <= 7;

    const summer = m >= 6 && m <= 8;
    // Cactus wrens and quail chatter from the scrub all year, most in spring.
    if (day && !raining && s.scrub > 0.3 && T.wren <= 0) {
      this.cactusWren(t, rand(-0.8, 0.8), 0.035 * s.scrub * near);
      T.wren = rand(breeding ? 5 : 10, breeding ? 14 : 30);
    }
    if (day && !raining && s.scrub + s.town > 0.3 && T.quail <= 0) {
      this.gambelQuail(t, rand(-0.9, 0.9), 0.04 * near);
      T.quail = rand(8, 24);
    }
    if (day && !raining && s.town + s.wet > 0.2 && T.dove <= 0) {
      this.dove(t, rand(-0.9, 0.9), 0.05 * near);
      T.dove = rand(10, 26);
    }
    // Cicadas buzz through the hottest summer days.
    if (summer && day && s.hour > 10 && s.hour < 18 && !raining && s.scrub > 0.2 && T.cicada <= 0) {
      this.cicada(t, rand(-1, 1), 0.012 * near);
      T.cicada = rand(2, 6);
    }
    // Spadefoot toads: warm nights in the monsoon, once the washes run.
    const flood = Math.max(s.rain, s.roadWet);
    if ((s.night > 0.5 || s.rain > 0.3) && m >= 7 && m <= 9 && flood > 0.3 && T.toad <= 0) {
      const n = 1 + Math.floor(flood * 4);
      for (let i = 0; i < n; i++) this.spadefoot(t + rand(0, 0.9), rand(-1, 1), 0.035 * near * rand(0.4, 1));
      T.toad = rand(0.5, 1.6);
    }
    // Desert crickets on warm nights; Dolbear's law sets the chirp rate.
    if (s.night > 0.4 && m >= 4 && m <= 10 && !raining && s.snow < 0.1) {
      const tempC = [8, 10, 14, 18, 23, 29, 32, 31, 27, 20, 12, 8][m - 1];
      const perMin = Math.max(20, 7 * tempC + 30) * 0.5;
      for (const c of this.crickets) {
        c.next -= dt;
        if (c.next <= 0) {
          const out = this.panner(c.pan);
          for (let i = 0; i < 3; i++) this.tone(t + i * 0.045, 'sine', [[0, 4600], [0.03, 4500]], [[0.005, 0.02 * near], [0.03, 0.0001]], out);
          c.next = (60 / perMin) * c.rate;
        }
      }
    }
    if (s.ravens < 900 && T.raven <= 0) {
      const g = Math.min(0.12, 25 / Math.max(s.ravens, 25));
      this.croak(t, rand(-1, 1), g);
      T.raven = rand(1.5, 6);
    }
    if (s.burro < 400 && T.bray <= 0) {
      this.bray(t, rand(-0.7, 0.7), Math.min(0.1, 10 / Math.max(s.burro, 20)));
      T.bray = rand(15, 50);
    }
    if (s.night > 0.6 && T.coyote <= 0) {
      if (Math.random() < 0.5) this.coyote(t, rand(-1, 1), 0.035);
      T.coyote = rand(40, 120);
    }
  }
}
