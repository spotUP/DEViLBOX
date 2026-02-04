/**
 * RdPianoSynth - Roland SA-synthesis Digital Piano
 *
 * Cycle-accurate emulation of MKS-20 and MK-80 digital pianos via WebAssembly.
 * Based on librdpiano by Giulio Zausa.
 *
 * Features:
 * - 16 patches (8 MKS-20 + 8 MK-80)
 * - Space-D BBD chorus, Phaser
 * - Tremolo, midEQ
 * - Runtime ROM loading from public/rdpiano/roms/
 */

import * as Tone from 'tone';
import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';

// Parameter IDs (must match C++ enum)
const PARAM = {
  CHORUS_ENABLED: 0,
  CHORUS_RATE: 1,
  CHORUS_DEPTH: 2,
  EFX_ENABLED: 3,
  PHASER_RATE: 4,
  PHASER_DEPTH: 5,
  TREMOLO_ENABLED: 6,
  TREMOLO_RATE: 7,
  TREMOLO_DEPTH: 8,
  VOLUME: 9,
} as const;

// ROM set definitions
const ROM_SETS = [
  { // MKS-20 A
    ic5: 'mks20_15179738.BIN',
    ic6: 'mks20_15179737.BIN',
    ic7: 'mks20_15179736.BIN',
    ic18: 'mks20_15179757.BIN',
  },
  { // MKS-20 B
    ic5: 'mks20_15179741.BIN',
    ic6: 'mks20_15179740.BIN',
    ic7: 'mks20_15179739.BIN',
    ic18: 'mks20_15179757.BIN',
  },
  { // MK-80
    ic5: 'MK80_IC5.bin',
    ic6: 'MK80_IC6.bin',
    ic7: 'MK80_IC7.bin',
    ic18: 'MK80_IC18.bin',
  },
];

const PROGRAM_ROM = 'RD200_B.bin';

// Patch definitions (must match C++ PATCHES array)
export const RDPIANO_PATCHES = [
  { name: 'MKS-20: Piano 1',     romSet: 0 },
  { name: 'MKS-20: Piano 2',     romSet: 0 },
  { name: 'MKS-20: Piano 3',     romSet: 0 },
  { name: 'MKS-20: Harpsichord', romSet: 1 },
  { name: 'MKS-20: Clavi',       romSet: 1 },
  { name: 'MKS-20: Vibraphone',  romSet: 1 },
  { name: 'MKS-20: E-Piano 1',   romSet: 1 },
  { name: 'MKS-20: E-Piano 2',   romSet: 1 },
  { name: 'MK-80: Classic',      romSet: 2 },
  { name: 'MK-80: Special',      romSet: 2 },
  { name: 'MK-80: Blend',        romSet: 2 },
  { name: 'MK-80: Contemporary', romSet: 2 },
  { name: 'MK-80: A. Piano 1',   romSet: 2 },
  { name: 'MK-80: A. Piano 2',   romSet: 2 },
  { name: 'MK-80: Clavi',        romSet: 2 },
  { name: 'MK-80: Vibraphone',   romSet: 2 },
] as const;

export interface RdPianoConfig {
  patch?: number;
  chorusEnabled?: boolean;
  chorusRate?: number;
  chorusDepth?: number;
  efxEnabled?: boolean;
  phaserRate?: number;
  phaserDepth?: number;
  tremoloEnabled?: boolean;
  tremoloRate?: number;
  tremoloDepth?: number;
  volume?: number;
}

export class RdPianoSynth extends Tone.ToneAudioNode {
  readonly name = 'RdPianoSynth';
  readonly input: undefined = undefined;
  readonly output: Tone.Gain;

  private _worklet: AudioWorkletNode | null = null;
  private config: RdPianoConfig;
  private isInitialized = false;
  private pendingNotes: Array<{ note: number; velocity: number }> = [];
  private loadedRomSets = new Set<number>();
  private currentPatch = 0;
  private romLoadError = false;

  // Static caches shared across instances
  private static romCache = new Map<string, ArrayBuffer>();
  private static isWorkletLoaded = false;
  private static workletLoadPromise: Promise<void> | null = null;
  private static wasmBinary: ArrayBuffer | null = null;
  private static jsCode: string | null = null;

  constructor(config: Partial<RdPianoConfig> = {}) {
    super();
    this.output = new Tone.Gain(1);
    this.config = {
      patch: 0,
      chorusEnabled: true,
      chorusRate: 5,
      chorusDepth: 14,
      efxEnabled: false,
      phaserRate: 0.4,
      phaserDepth: 0.8,
      tremoloEnabled: false,
      tremoloRate: 6,
      tremoloDepth: 6,
      volume: 1.0,
      ...config,
    };
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const toneContext = this.context as unknown as { rawContext?: AudioContext; _context?: AudioContext };
      const rawContext = toneContext.rawContext || toneContext._context;
      if (!rawContext) {
        console.error('[RdPiano] Cannot get raw AudioContext');
        return;
      }
      const baseUrl = import.meta.env.BASE_URL || '/';

      // Load worklet module (once per session)
      if (!RdPianoSynth.isWorkletLoaded) {
        if (!RdPianoSynth.workletLoadPromise) {
          RdPianoSynth.workletLoadPromise = rawContext.audioWorklet.addModule(
            `${baseUrl}rdpiano/RdPiano.worklet.js`
          );
        }
        await RdPianoSynth.workletLoadPromise;
        RdPianoSynth.isWorkletLoaded = true;
      }

      // Fetch WASM binary and JS glue (cached)
      if (!RdPianoSynth.wasmBinary || !RdPianoSynth.jsCode) {
        const [wasmResponse, jsResponse] = await Promise.all([
          fetch(`${baseUrl}rdpiano/RdPiano.wasm`),
          fetch(`${baseUrl}rdpiano/RdPiano.js`),
        ]);
        if (!wasmResponse.ok || !jsResponse.ok) {
          throw new Error('Failed to fetch RdPiano WASM files');
        }
        const [wasmBinary, jsCodeRaw] = await Promise.all([
          wasmResponse.arrayBuffer(),
          jsResponse.text(),
        ]);
        // Preprocess JS code for AudioWorklet new Function() compatibility:
        // 1. Replace import.meta.url (not available in Function constructor scope)
        // 2. Remove ES module export statement (invalid syntax in Function body)
        // 3. Strip Node.js-specific dynamic import block (fails in worklet context)
        RdPianoSynth.jsCode = jsCodeRaw
          .replace(/import\.meta\.url/g, `"${baseUrl}rdpiano/"`)
          .replace(/export\s+default\s+\w+;?\s*$/, '')
          .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
          .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');
        RdPianoSynth.wasmBinary = wasmBinary;
      }

      // Create AudioWorklet node
      this._worklet = toneCreateAudioWorkletNode(rawContext, 'rdpiano-processor');

      // Set up message handler
      this._worklet.port.onmessage = (event: MessageEvent) => {
        const { type } = event.data;
        if (type === 'wasmReady') {
          // WASM loaded, now load ROMs
          void this.loadROMs();
        } else if (type === 'ready') {
          // MCU initialized, synth is ready to play
          this.isInitialized = true;
          this.applyConfig();
          // Select configured patch
          if (this.config.patch != null && this.config.patch !== 0) {
            void this.selectPatch(this.config.patch);
          }
          // Replay pending notes
          for (const { note, velocity } of this.pendingNotes) {
            this._worklet?.port.postMessage({ type: 'noteOn', note, velocity });
          }
          this.pendingNotes = [];
          console.log('[RdPiano] Synth ready');
        } else if (type === 'error') {
          console.error('[RdPiano] Error:', event.data.error);
        }
      };

      // Send WASM init
      this._worklet.port.postMessage({
        type: 'init',
        wasmBinary: RdPianoSynth.wasmBinary,
        jsCode: RdPianoSynth.jsCode,
      });

      // Connect to output
      const targetNode = this.output.input as AudioNode;
      this._worklet.connect(targetNode);

    } catch (error) {
      console.error('[RdPiano] Initialization error:', error);
    }
  }

  private async loadROMs(): Promise<void> {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const romsUrl = `${baseUrl}rdpiano/roms/`;

      // Load program ROM
      const progRom = await this.fetchROM(romsUrl + PROGRAM_ROM);
      if (!progRom) {
        this.romLoadError = true;
        console.error('[RdPiano] Failed to load program ROM. Place ROM files in public/rdpiano/roms/');
        return;
      }
      this._worklet?.port.postMessage({
        type: 'loadProgramROM',
        romData: progRom,
      });

      // Load ROM set for initial patch
      const initialPatch = this.config.patch || 0;
      const romSetIdx = RDPIANO_PATCHES[initialPatch].romSet;
      await this.loadROMSet(romSetIdx);

      // Send initMCU
      this._worklet?.port.postMessage({ type: 'initMCU' });

    } catch (error) {
      this.romLoadError = true;
      console.error('[RdPiano] ROM loading error:', error);
    }
  }

  private async loadROMSet(setIndex: number): Promise<boolean> {
    if (this.loadedRomSets.has(setIndex)) return true;
    if (setIndex < 0 || setIndex > 2) return false;

    const baseUrl = import.meta.env.BASE_URL || '/';
    const romsUrl = `${baseUrl}rdpiano/roms/`;
    const romSet = ROM_SETS[setIndex];

    // Fetch all 4 files in parallel
    const [ic5, ic6, ic7, ic18] = await Promise.all([
      this.fetchROM(romsUrl + romSet.ic5),
      this.fetchROM(romsUrl + romSet.ic6),
      this.fetchROM(romsUrl + romSet.ic7),
      this.fetchROM(romsUrl + romSet.ic18),
    ]);

    if (!ic5 || !ic6 || !ic7 || !ic18) {
      console.error(`[RdPiano] Failed to load ROM set ${setIndex}`);
      return false;
    }

    this._worklet?.port.postMessage({
      type: 'loadROMSet',
      setIndex,
      ic5,
      ic6,
      ic7,
      ic18,
    });

    this.loadedRomSets.add(setIndex);
    return true;
  }

  private async fetchROM(url: string): Promise<ArrayBuffer | null> {
    // Check cache first
    const cached = RdPianoSynth.romCache.get(url);
    if (cached) return cached.slice(0); // Return copy

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[RdPiano] ROM not found: ${url} (${response.status})`);
        return null;
      }
      const buffer = await response.arrayBuffer();
      RdPianoSynth.romCache.set(url, buffer);
      return buffer.slice(0); // Return copy, keep original in cache
    } catch (error) {
      console.warn(`[RdPiano] Failed to fetch ROM: ${url}`, error);
      return null;
    }
  }

  private applyConfig(): void {
    if (!this._worklet || !this.isInitialized) return;

    if (this.config.chorusEnabled != null) {
      this.setParameter(PARAM.CHORUS_ENABLED, this.config.chorusEnabled ? 1 : 0);
    }
    if (this.config.chorusRate != null) {
      this.setParameter(PARAM.CHORUS_RATE, this.config.chorusRate);
    }
    if (this.config.chorusDepth != null) {
      this.setParameter(PARAM.CHORUS_DEPTH, this.config.chorusDepth);
    }
    if (this.config.efxEnabled != null) {
      this.setParameter(PARAM.EFX_ENABLED, this.config.efxEnabled ? 1 : 0);
    }
    if (this.config.phaserRate != null) {
      this.setParameter(PARAM.PHASER_RATE, this.config.phaserRate);
    }
    if (this.config.phaserDepth != null) {
      this.setParameter(PARAM.PHASER_DEPTH, this.config.phaserDepth);
    }
    if (this.config.tremoloEnabled != null) {
      this.setParameter(PARAM.TREMOLO_ENABLED, this.config.tremoloEnabled ? 1 : 0);
    }
    if (this.config.tremoloRate != null) {
      this.setParameter(PARAM.TREMOLO_RATE, this.config.tremoloRate);
    }
    if (this.config.tremoloDepth != null) {
      this.setParameter(PARAM.TREMOLO_DEPTH, this.config.tremoloDepth);
    }
    if (this.config.volume != null) {
      this.setParameter(PARAM.VOLUME, this.config.volume);
    }
  }

  private setParameter(id: number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'parameter',
      paramId: id,
      value,
    });
  }

  // Public API

  async selectPatch(index: number): Promise<void> {
    if (index < 0 || index >= 16) return;
    const patch = RDPIANO_PATCHES[index];

    // Load ROM set if not already loaded
    if (!this.loadedRomSets.has(patch.romSet)) {
      const loaded = await this.loadROMSet(patch.romSet);
      if (!loaded) return;
    }

    this._worklet?.port.postMessage({
      type: 'selectPatch',
      patchIndex: index,
    });
    this.currentPatch = index;
  }

  setChorusEnabled(enabled: boolean): void {
    this.config.chorusEnabled = enabled;
    this.setParameter(PARAM.CHORUS_ENABLED, enabled ? 1 : 0);
  }

  setChorusRate(rate: number): void {
    rate = Math.max(0, Math.min(14, Math.round(rate)));
    this.config.chorusRate = rate;
    this.setParameter(PARAM.CHORUS_RATE, rate);
  }

  setChorusDepth(depth: number): void {
    depth = Math.max(0, Math.min(14, Math.round(depth)));
    this.config.chorusDepth = depth;
    this.setParameter(PARAM.CHORUS_DEPTH, depth);
  }

  setEfxEnabled(enabled: boolean): void {
    this.config.efxEnabled = enabled;
    this.setParameter(PARAM.EFX_ENABLED, enabled ? 1 : 0);
  }

  setPhaserRate(rate: number): void {
    rate = Math.max(0, Math.min(1, rate));
    this.config.phaserRate = rate;
    this.setParameter(PARAM.PHASER_RATE, rate);
  }

  setPhaserDepth(depth: number): void {
    depth = Math.max(0, Math.min(1, depth));
    this.config.phaserDepth = depth;
    this.setParameter(PARAM.PHASER_DEPTH, depth);
  }

  setTremoloEnabled(enabled: boolean): void {
    this.config.tremoloEnabled = enabled;
    this.setParameter(PARAM.TREMOLO_ENABLED, enabled ? 1 : 0);
  }

  setTremoloRate(rate: number): void {
    rate = Math.max(0, Math.min(14, Math.round(rate)));
    this.config.tremoloRate = rate;
    this.setParameter(PARAM.TREMOLO_RATE, rate);
  }

  setTremoloDepth(depth: number): void {
    depth = Math.max(0, Math.min(14, Math.round(depth)));
    this.config.tremoloDepth = depth;
    this.setParameter(PARAM.TREMOLO_DEPTH, depth);
  }

  setVolume(vol: number): void {
    vol = Math.max(0, Math.min(1, vol));
    this.config.volume = vol;
    this.setParameter(PARAM.VOLUME, vol);
  }

  triggerAttack(frequency: number | string, _time?: number, velocity = 1): this {
    const midiNote = typeof frequency === 'string'
      ? Tone.Frequency(frequency).toMidi()
      : Tone.Frequency(frequency, 'hz').toMidi();
    const vel = Math.round(Math.max(0, Math.min(1, velocity)) * 127);

    if (this.romLoadError) return this;

    if (!this.isInitialized) {
      this.pendingNotes.push({ note: midiNote, velocity: vel });
      return this;
    }

    this._worklet?.port.postMessage({
      type: 'noteOn',
      note: midiNote,
      velocity: vel,
    });
    return this;
  }

  triggerRelease(frequency?: number | string, _time?: number): this {
    if (!this._worklet) return this;

    if (frequency !== undefined) {
      const midiNote = typeof frequency === 'string'
        ? Tone.Frequency(frequency).toMidi()
        : Tone.Frequency(frequency, 'hz').toMidi();
      this._worklet.port.postMessage({
        type: 'noteOff',
        note: midiNote,
      });
    } else {
      this._worklet.port.postMessage({ type: 'allNotesOff' });
    }
    return this;
  }

  controlChange(cc: number, value: number): void {
    this._worklet?.port.postMessage({
      type: 'controlChange',
      cc,
      value,
    });
  }

  pitchBend(value: number): void {
    this._worklet?.port.postMessage({
      type: 'pitchBend',
      value,
    });
  }

  getCurrentPatch(): number {
    return this.currentPatch;
  }

  dispose(): this {
    this._worklet?.port.postMessage({ type: 'allNotesOff' });
    this._worklet?.port.postMessage({ type: 'dispose' });
    this._worklet?.disconnect();
    this._worklet = null;
    this.output.dispose();
    return this;
  }
}
