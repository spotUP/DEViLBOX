/**
 * FurnaceChipEngine - Centralized manager for WASM-based chip emulators
 */

import { createAudioWorkletNode as toneCreateAudioWorkletNode } from 'tone/build/esm/core/context/AudioContext';
import { getNativeContext } from '@utils/audio-context';

export const FurnaceChipType = {
  // === FM CHIPS ===
  OPN2: 0,      // YM2612 - Sega Genesis/Mega Drive
  OPM: 1,       // YM2151 - Arcade, Sharp X68000
  OPL3: 2,      // YMF262 - Sound Blaster Pro 2
  OPLL: 11,     // YM2413 - MSX-MUSIC, SMS FM
  OPNA: 13,     // YM2608 - PC-88/98
  OPNB: 14,     // YM2610 - Neo Geo
  OPZ: 22,      // YM2414 - TX81Z
  Y8950: 23,    // MSX-AUDIO
  OPL4: 26,     // YMF278B - OPL3 + wavetable
  OPN: 47,      // YM2203 - PC-88/98 (simpler OPNA)
  OPNB_B: 48,   // YM2610B - Extended Neo Geo
  ESFM: 49,     // Enhanced OPL3

  // === PSG CHIPS ===
  PSG: 3,       // SN76489 - SMS, Genesis, BBC Micro
  AY: 12,       // AY-3-8910 - MSX, ZX Spectrum, Atari ST
  SAA: 18,      // SAA1099 - SAM Coupé
  T6W28: 43,    // Neo Geo Pocket (stereo PSG)
  AY8930: 50,   // Enhanced AY-3-8910

  // === NINTENDO ===
  NES: 4,       // 2A03 APU
  GB: 5,        // Game Boy DMG
  SNES: 24,     // SPC700 + BRR
  FDS: 16,      // Famicom Disk System
  MMC5: 17,     // NES mapper audio
  VRC6: 9,      // Konami VRC6
  N163: 8,      // Namco 163
  VB: 44,       // Virtual Boy VSU
  NDS: 51,      // Nintendo DS
  GBA_DMA: 52,  // GBA DMA sound
  GBA_MINMOD: 53, // GBA MinMod
  POKEMINI: 54, // Pokemon Mini

  // === WAVETABLE ===
  PCE: 6,       // PC Engine / TurboGrafx-16
  SCC: 7,       // Konami SCC
  SWAN: 19,     // WonderSwan
  SM8521: 37,   // Sharp SM8521 (Game.com)
  BUBBLE: 38,   // Konami Bubble System (K005289)
  X1_010: 41,   // Seta X1-010
  NAMCO: 55,    // Namco WSG (Pac-Man, Galaga)

  // === COMMODORE ===
  SID: 10,      // SID3 (modern)
  SID_6581: 45, // MOS 6581
  SID_8580: 46, // MOS 8580
  VIC: 33,      // VIC-20
  TED: 34,      // Plus/4 TED
  PET: 56,      // PET piezo

  // === ATARI ===
  TIA: 15,      // Atari 2600
  POKEY: 57,    // Atari 400/800/XL/XE
  LYNX: 25,     // Atari Lynx Mikey

  // === SAMPLE PLAYBACK ===
  OKI: 20,      // MSM6295
  ES5506: 21,   // Ensoniq ES5506
  SEGAPCM: 27,  // Sega PCM
  YMZ280B: 28,  // Yamaha YMZ280B
  RF5C68: 29,   // Sega CD PCM
  GA20: 30,     // Irem GA20
  C140: 31,     // Namco C140
  QSOUND: 32,   // Capcom QSound
  K007232: 39,  // Konami K007232
  K053260: 40,  // Konami K053260
  MSM6258: 58,  // OKI ADPCM
  MSM5232: 59,  // 8-voice wavetable
  MULTIPCM: 60, // Sega Model 1/2
  AMIGA: 61,    // Paula 4-channel

  // === OTHER ===
  VERA: 36,     // Commander X16
  SUPERVISION: 35, // Watara Supervision
  UPD1771: 42,  // µPD1771
  PCSPKR: 62,   // PC Speaker
  PONG: 63,     // Pong discrete
  PV1000: 64,   // Casio PV-1000
  DAVE: 65,     // Enterprise DAVE
  SU: 66,       // Sound Unit
  BIFURCATOR: 67, // Experimental
  POWERNOISE: 68, // Power Noise
  ZXBEEPER: 69,   // ZX Spectrum beeper
  ZXBEEPER_QT: 70, // ZX quadtone
  SCVTONE: 71,    // Epoch SCV
  PCMDAC: 72,     // Generic PCM DAC
} as const;

export type FurnaceChipType = typeof FurnaceChipType[keyof typeof FurnaceChipType];

export class FurnaceChipEngine {
  private static instance: FurnaceChipEngine | null = null;
  private isLoaded: boolean = false;
  private initPromise: Promise<void> | null = null;
  private initFailedPermanently: boolean = false; // Only for permanent failures (bad context type)
  private workletNode: AudioWorkletNode | null = null;
  private lastInitAttempt: number = 0;
  private writeCount: number = 0;
  private nativeContext: AudioContext | null = null;

  public static getInstance(): FurnaceChipEngine {
    if (!FurnaceChipEngine.instance) {
      FurnaceChipEngine.instance = new FurnaceChipEngine();
    }
    return FurnaceChipEngine.instance;
  }

  /**
   * Initialize the engine and load WASM
   * @param audioContext - Must be a native AudioContext (not a Tone.js wrapper)
   */
  public async init(audioContext: unknown): Promise<void> {
    // Already initialized successfully
    if (this.isLoaded) return;

    // Previous init attempt failed permanently - don't retry
    if (this.initFailedPermanently) return;

    // Init already in progress - wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Rate limit retries to once per 500ms
    const now = Date.now();
    if (now - this.lastInitAttempt < 500) return;
    this.lastInitAttempt = now;

    // Start initialization
    this.initPromise = this.doInit(audioContext);
    return this.initPromise;
  }

  private async doInit(audioContext: unknown): Promise<void> {
    try {
      // Get rawContext from Tone.js context (standardized-audio-context)
      const toneCtx = audioContext as any;
      const rawContext = toneCtx.rawContext || toneCtx._context || audioContext;
      // Also get native context for compatibility checks
      const nativeCtx = getNativeContext(audioContext);

      // Validate we found a valid context
      if (!rawContext || !rawContext.audioWorklet) {
        console.warn('[FurnaceChipEngine] Invalid audio context - no audioWorklet');
        this.initPromise = null; // Allow retry
        return;
      }

      // Ensure context is running - try to resume, then wait up to 5s
      if (rawContext.state !== 'running') {
        console.log('[FurnaceChipEngine] AudioContext state:', rawContext.state, '- attempting resume');
        try {
          await rawContext.resume();
        } catch {
          // Ignore resume errors
        }
        if (rawContext.state !== 'running') {
          console.log('[FurnaceChipEngine] Waiting up to 5s for AudioContext to start...');
          const started = await Promise.race([
            new Promise<boolean>((resolve) => {
              const check = () => {
                if (rawContext.state === 'running') resolve(true);
                else setTimeout(check, 100);
              };
              setTimeout(check, 100);
            }),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
          ]);
          if (!started) {
            console.warn('[FurnaceChipEngine] AudioContext not running after 5s wait');
            this.initPromise = null;
            return;
          }
          console.log('[FurnaceChipEngine] AudioContext became running');
        }
      }

      console.log('[FurnaceChipEngine] AudioContext ready, state:', rawContext.state);

      const baseUrl = import.meta.env.BASE_URL || '/';
      const cacheBuster = `?v=${Date.now()}`;

      // Add worklet module to the rawContext (standardized-audio-context)
      const workletUrl = `${baseUrl}FurnaceChips.worklet.js${cacheBuster}`;
      try {
        await rawContext.audioWorklet.addModule(workletUrl);
        console.log('[FurnaceChipEngine] Worklet module loaded');
      } catch (err: any) {
        // Check if it's "already registered" vs actual error
        if (err?.message?.includes('already') || err?.name === 'InvalidStateError') {
          console.log('[FurnaceChipEngine] Worklet already registered');
        } else {
          console.error('[FurnaceChipEngine] Worklet load failed:', workletUrl, err);
          this.initPromise = null; // Allow retry
          return;
        }
      }

      // Fetch WASM binary and JS module to pass to worklet
      const wasmUrl = `${baseUrl}FurnaceChips.wasm${cacheBuster}`;
      const jsUrl = `${baseUrl}FurnaceChips.js${cacheBuster}`;
      console.log('[FurnaceChipEngine] Fetching WASM from:', wasmUrl);
      console.log('[FurnaceChipEngine] Fetching JS from:', jsUrl);

      const [wasmResponse, jsResponse] = await Promise.all([
        fetch(wasmUrl, { cache: 'no-store' }),
        fetch(jsUrl, { cache: 'no-store' })
      ]);

      if (!wasmResponse.ok) {
        console.error('[FurnaceChipEngine] WASM fetch failed:', wasmResponse.status, wasmResponse.statusText);
        this.initPromise = null;
        return;
      }
      if (!jsResponse.ok) {
        console.error('[FurnaceChipEngine] JS fetch failed:', jsResponse.status, jsResponse.statusText);
        this.initPromise = null;
        return;
      }

      const wasmBinary = await wasmResponse.arrayBuffer();
      let jsCode = await jsResponse.text();
      console.log('[FurnaceChipEngine] WASM loaded, size:', wasmBinary.byteLength);
      console.log('[FurnaceChipEngine] JS loaded, size:', jsCode.length);

      // Preprocess Emscripten JS for AudioWorklet compatibility:
      // 1. Replace import.meta.url (not available in Function constructor)
      // 2. Remove ES module export (invalid in Function body)
      // 3. Strip Node.js dynamic import block (fails in worklet)
      // 4. Expose wasmMemory on Module (Emscripten keeps it internal)
      // 5. Polyfill URL class (not available in AudioWorklet's WorkletGlobalScope)
      const urlPolyfill = 'if(typeof URL==="undefined"){globalThis.URL=class{constructor(p,b){this.href=(b||"")+p;this.pathname=p;}};}\n';
      jsCode = urlPolyfill + jsCode
        .replace(/import\.meta\.url/g, "'.'")
        .replace(/export\s+default\s+\w+;?/g, '')
        .replace(/if\s*\(ENVIRONMENT_IS_NODE\)\s*\{[^}]*await\s+import\([^)]*\)[^}]*\}/g, '')
        .replace(/(wasmMemory=wasmExports\["\w+"\])/, '$1;Module["wasmMemory"]=wasmMemory');

      try {
        // Store native context reference for diagnostics
        this.nativeContext = nativeCtx;

        // Use Tone.js's createAudioWorkletNode with rawContext (standardized-audio-context)
        // Explicitly set output configuration for stereo
        this.workletNode = toneCreateAudioWorkletNode(rawContext, 'furnace-chips-processor', {
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });

        if (this.workletNode) {
          // Don't connect directly to destination - let FurnaceSynth route
          // through its Tone.js output gain for proper signal chain integration
          console.log('[FurnaceChipEngine] AudioWorkletNode created, ctx state:', rawContext.state);
        }
      } catch (err) {
        console.error('[FurnaceChipEngine] AudioWorkletNode creation failed:', err);
        this.initPromise = null;
        return;
      }

      // Wait for worklet to signal ready
      const initPromise = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[FurnaceChipEngine] Worklet init timeout after 10s');
          resolve(false);
        }, 10000);

        const handler = (event: MessageEvent) => {
          if (event.data.type === 'initialized') {
            clearTimeout(timeout);
            this.workletNode?.port.removeEventListener('message', handler);
            console.log('[FurnaceChipEngine] Worklet signaled ready');
            resolve(true);
          }
        };
        this.workletNode!.port.addEventListener('message', handler);
        this.workletNode!.port.start(); // Required for message receiving
      });

      // Send binary, JS code, and init command
      console.log('[FurnaceChipEngine] Sending WASM binary and JS to worklet...');
      if (this.workletNode) {
        this.workletNode.port.postMessage({
          type: 'init',
          wasmBinary,
          jsCode
        });
      }

      const success = await initPromise;
      if (success) {
        this.isLoaded = true;
        console.log('[FurnaceChipEngine] ✓ WASM chips initialized successfully');

        // CRITICAL: Connect worklet through a silent keepalive to destination.
        // AudioWorkletNode.process() is only called by the browser when the node
        // is in an active audio graph path to destination. Without this connection,
        // the worklet sits idle and never renders audio — even though FurnaceSynth
        // connects it to outputGain (the SAC→native bridge doesn't trigger processing).
        // The keepalive gain is set to 0 so no audio leaks directly to speakers.
        // FurnaceSynth.initEngine() connects through outputGain for actual signal routing.
        try {
          const keepalive = rawContext.createGain();
          keepalive.gain.value = 0;
          this.workletNode!.connect(keepalive);
          keepalive.connect(rawContext.destination);
          console.log('[FurnaceChipEngine] ✓ Worklet keepalive → destination (process() activation)');
        } catch (destErr) {
          console.warn('[FurnaceChipEngine] Keepalive connection failed:', destErr);
          // Fallback: try native context
          try {
            if (nativeCtx && nativeCtx.destination) {
              const keepalive = nativeCtx.createGain();
              keepalive.gain.value = 0;
              this.workletNode!.connect(keepalive);
              keepalive.connect(nativeCtx.destination);
              console.log('[FurnaceChipEngine] ✓ Worklet keepalive → native destination (fallback)');
            }
          } catch (nativeErr) {
            console.warn('[FurnaceChipEngine] Native keepalive also failed:', nativeErr);
          }
        }

        // Message handler for debug and status messages from worklet
        this.workletNode!.port.addEventListener('message', (event: MessageEvent) => {
          if (event.data.type === 'debug') {
            console.log('[FurnaceWorklet]', event.data.message, event.data);
          } else if (event.data.type === 'status') {
            console.log('[FurnaceWorklet] Status:', event.data);
          }
        });

        // Request initial status after a short delay to confirm worklet is processing
        setTimeout(() => {
          this.requestWorkletStatus();
        }, 500);
      } else {
        console.warn('[FurnaceChipEngine] Worklet init failed, allowing retry');
        this.initPromise = null;
      }
    } catch (err) {
      console.error('[FurnaceChipEngine] Init error:', err);
      this.initPromise = null; // Allow retry
    }
  }

  /**
   * Write to a chip register
   */
  public write(chipType: FurnaceChipType, register: number, value: number): void {
    if (!this.workletNode) {
      if (this.writeCount < 5) {
        console.warn('[FurnaceChipEngine] Write ignored - no worklet node');
      }
      return;
    }
    this.workletNode.port.postMessage({
      type: 'write',
      chipType,
      register,
      value
    });
    // Log first few writes AND critical registers for debugging
    // 0x08 = OPM/OPZ key-on, 0x28 = OPN2 key-on, 0xA0-0xA7 = FREQ
    const isCritical = register === 0x08 || register === 0x28 || (register >= 0xA0 && register <= 0xA7);
    if (this.writeCount < 10 || isCritical) {
      const ctxState = this.nativeContext?.state || 'no-ctx';
      const tag = isCritical ? '★' : '';
      console.log(`[FurnaceChipEngine] ${tag}Write: chip=${chipType}, reg=0x${register.toString(16)}, val=0x${value.toString(16)}, ctx=${ctxState}`);
    }
    this.writeCount++;
  }

  /**
   * Get diagnostic info about the engine state
   */
  public getDiagnostics(): { loaded: boolean; hasWorklet: boolean; contextState: string | null } {
    return {
      loaded: this.isLoaded,
      hasWorklet: this.workletNode !== null,
      contextState: this.nativeContext?.state || null
    };
  }

  /**
   * Request worklet status (async - response via message handler)
   */
  public requestWorkletStatus(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ type: 'getStatus' });
    }
  }

  /**
   * Set wavetable data for a chip
   */
  public setWavetable(chipType: FurnaceChipType, index: number, data: Uint8Array): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setWavetable',
      chipType,
      index,
      data
    });
  }

  /**
   * Enable or disable hardware register logging
   */
  public setLogging(enabled: boolean): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setLogging',
      enabled
    });
  }

  /**
   * Retrieve the captured register log
   */
  public async getLog(): Promise<Uint8Array> {
    if (!this.workletNode) return new Uint8Array(0);
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data.type === 'logData') {
          this.workletNode?.port.removeEventListener('message', handler);
          resolve(event.data.data);
        }
      };
      this.workletNode?.port.addEventListener('message', handler);
      this.workletNode?.port.postMessage({ type: 'getLog' });
    });
  }

  public getOutput(): AudioNode {
    if (!this.workletNode) throw new Error('Engine not initialized');
    return this.workletNode;
  }

  /**
   * Check if the engine is initialized and working
   */
  public isInitialized(): boolean {
    return this.isLoaded && this.workletNode !== null;
  }

  /**
   * Deactivate a chip (stop rendering it)
   */
  public deactivate(chipType: FurnaceChipType): void {
    if (!this.workletNode) return;
    console.log(`[FurnaceChipEngine] Deactivating chip ${chipType}`);
    this.workletNode.port.postMessage({
      type: 'deactivate',
      chipType
    });
  }
}