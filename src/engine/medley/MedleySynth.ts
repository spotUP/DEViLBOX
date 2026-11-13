/**
 * MedleySynth.ts - the keyboard voice of a Medley (.mso) instrument.
 *
 * Medley songs play on nuade's medley player. A key starts the instrument on a second medley player
 * the nuade worklet holds on the song's module with every voice parked (nuade-wasm patch 0002,
 * nw_key_*): the replayer's own instrument command, note start, pitch pick, envelope and modulators
 * run, with no track stepping. One key at a time (voice 0).
 *
 * The key is mixed into NuadeEngine's own output, so this synth's output stays unconnected to it:
 * routing the engine output here as well would play the song twice.
 */
import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToMidi } from '@/utils/audio-context';
import { useFormatStore } from '@/stores/useFormatStore';
import { NuadeEngine } from '@/engine/nuade/NuadeEngine';
import { keyboardModuleOnNuade } from '@/engine/nuade/nuadeKeyboard';
import { medleyTables, medleySoundingForGridNote } from '@/lib/import/formats/medleyGrid';

/** DEViLBOX grid note of a MIDI key: grid note 13 (C-1, period 856) is MIDI 24. */
const GRID_NOTE_OF_MIDI_0 = -11;

export class MedleySynth implements DevilboxSynth {
  readonly name = 'MedleySynth';
  readonly output: GainNode;

  private _disposed = false;
  private _instrument = 1;

  constructor() {
    this.output = getDevilboxAudioContext().createGain();
  }

  /** The instrument's number in the song's instrument table (the stream's Instrument command value). */
  setInstrumentNumber(n: number): void { this._instrument = n; }

  async ensureInitialized(): Promise<void> { await this.loadKeyModule(); }

  async setInstrument(_config?: unknown): Promise<void> { await this.loadKeyModule(); }

  private async loadKeyModule(): Promise<ArrayBuffer | null> {
    const module = keyboardModuleOnNuade();
    const f = useFormatStore.getState();
    if (!module || f.nuadePlayerId !== 'medley') return null;
    await NuadeEngine.getInstance().keyLoad(module, 'medley', f.nuadeFileName || 'song.mso');
    return module;
  }

  /**
   * Counts key presses. The key module loads asynchronously, so a release can arrive before its attack has posted
   * keyOn; the attack then checks the count and stays silent instead of starting a note nothing will release.
   */
  private _press = 0;
  private _released = true;
  private _releaseTimer: ReturnType<typeof setTimeout> | null = null;

  /** Milliseconds from now until audio-clock time `time` (0 when absent or past). */
  private delayMs(time?: number): number {
    if (time === undefined) return 0;
    return Math.max(0, (time - getDevilboxAudioContext().currentTime) * 1000);
  }

  private clearReleaseTimer(): void {
    if (this._releaseTimer !== null) clearTimeout(this._releaseTimer);
    this._releaseTimer = null;
  }

  triggerAttack(note?: string | number, _time?: number, _velocity?: number): void {
    if (this._disposed) return;
    this.clearReleaseTimer();
    const press = ++this._press;
    this._released = false;
    const midi = typeof note === 'string' ? noteToMidi(note) : (note ?? 48);
    void this.loadKeyModule().then((module) => {
      if (!module || this._disposed || press !== this._press || this._released) return;
      const buf = new Uint8Array(module);
      const tables = medleyTables(buf);
      if (!tables) return;
      const sounding = medleySoundingForGridNote(buf, tables, this._instrument, midi + GRID_NOTE_OF_MIDI_0);
      if (sounding !== null) NuadeEngine.getInstance().keyOn(this._instrument, sounding);
    });
  }

  /** Releases at audio-clock `time` when given (triggerAttackRelease, MCP trigger_note duration), else now. */
  triggerRelease(_note?: string | number, time?: number): void {
    if (this._disposed) return;
    this.clearReleaseTimer();
    const press = this._press;
    const release = (): void => {
      this._releaseTimer = null;
      if (this._disposed || press !== this._press) return;
      this._released = true;
      NuadeEngine.getInstance().keyOff();
    };
    const ms = this.delayMs(time);
    if (ms > 0) this._releaseTimer = setTimeout(release, ms);
    else release();
  }

  releaseAll(): void { this.triggerRelease(); }

  set(param: string, value: number): void {
    if (param === 'volume') this.output.gain.value = Math.max(0, Math.min(1, value));
  }

  get(param: string): number | undefined {
    return param === 'volume' ? this.output.gain.value : undefined;
  }

  dispose(): void {
    this.clearReleaseTimer();
    if (!this._disposed) NuadeEngine.getInstance().keyOff();
    this._disposed = true;
  }
}
