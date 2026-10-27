// Procedural Web Audio API Synthesizer for ORBITAL // TYPE (Nothing OS Glyph & Cosmic SFX)

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem('orbital_muted');
      if (saved === 'true') this.muted = true;
    } catch {
      // Ignore storage errors
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('orbital_muted', String(this.muted));
    } catch {
      // Ignore
    }
    if (!this.muted) {
      this.playUiClick();
    }
    return this.muted;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
    try {
      localStorage.setItem('orbital_muted', String(this.muted));
    } catch {
      // Ignore
    }
  }

  // Light event: Laser shot per correct keystroke with pitch variation (±8%) and combo pitch climb
  public playLaserHit(combo: number = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const jitter = 0.94 + Math.random() * 0.12;
    const baseFreq = Math.min(920, 480 + combo * 16) * jitter;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.35, now + 0.065);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Heavy event: Asteroid word destroyed (multi-layered explosion + Nothing OS glyph chime)
  public playWordDestroy(isArmored: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Sub-bass punch
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(isArmored ? 140 : 180, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.24);

    subGain.gain.setValueAtTime(0.26, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.26);

    // Nothing OS signature crystalline glyph arpeggio
    const notes = isArmored ? [587.33, 880, 1174.66] : [659.25, 987.77];
    notes.forEach((freq, idx) => {
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      const t = now + idx * 0.038;
      chime.type = 'sine';
      chime.frequency.setValueAtTime(freq, t);
      chimeGain.gain.setValueAtTime(0.11, t);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(t);
      chime.stop(t + 0.15);
    });
  }

  // Mistype buzz feedback
  public playMistype(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.setValueAtTime(118, now + 0.045);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Player hull breach / damage taken
  public playHullDamage(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.32);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Nothing OS Glyph Notification Ring
  public playGlyphNotification(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const pattern = [
      { freq: 1046.5, delay: 0, dur: 0.07 },
      { freq: 1318.5, delay: 0.08, dur: 0.07 },
      { freq: 1567.98, delay: 0.16, dur: 0.09 },
      { freq: 2093.0, delay: 0.28, dur: 0.18 },
    ];

    pattern.forEach((step) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + step.delay;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(step.freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + step.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + step.dur + 0.01);
    });
  }

  // Subtle UI click
  public playUiClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.025);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  // Wave clear / Game Over sting
  public playGameEnd(victory: boolean): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const seq = victory
      ? [523.25, 659.25, 783.99, 1046.5]
      : [392.0, 349.23, 311.13, 261.63];

    seq.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * 0.09;
      osc.type = victory ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  // Speak English vocabulary word using Web Speech API
  public speakWord(word: string): void {
    if (this.muted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(word);
      utter.lang = 'en-GB';
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors in headless environments
    }
  }
}

export const soundEngine = new SoundEngine();
