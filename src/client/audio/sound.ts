export class RitualAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private muted = false;
  private volume = 0.35;

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.syncGain();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.syncGain();
  }

  pulse(kind: 'action' | 'reveal' | 'warning' | 'nav'): void {
    if (this.muted) return;
    const context = this.ensureContext();
    const gain = this.ensureGain(context);
    const oscillator = context.createOscillator();
    const note = kind === 'warning' ? 110 : kind === 'reveal' ? 220 : kind === 'nav' ? 174 : 146;
    oscillator.type = kind === 'warning' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(note, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(note * 1.5, context.currentTime + 0.12);
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  }

  private ensureContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  private ensureGain(context: AudioContext): GainNode {
    if (!this.gain) {
      this.gain = context.createGain();
      this.gain.connect(context.destination);
      this.syncGain();
    }
    return this.gain;
  }

  private syncGain(): void {
    if (this.gain) this.gain.gain.value = this.muted ? 0 : this.volume;
  }
}

export const ritualAudio = new RitualAudio();
