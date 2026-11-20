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
   * Warm acoustic major-9th chord on match victory.
   */
  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
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
