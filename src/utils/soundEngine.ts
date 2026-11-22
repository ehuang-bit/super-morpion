import type { Player } from '@shared/gameEngine';
import type { BoardTension } from './boardTension';

type EmoteMood = 'joyful' | 'surprised' | 'pressure' | 'neutral';

const JOYFUL_EMOTE_PATTERN =
  /👏|🎉|😄|😊|😁|🥳|👍|🤝|✨|💚|❤️|🙌|😎|🏆|👋|\b(gg|bravo|bien|nice|joy|happy|clap|cheers|merci|smile|salut|hello|wave)\b/i;

const SURPRISED_EMOTE_PATTERN =
  /😮|😲|🤯|😱|👀|❗|⁉️|🫣|😳|😵|\b(wow|oups|oops|mindblown|surpris|whoa|what|quoi|shock|gasp|hein)\b/i;

const PRESSURE_EMOTE_PATTERN =
  /🔥|⚡|😤|😬|😅|💦|⏳|⏰|🤔|😈|💪|🎯|💀|\b(fire|feu|press|tens|sweat|chaud|vite|hurry|think|hmm|clock|focus|danger|hot|ouch|aie)\b/i;

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

  private classifyEmote(emote: string): EmoteMood {
    const raw = emote.trim();
    if (!raw) return 'neutral';
    if (SURPRISED_EMOTE_PATTERN.test(raw)) return 'surprised';
    if (PRESSURE_EMOTE_PATTERN.test(raw)) return 'pressure';
    if (JOYFUL_EMOTE_PATTERN.test(raw)) return 'joyful';
    return 'neutral';
  }

  /**
   * Pose d'une pièce : clic sec et cristallin (pierre / porcelaine sur plateau),
   * plus aigu et acoustique, sans glissement synthétique descendant.
   * Une micro-variation naturelle (±1,5 %) évite toute répétition mécanique.
   */
  public playMove(player: Player, tension: BoardTension = 'calm'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const isMatchPoint = tension === 'match-point';
    const jitter = 0.985 + Math.random() * 0.03;

    // 1. Impact de contact très bref et aigu (14 ms — clic tactile sur plateau)
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseClickFreq = (player === 'X' ? 3100 : 3700) * jitter;
    filter.frequency.setValueAtTime(
      isMatchPoint ? baseClickFreq * 1.12 : baseClickFreq,
      now,
    );
    filter.Q.setValueAtTime(isMatchPoint ? 3.2 : 2.8, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(isMatchPoint ? 0.088 : 0.072, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.02);

    // 2. Résonance modale principale aiguë à fréquence fixe (pierre / céramique)
    const primaryFreq = (player === 'X' ? 987.77 : 1174.66) * jitter;
    const mainOsc = ctx.createOscillator();
    mainOsc.type = 'sine';
    mainOsc.frequency.setValueAtTime(primaryFreq, now);

    const mainGain = ctx.createGain();
    mainGain.gain.setValueAtTime(0.001, now);
    mainGain.gain.linearRampToValueAtTime(isMatchPoint ? 0.095 : 0.082, now + 0.0018);
    mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    mainOsc.connect(mainGain);
    mainGain.connect(ctx.destination);
    mainOsc.start(now);
    mainOsc.stop(now + 0.044);

    // 3. Partiel supérieur céramique (~2.42× fondamentale, extinction ultra-courte)
    const overtoneOsc = ctx.createOscillator();
    overtoneOsc.type = 'sine';
    overtoneOsc.frequency.setValueAtTime(primaryFreq * 2.42, now);

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0.001, now);
    overtoneGain.gain.linearRampToValueAtTime(isMatchPoint ? 0.036 : 0.028, now + 0.0012);
    overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(ctx.destination);
    overtoneOsc.start(now);
    overtoneOsc.stop(now + 0.022);

    // 4. Très léger corps de table boisée pour ancrer le clic sans l'alourdir
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime((player === 'X' ? 587.33 : 659.25) * jitter, now);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.001, now);
    bodyGain.gain.linearRampToValueAtTime(0.024, now + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.028);

    // 5. Tension élevée : fine brillance à l'octave supérieure (sans bourdonnement grave)
    if (tension === 'heated' || isMatchPoint) {
      this.tone(ctx, {
        freq: primaryFreq * 2,
        start: now + 0.003,
        duration: isMatchPoint ? 0.075 : 0.055,
        peak: isMatchPoint ? 0.024 : 0.016,
        type: 'sine',
      });
    }
  }

  /**
   * Cadence douce à deux notes lors de la capture d'une zone.
   * Sur balle de match (`matchPoint`), une troisième note grave souligne
   * qu'une seule zone sépare désormais le joueur de la victoire.
   */
  public playCapture(player: Player, matchPoint = false): void {
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

    if (matchPoint) {
      const lowFreq = player === 'X' ? 164.81 : 146.83;
      this.tone(ctx, {
        freq: lowFreq,
        start: now + 0.12,
        duration: 0.44,
        peak: 0.075,
        type: 'triangle',
      });
      this.tone(ctx, {
        freq: lowFreq,
        start: now + 0.125,
        duration: 0.52,
        peak: 0.055,
        type: 'sine',
      });
    }
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

  /** Souffle filtré (bruit) qui monte ou descend : encre, air, choc. */
  private sweep(
    ctx: AudioContext,
    options: {
      start: number;
      duration: number;
      from: number;
      to: number;
      peak: number;
      filterType?: BiquadFilterType;
      q?: number;
    },
  ): void {
    const {
      start,
      duration,
      from,
      to,
      peak,
      filterType = 'lowpass',
      q,
    } = options;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    if (q !== undefined) {
      filter.Q.setValueAtTime(q, start);
    }

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

  /** Coup libre : souffle d'air filtré suivi d'un petit arpège montant, léger. */
  public playFreeMove(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    this.sweep(ctx, {
      start: now + 0.04,
      duration: 0.24,
      from: 680,
      to: 2100,
      peak: 0.032,
      filterType: 'bandpass',
      q: 2.4,
    });

    [523.25, 659.25, 783.99].forEach((freq, index) => {
      this.tone(ctx, { freq, start: now + 0.1 + index * 0.07, duration: 0.2, peak: 0.06 });
    });
  }

  /**
   * Emote de match : petit « pop » de tampon d'encre chaleureux et discret,
   * modulé selon l'humeur de l'emote (joyeux, surpris, pression, neutre).
   */
  public playEmote(emote: string): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const mood = this.classifyEmote(emote);

    // Grain discret de tampon sur papier
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(
      mood === 'pressure' ? 880 : mood === 'surprised' ? 1320 : 1120,
      now,
    );
    filter.Q.setValueAtTime(2.6, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.028, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);

    if (mood === 'joyful') {
      this.tone(ctx, {
        freq: 260,
        glideTo: 440,
        start: now,
        duration: 0.068,
        peak: 0.058,
        type: 'sine',
      });
      this.tone(ctx, {
        freq: 659.25,
        start: now + 0.032,
        duration: 0.095,
        peak: 0.026,
        type: 'sine',
      });
      return;
    }

    if (mood === 'surprised') {
      this.tone(ctx, {
        freq: 300,
        glideTo: 640,
        start: now,
        duration: 0.074,
        peak: 0.056,
        type: 'sine',
      });
      this.tone(ctx, {
        freq: 740,
        start: now + 0.045,
        duration: 0.072,
        peak: 0.026,
        type: 'sine',
      });
      return;
    }

    if (mood === 'pressure') {
      this.tone(ctx, {
        freq: 220,
        glideTo: 148,
        start: now,
        duration: 0.075,
        peak: 0.06,
        type: 'triangle',
      });
      this.tone(ctx, {
        freq: 130.81,
        start: now + 0.015,
        duration: 0.11,
        peak: 0.036,
        type: 'sine',
      });
      return;
    }

    // Tampon d'encre neutre et chaleureux
    this.tone(ctx, {
      freq: 250,
      glideTo: 375,
      start: now,
      duration: 0.065,
      peak: 0.055,
      type: 'sine',
    });
  }

  /**
   * Relais 2v2 : double-toc boisé discret et clair qui signale que le tour
   * revient enfin au joueur.
   */
  public playTurnRelay(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const knocks = [
      { offset: 0, freq: 440, glideTo: 415, filterFreq: 1450, noisePeak: 0.045, bodyPeak: 0.068, ringPeak: 0.035, ringDuration: 0.095 },
      { offset: 0.095, freq: 587.33, glideTo: 560, filterFreq: 1720, noisePeak: 0.052, bodyPeak: 0.075, ringPeak: 0.042, ringDuration: 0.13 },
    ];

    knocks.forEach((knock) => {
      const start = now + knock.offset;

      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(knock.filterFreq, start);
      filter.Q.setValueAtTime(3.0, start);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(knock.noisePeak, start);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, start + 0.025);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(start);

      this.tone(ctx, {
        freq: knock.freq,
        glideTo: knock.glideTo,
        start,
        duration: 0.06,
        peak: knock.bodyPeak,
        type: 'triangle',
      });
      this.tone(ctx, {
        freq: knock.freq,
        start: start + 0.003,
        duration: knock.ringDuration,
        peak: knock.ringPeak,
        type: 'sine',
      });
    });
  }

  /** Défi du jour résolu : arpège d'atelier lumineux à 4 notes. */
  public playDailySolved(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [587.33, 739.99, 880.0, 1174.66];

    notes.forEach((freq, index) => {
      const start = now + index * 0.085;
      const isLast = index === notes.length - 1;
      this.tone(ctx, {
        freq,
        start,
        duration: isLast ? 0.56 : 0.28,
        peak: isLast ? 0.068 : 0.056,
        type: 'triangle',
      });
      this.tone(ctx, {
        freq: freq * 2,
        start: start + 0.008,
        duration: isLast ? 0.48 : 0.2,
        peak: 0.016,
        type: 'sine',
      });
    });

    // Assise grave lumineuse sur la dernière note
    this.tone(ctx, {
      freq: 293.66,
      start: now + 0.255,
      duration: 0.6,
      peak: 0.045,
      type: 'sine',
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

  /** Petit accord doux au changement de palette du plateau. */
  public playThemeSwitch(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, { freq: 523.25, start: now, duration: 0.14, peak: 0.032 });
    this.tone(ctx, { freq: 783.99, start: now + 0.045, duration: 0.2, peak: 0.03 });
  }
}

export const soundEngine = new SoundEngine();
