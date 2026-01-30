/**
 * FurnaceChipEngine - Centralized manager for WASM-based chip emulators
 */

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

    // Rate limit retries to once per 2 seconds
    const now = Date.now();
    if (now - this.lastInitAttempt < 2000) return;
    this.lastInitAttempt = now;

    // Start initialization
    this.initPromise = this.doInit(audioContext);
    return this.initPromise;
  }

  private async doInit(audioContext: unknown): Promise<void> {
    try {
      // Cast to any for duck typing checks
      const ctx = audioContext as any;

      // Debug: log what we received
      console.log('[FurnaceChipEngine] doInit received:', {
        ctxType: Object.prototype.toString.call(ctx),
        ctxConstructor: ctx?.constructor?.name,
        hasRawContext: !!ctx?.rawContext,
        has_context: !!ctx?._context,
        rawContextType: ctx?.rawContext ? Object.prototype.toString.call(ctx.rawContext) : 'N/A',
        _contextType: ctx?._context ? Object.prototype.toString.call(ctx._context) : 'N/A'
      });

      // Debug: log what we received
      console.log('[FurnaceChipEngine] doInit received:', {
        ctxType: Object.prototype.toString.call(ctx),
        ctxConstructor: ctx?.constructor?.name,
        hasRawContext: !!ctx?.rawContext,
        has_context: !!ctx?._context,
        rawContextType: ctx?.rawContext ? Object.prototype.toString.call(ctx.rawContext) : 'N/A',
        _contextType: ctx?._context ? Object.prototype.toString.call(ctx._context) : 'N/A'
      });

      // FIRST: Find the native AudioContext before doing anything else
      // This is critical because we must use the SAME context for adding the module AND creating the node
      //
      // The issue is that instanceof AudioContext fails across JavaScript realms, and
      // Tone.js wraps the native context in ways that make duck typing unreliable.
      //
      // The ONLY reliable method: create a native AudioContext directly

      let nativeCtx: AudioContext | null = null;

      // Method 1: Create our own native AudioContext
      // This guarantees we get a true native context that will work with AudioWorkletNode
      try {
        const NativeAudioContext = globalThis.AudioContext || (globalThis as any).webkitAudioContext;
        if (NativeAudioContext) {
          // Check if we already have a running context we can reuse
          // by creating a gain node from the passed context and getting its native context
          if (ctx && ctx.createGain) {
            const tempGain = ctx.createGain();
            const nodeContext = tempGain.context;
            // Verify this works as a BaseAudioContext by checking prototype chain
            if (Object.prototype.toString.call(nodeContext) === '[object AudioContext]') {
              nativeCtx = nodeContext as AudioContext;
              console.log('[FurnaceChipEngine] Got native context from GainNode.context');
            }
          }

          // If that didn't work, try creating our own fresh context
          if (!nativeCtx) {
            // Try to get the existing context from Tone.js properly
            // Access the internal _context which should be the native one
            const toneCtx = ctx?._context;
            const toneCtxType = Object.prototype.toString.call(toneCtx);
            console.log('[FurnaceChipEngine] Tone._context type:', toneCtxType);
            if (toneCtx && (toneCtxType === '[object AudioContext]' || toneCtxType === '[object BaseAudioContext]')) {
              nativeCtx = toneCtx as AudioContext;
              console.log('[FurnaceChipEngine] Got native context from Tone._context');
            }
          }

          // Last resort: create a brand new AudioContext
          if (!nativeCtx) {
            console.log('[FurnaceChipEngine] Creating new native AudioContext');
            nativeCtx = new NativeAudioContext();
            // Sync state with Tone's context
            if (ctx?.state === 'running' && nativeCtx.state !== 'running') {
              await nativeCtx.resume();
            }
          }
        }
      } catch (e) {
        console.warn('[FurnaceChipEngine] Failed to get native AudioContext:', e);
      }

      // Validate we found a native context
      if (!nativeCtx || !nativeCtx.audioWorklet) {
        console.warn('[FurnaceChipEngine] Invalid audio context - no native audioWorklet. ctx type:', ctx?.constructor?.name);
        this.initPromise = null; // Allow retry
        return;
      }

      // Ensure context is running
      if (nativeCtx.state !== 'running') {
        console.log('[FurnaceChipEngine] AudioContext state:', nativeCtx.state, '- will retry later');
        this.initPromise = null;
        return;
      }

      console.log('[FurnaceChipEngine] Native AudioContext ready, state:', nativeCtx.state, 'type:', Object.prototype.toString.call(nativeCtx));

      const baseUrl = import.meta.env.BASE_URL || '/';

      // Add worklet module to the NATIVE context (not the wrapper!)
      const workletUrl = `${baseUrl}FurnaceChips.worklet.js`;
      try {
        await nativeCtx.audioWorklet.addModule(workletUrl);
        console.log('[FurnaceChipEngine] Worklet module loaded to native context');
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
      // Add cache-busting to ensure fresh WASM is loaded after rebuilds
      const cacheBuster = `?v=${Date.now()}`;
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
      const jsCode = await jsResponse.text();
      console.log('[FurnaceChipEngine] WASM loaded, size:', wasmBinary.byteLength);
      console.log('[FurnaceChipEngine] JS loaded, size:', jsCode.length);

      try {
        // Store native context reference for diagnostics
        this.nativeContext = nativeCtx as AudioContext;

        // Cast to AudioContext for TypeScript - we've verified it has audioWorklet
        this.workletNode = new AudioWorkletNode(nativeCtx as AudioContext, 'furnace-chips-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        // Connect worklet output directly to speakers (its own AudioContext destination)
        this.workletNode.connect(nativeCtx.destination);
        console.log('[FurnaceChipEngine] AudioWorkletNode created and connected to destination, ctx state:', this.nativeContext.state);
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
      this.workletNode.port.postMessage({
        type: 'init',
        wasmBinary,
        jsCode
      });

      const success = await initPromise;
      if (success) {
        this.isLoaded = true;
        console.log('[FurnaceChipEngine] ✓ WASM chips initialized successfully');

        // Message handler for status only (debug/heartbeat logging disabled for performance)
        this.workletNode!.port.addEventListener('message', (event: MessageEvent) => {
          // Debug and heartbeat messages silenced for performance
          if (event.data.type === 'status') {
            // Status logging disabled for performance
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

  private writeCount: number = 0;
  private nativeContext: AudioContext | null = null;

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