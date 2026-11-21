import type { Player } from '@shared/gameEngine';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') {
      return null;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.25));
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Matte wood/ceramic piece placement tap.
   */
  public playMove(player: Player): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tactile transient
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(player === 'X' ? 920 : 1180, now);
    filter.Q.setValueAtTime(2.2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    // Warm ceramic/wood body tone
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const startFreq = player === 'X' ? 285 : 345;
    const endFreq = player === 'X' ? 158 : 196;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.055);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.001, now);
    toneGain.gain.linearRampToValueAtTime(0.11, now + 0.004);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.068);

    osc.connect(toneGain);
    toneGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  /**
   * Soft resonant two-note cadence when a sub-board is captured.
   */
  public playCapture(player: Player): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = player === 'X' ? [329.63, 493.88] : [293.66, 440.0];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.085, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  /**
   * Warm acoustic major-9th chord on match victory, lancé par une fanfare
   * montante et prolongé par un scintillement aigu.
   */
  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const fanfareStart = ctx.currentTime;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
      this.tone(ctx, {
        freq,
        start: fanfareStart + index * 0.085,
        duration: 0.26,
        peak: 0.07,
        type: 'triangle',
      });
    });
    [1567.98, 2093, 2637.02].forEach((freq, index) => {
      this.tone(ctx, {
        freq,
        start: fanfareStart + 0.62 + index * 0.11,
        duration: 0.7,
        peak: 0.028,
      });
    });

    const now = fanfareStart + 0.44;
    const chord = [261.63, 329.63, 392.0, 587.33];

    chord.forEach((freq, idx) => {
      const start = now + idx * 0.065;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.075, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.56);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }

  /**
   * Compte à rebours des dernières secondes du coup : un battement sec, de
   * plus en plus aigu, doublé sur la dernière seconde.
   */
  public playCountdownTick(secondsLeft: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freq = 620 + Math.max(0, 5 - secondsLeft) * 85;
    const hits = secondsLeft <= 1 ? [0, 0.11] : [0];

    hits.forEach((offset) => {
      const start = now + offset;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, start + 0.09);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  /** Note simple avec attaque et extinction douces. */
  private tone(
    ctx: AudioContext,
    options: {
      freq: number;
      start: number;
      duration: number;
      peak: number;
      type?: OscillatorType;
      glideTo?: number;
    },
  ): void {
    const { freq, start, duration, peak, type = 'sine', glideTo } = options;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) {
      osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.02, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /** Souffle filtré (bruit) qui monte ou descend : encre, choc. */
  private sweep(
    ctx: AudioContext,
    options: { start: number; duration: number; from: number; to: number; peak: number },
  ): void {
    const { start, duration, from, to, peak } = options;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(peak, start + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  /** Écran « VS » : deux coups sourds, puis le choc et un accord tendu. */
  public playVersus(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    this.tone(ctx, { freq: 98, start: now, duration: 0.3, peak: 0.16, type: 'triangle', glideTo: 70 });
    this.tone(ctx, { freq: 110, start: now + 0.2, duration: 0.3, peak: 0.16, type: 'triangle', glideTo: 78 });
    this.sweep(ctx, { start: now + 0.44, duration: 0.32, from: 2600, to: 320, peak: 0.07 });
    [146.83, 220, 293.66, 440].forEach((freq, index) => {
      this.tone(ctx, {
        freq,
        start: now + 0.46 + index * 0.012,
        duration: 0.9,
        peak: 0.055,
        type: index < 2 ? 'triangle' : 'sine',
      });
    });
  }

  /** Coup libre : petit arpège montant, léger. */
  public playFreeMove(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, index) => {
      this.tone(ctx, { freq, start: now + 0.1 + index * 0.07, duration: 0.2, peak: 0.06 });
    });
  }

  /** Coup joué d'office après dépassement : deux notes mates qui retombent. */
  public playAutoMove(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, { freq: 329.63, start: now, duration: 0.2, peak: 0.09, type: 'triangle' });
    this.tone(ctx, { freq: 233.08, start: now + 0.16, duration: 0.32, peak: 0.09, type: 'triangle' });
  }

  /** Encre qui envahit l'écran. */
  public playInkFlood(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.sweep(ctx, { start: ctx.currentTime, duration: 0.85, from: 180, to: 2800, peak: 0.06 });
  }

  /** Défaite : descente lente en mineur sur une basse. */
  public playDefeat(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [392, 349.23, 311.13, 261.63].forEach((freq, index) => {
      this.tone(ctx, {
        freq,
        start: now + index * 0.17,
        duration: 0.5,
        peak: 0.06,
        type: 'triangle',
      });
    });
    this.tone(ctx, { freq: 98, start: now + 0.5, duration: 1, peak: 0.07 });
  }

  /** Promotion de rang : montée brillante couronnée d'une cloche. */
  public playPromotion(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, index) => {
      this.tone(ctx, { freq, start: now + index * 0.075, duration: 0.3, peak: 0.065 });
    });
    this.tone(ctx, { freq: 1567.98, start: now + 0.42, duration: 1.3, peak: 0.06 });
    this.tone(ctx, { freq: 783.99, start: now + 0.42, duration: 1.1, peak: 0.045, type: 'triangle' });
  }

  /**
   * Calm neutral interval on global draw.
   */
  public playDraw(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [329.63, 293.66];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }
}

export const soundEngine = new SoundEngine();
