import type { DevilboxSynth } from '@/types/synth';
import { getDevilboxAudioContext, noteToFrequency, audioNow, timeToSeconds } from '@/utils/audio-context';
import {
  BuzzmachineEngine,
  BuzzmachineType,
  BUZZMACHINE_INFO,
  type BuzzmachineParameter,
} from './BuzzmachineEngine';
import { reportSynthError } from '../../stores/useSynthErrorStore';

/**
 * Muffler mode presets (Devil Fish style)
 */
type MufflerMode = 'off' | 'dark' | 'mid' | 'bright';

/**
 * BuzzmachineGenerator - DevilboxSynth wrapper for buzzmachine WASM generators
 *
 * Unlike BuzzmachineSynth (for effects), this class handles generators
 * that produce audio (synths, drums, etc.)
 *
 * For 303-style synths (Oomek Aggressor), this adds an external effects chain
 * to provide Devil Fish-like enhancements that the original WASM doesn't support.
 */
export class BuzzmachineGenerator implements DevilboxSynth {
  readonly name = 'BuzzmachineGenerator';
  readonly output: GainNode;
  private audioContext: AudioContext;

  private engine = BuzzmachineEngine.getInstance();
  private machineType: BuzzmachineType;
  private workletNode: AudioWorkletNode | null = null;
  private initInProgress = false;
  private useWasmEngine = false;

  // Error tracking - no fallback synths, report errors instead
  private initError: Error | null = null;
  private errorReported: boolean = false;

  // ============================================
  // EFFECTS CHAIN FOR 303-STYLE ENHANCEMENTS
  // These provide Devil Fish-like features externally
  // ============================================
  private preGain: GainNode | null = null;              // Input gain before effects
  private overdrive: WaveShaperNode | null = null;     // Overdrive/saturation
  private overdriveDry: GainNode | null = null;        // Dry path for overdrive mix
  private overdriveWet: GainNode | null = null;        // Wet path for overdrive mix
  private mufflerFilter: BiquadFilterNode | null = null; // Muffler lowpass
  private postFilter: BiquadFilterNode | null = null;  // Additional filter control
  private postGain: GainNode | null = null;            // Output gain after effects

  // 303 enhancement state
  private overdriveAmount = 0;        // 0-100, 0 = bypassed
  private mufflerMode: MufflerMode = 'off';
  private filterTrackingAmount = 0;   // 0-100
  private currentCutoff = 1000;       // Track cutoff for filter tracking

  constructor(machineType: BuzzmachineType) {
    this.audioContext = getDevilboxAudioContext();
    this.machineType = machineType;

    // Create output gain
    this.output = this.audioContext.createGain();

    // Create effects chain for 303-style synths
    if (this.is303Style()) {
      this.createEffectsChain();
    }

    // Initialize WASM engine asynchronously
    this.initEngine();
  }

  /**
   * Create the effects chain for 303-style enhancements
   */
  private createEffectsChain(): void {
    const ctx = this.audioContext;

    this.preGain = ctx.createGain();

    // Overdrive: parallel dry/wet paths through a WaveShaperNode
    this.overdrive = ctx.createWaveShaper();
    this.overdrive.oversample = '2x';
    // Default curve (moderate distortion)
    this.updateOverdriveCurve(0.4);

    this.overdriveDry = ctx.createGain();
    this.overdriveDry.gain.value = 1; // fully dry by default
    this.overdriveWet = ctx.createGain();
    this.overdriveWet.gain.value = 0; // bypassed by default

    this.mufflerFilter = ctx.createBiquadFilter();
    this.mufflerFilter.type = 'lowpass';
    this.mufflerFilter.frequency.value = 20000;
    this.mufflerFilter.Q.value = 0.7;

    this.postFilter = ctx.createBiquadFilter();
    this.postFilter.type = 'lowpass';
    this.postFilter.frequency.value = 20000;
    this.postFilter.Q.value = 1;

    this.postGain = ctx.createGain();

    // Merge node for dry/wet mix
    const merger = ctx.createGain();

    // Chain: preGain → [dry path + wet path] → merger → muffler → postFilter → postGain → output
    this.preGain.connect(this.overdriveDry);
    this.preGain.connect(this.overdrive);
    this.overdrive.connect(this.overdriveWet);
    this.overdriveDry.connect(merger);
    this.overdriveWet.connect(merger);
    merger.connect(this.mufflerFilter);
    this.mufflerFilter.connect(this.postFilter);
    this.postFilter.connect(this.postGain);
    this.postGain.connect(this.output);
  }

  /**
   * Generate a waveshaper distortion curve
   */
  private updateOverdriveCurve(distortion: number): void {
    if (!this.overdrive) return;
    const samples = 4096;
    const curve = new Float32Array(samples);
    const k = distortion * 100;
    for (let i = 0; i < samples; i++) {
      const x = (i / samples) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    this.overdrive.curve = curve;
  }

  /**
   * Ensure WASM engine is initialized
   */
  public async ensureInitialized(): Promise<void> {
    if (this.useWasmEngine) return;

    if (this.initInProgress) {
      // Poll until init completes (max 10 seconds, matches WASM worklet timeout)
      for (let i = 0; i < 200; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (this.useWasmEngine || !this.initInProgress) break;
      }
      return;
    }

    await this.initEngine();
  }

  /**
   * Initialize the WASM engine
   */
  private async initEngine(): Promise<void> {
    if (this.initInProgress || this.useWasmEngine) return;

    this.initInProgress = true;

    try {
      const context = this.audioContext;

      // Initialize engine
      await this.engine.init(context);

      // Create worklet node for this machine
      this.workletNode = await this.engine.createMachineNode(
        context,
        this.machineType
      );

      // Connect worklet to output (through effects chain for 303 synths)
      if (!this.workletNode) {
        throw new Error('Worklet node creation failed');
      }

      // Connect worklet to output — native AudioNodes, no wrapper needed
      const targetNode = this.is303Style() && this.preGain ? this.preGain : this.output;
      this.workletNode.connect(targetNode);

      // CRITICAL: Connect through silent keepalive to destination to force process() calls
      try {
        const keepalive = this.audioContext.createGain();
        keepalive.gain.value = 0;
        this.workletNode.connect(keepalive);
        keepalive.connect(this.audioContext.destination);
      } catch { /* keepalive failed */ }

      this.useWasmEngine = true;
      console.log(`[BuzzmachineGenerator] ${this.machineType} WASM engine active`);
    } catch (err) {
      this.initError = err instanceof Error ? err : new Error(String(err));
      this.useWasmEngine = false;
      this.reportInitError();
    } finally {
      this.initInProgress = false;
    }
  }


  /**
   * Report initialization error to the error store
   */
  private reportInitError(): void {
    if (this.errorReported || !this.initError) return;

    this.errorReported = true;
    const info = BUZZMACHINE_INFO[this.machineType];

    reportSynthError('BuzzmachineGenerator', this.initError.message, {
      synthName: info?.name ?? this.machineType,
      errorType: 'wasm',
      error: this.initError,
      debugData: {
        machineType: this.machineType,
        machineKind: info?.type,
        wasmSupported: typeof WebAssembly !== 'undefined',
      },
    });
  }

  /**
   * Trigger a note
   */
  public triggerAttack(
    note: string | number,
    time?: number,
    velocity: number = 1,
    accent?: boolean,
    slide?: boolean
  ): void {
    // If WASM not available, error was already reported at init
    if (!this.useWasmEngine || !this.workletNode) {
      return;
    }

    const freq = noteToFrequency(note);

    // Apply filter tracking for 303-style synths
    if (this.is303Style() && this.filterTrackingAmount > 0) {
      this.applyFilterTracking(freq);
    }

    // Send note-on message to WASM
    this.workletNode.port.postMessage({
      type: 'noteOn',
      frequency: freq,
      velocity: Math.round(velocity * 127),
      time,
      accent,
      slide,
    });
  }

  /**
   * Release a note
   */
  public triggerRelease(time?: number): void {
    // If WASM not available, error was already reported at init
    if (!this.useWasmEngine || !this.workletNode) {
      return;
    }

    this.workletNode.port.postMessage({
      type: 'noteOff',
      time,
    });
  }

  /**
   * Trigger attack and release
   */
  public triggerAttackRelease(
    note: string | number,
    duration: number | string,
    time?: number,
    velocity: number = 1,
    accent?: boolean,
    slide?: boolean
  ): void {
    const computedTime = time !== undefined ? timeToSeconds(time) : audioNow();
    const computedDuration = timeToSeconds(duration);

    this.triggerAttack(note, computedTime, velocity, accent, slide);
    this.triggerRelease(computedTime + computedDuration);
  }

  /**
   * Set a parameter value
   */
  public setParameter(paramIndex: number, value: number): void {
    if (this.useWasmEngine && this.workletNode) {
      this.engine.setParameter(this.workletNode, paramIndex, value);
    }
    // Fallback parameter mapping could be added here
  }

  /**
   * Get parameter info
   */
  public getParameters(): BuzzmachineParameter[] {
    const info = this.engine.getMachineInfo(this.machineType);
    return info.parameters;
  }

  /**
   * Stop the machine
   */
  public stop(): void {
    if (this.useWasmEngine && this.workletNode) {
      this.engine.stop(this.workletNode);
    }
  }

  /**
   * Release all notes
   */
  public releaseAll(): void {
    this.stop();
  }

  // ============================================
  // TB-303 STYLE API METHODS (for Oomek Aggressor compatibility)
  // These methods mirror the TB303Engine/Open303Synth API
  // ============================================

  /**
   * Check if this is a 303-style synth
   */
  private is303Style(): boolean {
    return this.machineType === BuzzmachineType.OOMEK_AGGRESSOR ||
           this.machineType === BuzzmachineType.OOMEK_AGGRESSOR_DF;
  }

  /**
   * Check if this is the Devil Fish enhanced version (has native Devil Fish params)
   */
  private isDevilFishWasm(): boolean {
    return this.machineType === BuzzmachineType.OOMEK_AGGRESSOR_DF;
  }

  /**
   * Set filter cutoff frequency (0-1 normalized)
   * Maps to Aggressor's cutoff parameter (0x00-0xF0)
   */
  public setCutoff(value: number): void {
    if (!this.is303Style()) return;

    // Track current normalized cutoff
    const hz = 200 * Math.pow(100, value); // Approximate for tracking logic
    this.currentCutoff = Math.max(200, Math.min(5000, hz));

    // Also update post-filter if not using tracking (direct cutoff control)
    if (this.postFilter && this.filterTrackingAmount === 0) {
      this.postFilter.frequency.value = Math.min(18000, this.currentCutoff * 1.5);
    }

    // Aggressor uses a squared curve: cutoff = (param / 240)^2 * 0.8775 + 0.1225
    // Reverse: param = sqrt((cutoff_norm - 0.1225) / 0.8775) * 240
    // But since we now get 0-1 normalized from UI, we can just scale it
    const param = Math.round(value * 0xF0);
    this.setParameter(1, Math.min(0xF0, Math.max(0, param)));
  }

  /**
   * Set filter resonance (0-1 normalized)
   * Maps to Aggressor's resonance parameter (0x00-0x80)
   */
  public setResonance(value: number): void {
    if (!this.is303Style()) return;
    const param = Math.round(value * 0x80);
    this.setParameter(2, Math.min(0x80, Math.max(0, param)));
  }

  /**
   * Set envelope modulation amount (0-1 normalized)
   * Maps to Aggressor's envmod parameter (0x00-0x80)
   */
  public setEnvMod(value: number): void {
    if (!this.is303Style()) return;
    const param = Math.round(value * 0x80);
    this.setParameter(3, Math.min(0x80, Math.max(0, param)));
  }

  /**
   * Set envelope decay time (0-1 normalized)
   * Maps to Aggressor's decay parameter (0x00-0x80)
   */
  public setDecay(value: number): void {
    if (!this.is303Style()) return;
    const param = Math.round(value * 0x80);
    this.setParameter(4, Math.min(0x80, Math.max(0, param)));
  }

  /**
   * Set accent level (0-1 normalized)
   * Maps to Aggressor's acclevel parameter (0x00-0x80)
   */
  public setAccentAmount(value: number): void {
    if (!this.is303Style()) return;
    const param = Math.round(value * 0x80);
    this.setParameter(5, Math.min(0x80, Math.max(0, param)));
  }

  /**
   * Alias for setAccentAmount (matches TB303/Open303 API)
   */
  public setAccent(value: number): void {
    this.setAccentAmount(value);
  }

  /**
   * Set fine tuning (0-1 normalized, 0.5 = center)
   * Maps to Aggressor's finetune parameter (0x00-0xC8, center=0x64)
   */
  public setTuning(value: number): void {
    if (!this.is303Style()) return;
    const param = Math.round(value * 0xC8);
    this.setParameter(6, Math.min(0xC8, Math.max(0, param)));
  }

  /**
   * Set volume (0-1 normalized)
   * Maps to Aggressor's volume parameter (0x00-0xC8)
   */
  public setVolume(value: number): void {
    if (!this.is303Style()) return;
    const param = Math.round(value * 0xC8);
    this.setParameter(7, Math.min(0xC8, Math.max(0, param)));
  }

  /**
   * Set oscillator waveform (0-1 normalized blend)
   * Maps to Aggressor's osctype parameter (0=saw, 1=square)
   */
  public setWaveform(value: number | 'sawtooth' | 'square'): void {
    if (!this.is303Style()) return;
    let param: number;
    if (typeof value === 'number') {
      param = value >= 0.5 ? 1 : 0;
    } else {
      param = value === 'square' ? 1 : 0;
    }
    this.setParameter(0, param);
  }

  /**
   * Set slide time (0-1 normalized)
   * Devil Fish WASM: maps to parameter 14 (10-500ms)
   */
  public setSlideTime(value: number): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      const param = Math.round(value * 100);
      this.setParameter(14, param);
    }
  }

  // ============================================
  // DEVIL FISH STYLE ENHANCEMENTS
  // ============================================

  /**
   * Enable/disable Devil Fish mode
   */
  public enableDevilFish(enabled: boolean, config?: { overdrive?: number; muffler?: MufflerMode }): void {
    if (!this.is303Style()) return;

    if (enabled) {
      // Default Devil Fish settings
      this.setOverdrive(config?.overdrive ?? 0.3); // 30% -> 0.3
      this.setMuffler(config?.muffler ?? 'mid');
      this.setHighResonanceEnabled(true);

      // Devil Fish WASM: also set some sensible defaults for other params
      if (this.isDevilFishWasm()) {
        this.setFilterTracking(0.5);   // 50% -> 0.5
        this.setSlideTime(0.17);       // ~60ms -> 0.17
        this.setSweepSpeed('normal');
      }

      console.log('[BuzzmachineGenerator] Devil Fish mode enabled');
    } else {
      // Disable all Devil Fish features
      this.setOverdrive(0);
      this.setMuffler('off');
      this.setHighResonanceEnabled(false);
      this.setFilterTracking(0);

      console.log('[BuzzmachineGenerator] Devil Fish mode disabled');
    }
  }

  /**
   * Set overdrive amount (0-1 normalized)
   * Uses external WaveShaperNode for saturation
   */
  public setOverdrive(amount: number): void {
    if (!this.is303Style() || !this.overdrive) return;

    this.overdriveAmount = Math.min(Math.max(amount, 0), 1);

    if (this.overdriveAmount === 0) {
      if (this.overdriveDry) this.overdriveDry.gain.value = 1;
      if (this.overdriveWet) this.overdriveWet.gain.value = 0;
    } else {
      const wet = this.overdriveAmount * 0.8;
      if (this.overdriveDry) this.overdriveDry.gain.value = 1 - wet;
      if (this.overdriveWet) this.overdriveWet.gain.value = wet;
      this.updateOverdriveCurve(0.2 + this.overdriveAmount * 0.6);
    }
  }

  /**
   * Set muffler mode
   * Devil Fish WASM: param 15 (0=off, 1=soft, 2=hard)
   */
  public setMuffler(mode: string): void {
    if (!this.is303Style()) return;

    this.mufflerMode = mode as MufflerMode;

    if (this.isDevilFishWasm()) {
      let param: number;
      switch (this.mufflerMode) {
        case 'dark':
        case 'mid':
          param = 1; // Soft
          break;
        case 'bright':
          param = 2; // Hard
          break;
        case 'off':
        default:
          param = 0; // Off
          break;
      }
      this.setParameter(15, param);
    }

    if (this.mufflerFilter) {
      switch (this.mufflerMode) {
        case 'dark':
          this.mufflerFilter.frequency.value = 2000;
          this.mufflerFilter.Q.value = 0.5;
          break;
        case 'mid':
          this.mufflerFilter.frequency.value = 6000;
          this.mufflerFilter.Q.value = 0.7;
          break;
        case 'bright':
          this.mufflerFilter.frequency.value = 12000;
          this.mufflerFilter.Q.value = 0.7;
          break;
        case 'off':
        default:
          this.mufflerFilter.frequency.value = 20000;
          this.mufflerFilter.Q.value = 0.7;
          break;
      }
    }
  }

  /**
   * Update filter tracking based on current note
   * Called internally when triggering notes
   */
  private applyFilterTracking(frequency: number): void {
    if (!this.postFilter || this.filterTrackingAmount === 0) return;

    // Base cutoff + tracking offset based on note frequency
    // Higher notes = higher filter cutoff
    const baseFreq = 440; // A4 reference
    const octaveOffset = Math.log2(frequency / baseFreq);
    const trackingOffset = octaveOffset * this.filterTrackingAmount * 2000;

    const targetCutoff = Math.max(200, Math.min(18000, this.currentCutoff + trackingOffset));
    this.postFilter.frequency.value = targetCutoff;
  }

  /**
   * Set filter tracking amount (0-1 normalized)
   * Devil Fish WASM: param 12 (0-200%)
   * Original Aggressor: post-filter follows note pitch
   */
  public setFilterTracking(value: number): void {
    if (!this.is303Style()) return;
    this.filterTrackingAmount = Math.min(Math.max(value, 0), 1);

    if (this.isDevilFishWasm()) {
      // Map 0-1 to 0-200 range
      const param = Math.round(value * 200);
      this.setParameter(12, Math.min(200, param));
    }
    // For original Aggressor, tracking is applied in triggerAttack
  }

  /**
   * Enable/disable high resonance mode
   */
  public setHighResonanceEnabled(enabled: boolean): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      this.setParameter(13, enabled ? 1 : 0);
    }

    if (this.postFilter) {
      this.postFilter.Q.value = enabled ? 4 : 1;
    }
  }

  /**
   * Alias for setHighResonanceEnabled
   */
  public setHighResonance(enabled: boolean): void {
    this.setHighResonanceEnabled(enabled);
  }

  /**
   * Universal single-parameter API (implements DevilboxSynth.set).
   * All continuous values are 0-1 normalized. Maps to BuzzmachineGenerator's
   * internal setters which handle WASM parameter index translation.
   */
  set(param: string, value: number): void {
    switch (param) {
      case 'cutoff':        this.setCutoff(value); break;
      case 'resonance':     this.setResonance(value); break;
      case 'envMod':        this.setEnvMod(value); break;
      case 'decay':         this.setDecay(value); break;
      case 'accent':        this.setAccent(value); break;
      case 'tuning':        this.setTuning(value); break;
      case 'volume':        this.setVolume(value); break;
      case 'waveform':      this.setWaveform(value); break;
      case 'slideTime':     this.setSlideTime(value); break;
      case 'overdrive':     this.setOverdrive(value); break;
      // Devil Fish
      case 'normalDecay':   this.setNormalDecay(value); break;
      case 'accentDecay':   this.setAccentDecay(value); break;
      case 'softAttack':    this.setSoftAttack(value); break;
      case 'filterTracking': this.setFilterTracking(value); break;
      case 'filterFmDepth': this.setFilterFM(value); break;
      case 'filterFM':      this.setFilterFM(value); break;
      // VEG
      case 'vegDecay':      this.setVegDecay(value); break;
      case 'vegSustain':    this.setVegSustain(value); break;
    }
  }

  // ============================================
  // ENVELOPE PARAMETERS (limited support)
  // ============================================

  /**
   * Set normal decay time (0-1 normalized)
   * Devil Fish WASM: param 4
   */
  public setNormalDecay(value: number): void {
    if (!this.is303Style()) return;
    this.setDecay(value);
  }

  /**
   * Set accent decay time (0-1 normalized)
   * Devil Fish WASM: param 8
   */
  public setAccentDecay(value: number): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      const param = Math.round(value * 0x80);
      this.setParameter(8, Math.min(0x80, Math.max(0, param)));
    }
  }

  /**
   * Set VEG (Volume Envelope Generator) decay (0-1 normalized)
   * Devil Fish WASM: param 9
   */
  public setVegDecay(value: number): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      const param = Math.round(value * 128);
      this.setParameter(9, Math.min(0x80, Math.max(0, param)));
    }
  }

  /**
   * Set VEG sustain level (0-1 normalized)
   * Devil Fish WASM: param 10
   */
  public setVegSustain(value: number): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      const param = Math.round(value * 100);
      this.setParameter(10, param);
    }
  }

  /**
   * Set soft attack time (0-1 normalized)
   * Devil Fish WASM: param 11
   */
  public setSoftAttack(value: number): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      const param = Math.round(value * 100);
      this.setParameter(11, Math.min(100, Math.max(0, param)));
    }
  }

  /**
   * Set filter FM amount (0-1 normalized)
   */
  public setFilterFM(value: number): void {
    if (!this.is303Style()) return;
    if (this.isDevilFishWasm()) {
      // Devil Fish WASM has filter FM at parameter 19
      this.setParameter(19, Math.round(value * 100));
    }
  }

  /**
   * Set sweep speed mode (0-1 normalized or string)
   */
  public setSweepSpeed(mode: string | number): void {
    if (!this.is303Style()) return;

    if (this.isDevilFishWasm()) {
      let param: number;
      if (typeof mode === 'number') {
        param = Math.round(mode * 2); // 0, 1, 2
      } else {
        switch (mode.toLowerCase()) {
          case 'fast': param = 0; break;
          case 'slow': param = 2; break;
          case 'normal':
          default: param = 1; break;
        }
      }
      this.setParameter(16, param);
    }
  }

  // ============================================
  // GUITARML (not supported for WASM synths)
  // ============================================

  /**
   * Load GuitarML model - not supported
   */
  public async loadGuitarMLModel(index: number): Promise<void> {
    void index;
    // GuitarML requires Open303 AudioWorklet, not WASM
    console.warn('[BuzzmachineGenerator] GuitarML not supported for Aggressor');
  }

  /**
   * Enable/disable GuitarML - not supported
   */
  public async setGuitarMLEnabled(enabled: boolean): Promise<void> {
    void enabled;
    // GuitarML requires Open303 AudioWorklet, not WASM
  }

  /**
   * Set GuitarML mix - not supported
   */
  public setGuitarMLMix(mix: number): void {
    void mix;
    // GuitarML requires Open303 AudioWorklet, not WASM
  }

  /**
   * Set quality mode - not applicable
   * Aggressor WASM has fixed quality
   */
  public setQuality(quality: string): void {
    void quality;
    // N/A - WASM runs at fixed quality
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.output.disconnect();

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    // Disconnect effects chain
    if (this.preGain) {
      this.preGain.disconnect();
      this.preGain = null;
    }
    if (this.overdrive) {
      this.overdrive.disconnect();
      this.overdrive = null;
    }
    if (this.overdriveDry) {
      this.overdriveDry.disconnect();
      this.overdriveDry = null;
    }
    if (this.overdriveWet) {
      this.overdriveWet.disconnect();
      this.overdriveWet = null;
    }
    if (this.mufflerFilter) {
      this.mufflerFilter.disconnect();
      this.mufflerFilter = null;
    }
    if (this.postFilter) {
      this.postFilter.disconnect();
      this.postFilter = null;
    }
    if (this.postGain) {
      this.postGain.disconnect();
      this.postGain = null;
    }
  }
}