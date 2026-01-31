/**
 * CCMapManager - Generalized MIDI CC to Parameter Mapping
 *
 * Extends beyond TB303-specific mappings to support any instrument parameter.
 * Works alongside the existing MIDI store for backward compatibility.
 */

import { getMIDIManager } from './MIDIManager';
import type { MIDIMessage } from './types';

/**
 * Generalized CC mapping that can target any instrument parameter
 */
export interface GeneralCCMapping {
  id: string;                       // Unique mapping ID
  ccNumber: number;                 // 0-127
  midiChannel?: number;             // 0-15 or undefined for any channel
  instrumentId: number;             // Target instrument ID
  parameterPath: string;            // Dot-notation path e.g., "filter.cutoff"
  min: number;                      // Parameter minimum value
  max: number;                      // Parameter maximum value
  curve: 'linear' | 'logarithmic';  // Value curve
  displayName?: string;             // Human-readable name for UI
  sensitivity?: number;             // 0.1 to 1.0, default 1.0 (lower = less sensitive)
}

/**
 * Learn mode state
 */
interface LearnState {
  isLearning: boolean;
  instrumentId: number | null;
  parameterPath: string | null;
  displayName: string | null;
  min: number;
  max: number;
  curve: 'linear' | 'logarithmic';
  callback: ((ccNumber: number, channel: number) => void) | null;
}

/**
 * Callback for parameter value changes from MIDI CC
 */
type ParameterChangeCallback = (
  instrumentId: number,
  parameterPath: string,
  value: number
) => void;

class CCMapManager {
  private static instance: CCMapManager | null = null;

  // Generalized mappings
  private mappings: Map<string, GeneralCCMapping> = new Map();

  // CC value smoothing - tracks last values for interpolation
  private lastCCValues: Map<string, number> = new Map(); // key: "cc-channel"
  private smoothedValues: Map<string, number> = new Map();

  // Global sensitivity (0.1 = very slow, 1.0 = direct, default 0.3 for smooth control)
  private globalSensitivity: number = 0.3;

  // Currently controlled instrument ID (null = control all TB-303 instruments)
  private controlledInstrumentId: number | null = null;

  // Listeners for controlled instrument changes
  private controlledInstrumentListeners: Set<(instrumentId: number | null) => void> = new Set();

  // Learn mode state
  private learnState: LearnState = {
    isLearning: false,
    instrumentId: null,
    parameterPath: null,
    displayName: null,
    min: 0,
    max: 100,
    curve: 'linear',
    callback: null,
  };

  // Parameter change callbacks
  private changeCallbacks: Set<ParameterChangeCallback> = new Set();

  // Learn mode change listeners
  private learnListeners: Set<(isLearning: boolean, parameterPath: string | null) => void> =
    new Set();

  // Mapping change listeners
  private mappingListeners: Set<() => void> = new Set();

  // MIDI handler registration status
  private handlerRegistered: boolean = false;

  private constructor() {}

  static getInstance(): CCMapManager {
    if (!CCMapManager.instance) {
      CCMapManager.instance = new CCMapManager();
    }
    return CCMapManager.instance;
  }

  /**
   * Initialize and register with MIDIManager
   */
  init(): void {
    if (this.handlerRegistered) return;

    const midiManager = getMIDIManager();
    midiManager.addMessageHandler(this.handleMIDIMessage);
    this.handlerRegistered = true;

    // Load persisted mappings
    this.loadMappings();

  }

  /**
   * Handle incoming MIDI messages
   */
  private handleMIDIMessage = (message: MIDIMessage): void => {
    if (message.type !== 'cc' || message.cc === undefined || message.value === undefined) {
      return;
    }

    // Check if we're in learn mode
    if (this.learnState.isLearning && this.learnState.callback) {
      this.learnState.callback(message.cc, message.channel);
      return;
    }

    // Apply smoothing to the CC value
    const ccKey = `${message.cc}-${message.channel}`;
    const rawValue = message.value;
    const lastSmoothed = this.smoothedValues.get(ccKey) ?? rawValue;

    // Interpolate based on sensitivity (lower = smoother/slower)
    const sensitivity = this.globalSensitivity;
    const smoothedValue = lastSmoothed + (rawValue - lastSmoothed) * sensitivity;
    this.smoothedValues.set(ccKey, smoothedValue);

    // Find matching mappings and apply
    this.mappings.forEach((mapping) => {
      if (mapping.ccNumber !== message.cc) return;
      if (mapping.midiChannel !== undefined && mapping.midiChannel !== message.channel) return;

      // Use per-mapping sensitivity if defined, otherwise use smoothed value
      const effectiveSensitivity = mapping.sensitivity ?? 1.0;
      const ccValue = effectiveSensitivity < 1.0
        ? lastSmoothed + (rawValue - lastSmoothed) * effectiveSensitivity
        : smoothedValue;

      const paramValue = this.ccToParameter(ccValue, mapping);
      this.notifyParameterChange(mapping.instrumentId, mapping.parameterPath, paramValue);
    });
  };

  /**
   * Convert CC value (0-127) to parameter value
   */
  ccToParameter(ccValue: number, mapping: GeneralCCMapping): number {
    const normalized = ccValue / 127;

    if (mapping.curve === 'logarithmic') {
      // Logarithmic scaling for frequency-like parameters
      const safeMin = Math.max(1, mapping.min);
      const safeMax = Math.max(safeMin + 1, mapping.max);
      const logMin = Math.log(safeMin);
      const logMax = Math.log(safeMax);
      return Math.exp(logMin + normalized * (logMax - logMin));
    }

    // Linear scaling
    return mapping.min + normalized * (mapping.max - mapping.min);
  }

  /**
   * Convert parameter value to CC value (0-127)
   */
  parameterToCC(paramValue: number, mapping: GeneralCCMapping): number {
    let normalized: number;

    if (mapping.curve === 'logarithmic') {
      const safeMin = Math.max(1, mapping.min);
      const safeMax = Math.max(safeMin + 1, mapping.max);
      const logMin = Math.log(safeMin);
      const logMax = Math.log(safeMax);
      const logValue = Math.log(Math.max(safeMin, paramValue));
      normalized = (logValue - logMin) / (logMax - logMin);
    } else {
      normalized = (paramValue - mapping.min) / (mapping.max - mapping.min);
    }

    return Math.round(Math.max(0, Math.min(127, normalized * 127)));
  }

  // ==========================================================================
  // MIDI Learn Mode
  // ==========================================================================

  /**
   * Enter learn mode for a specific parameter
   */
  startLearn(
    instrumentId: number,
    parameterPath: string,
    displayName: string,
    min: number,
    max: number,
    curve: 'linear' | 'logarithmic' = 'linear'
  ): Promise<{ ccNumber: number; channel: number } | null> {
    return new Promise((resolve) => {
      this.learnState = {
        isLearning: true,
        instrumentId,
        parameterPath,
        displayName,
        min,
        max,
        curve,
        callback: (ccNumber, channel) => {
          this.learnState.isLearning = false;
          this.learnState.callback = null;
          this.notifyLearnChange(false, null);
          resolve({ ccNumber, channel });
        },
      };

      this.notifyLearnChange(true, parameterPath);
    });
  }

  /**
   * Cancel learn mode
   */
  cancelLearn(): void {
    if (this.learnState.isLearning) {
      this.learnState = {
        isLearning: false,
        instrumentId: null,
        parameterPath: null,
        displayName: null,
        min: 0,
        max: 100,
        curve: 'linear',
        callback: null,
      };
      this.notifyLearnChange(false, null);
    }
  }

  /**
   * Check if currently in learn mode
   */
  isLearning(): boolean {
    return this.learnState.isLearning;
  }

  /**
   * Get the parameter currently being learned
   */
  getLearningParameter(): string | null {
    return this.learnState.parameterPath;
  }

  // ==========================================================================
  // Mapping Management
  // ==========================================================================

  /**
   * Add or update a CC mapping
   */
  setMapping(mapping: GeneralCCMapping): void {
    // Remove any existing mapping for this parameter on this instrument
    this.mappings.forEach((existing, id) => {
      if (
        existing.instrumentId === mapping.instrumentId &&
        existing.parameterPath === mapping.parameterPath
      ) {
        this.mappings.delete(id);
      }
    });

    this.mappings.set(mapping.id, mapping);
    this.saveMappings();
    this.notifyMappingChange();
  }

  /**
   * Remove a mapping by ID
   */
  removeMapping(id: string): void {
    if (this.mappings.has(id)) {
      this.mappings.delete(id);
      this.saveMappings();
      this.notifyMappingChange();
    }
  }

  /**
   * Remove all mappings for an instrument
   */
  removeMappingsForInstrument(instrumentId: number): void {
    const toRemove: string[] = [];
    this.mappings.forEach((mapping, id) => {
      if (mapping.instrumentId === instrumentId) {
        toRemove.push(id);
      }
    });

    toRemove.forEach((id) => this.mappings.delete(id));

    if (toRemove.length > 0) {
      this.saveMappings();
      this.notifyMappingChange();
    }
  }

  /**
   * Get mapping for a specific instrument parameter
   */
  getMappingForParameter(instrumentId: number, parameterPath: string): GeneralCCMapping | undefined {
    for (const mapping of this.mappings.values()) {
      if (mapping.instrumentId === instrumentId && mapping.parameterPath === parameterPath) {
        return mapping;
      }
    }
    return undefined;
  }

  /**
   * Get all mappings for an instrument
   */
  getMappingsForInstrument(instrumentId: number): GeneralCCMapping[] {
    const result: GeneralCCMapping[] = [];
    this.mappings.forEach((mapping) => {
      if (mapping.instrumentId === instrumentId) {
        result.push(mapping);
      }
    });
    return result;
  }

  /**
   * Get all mappings
   */
  getAllMappings(): GeneralCCMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * Clear all mappings
   */
  clearAllMappings(): void {
    this.mappings.clear();
    this.saveMappings();
    this.notifyMappingChange();
  }

  // ==========================================================================
  // Callbacks and Listeners
  // ==========================================================================

  /**
   * Subscribe to parameter changes from MIDI CC
   */
  onParameterChange(callback: ParameterChangeCallback): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  /**
   * Subscribe to learn mode changes
   */
  onLearnChange(
    callback: (isLearning: boolean, parameterPath: string | null) => void
  ): () => void {
    this.learnListeners.add(callback);
    return () => this.learnListeners.delete(callback);
  }

  /**
   * Subscribe to mapping changes
   */
  onMappingChange(callback: () => void): () => void {
    this.mappingListeners.add(callback);
    return () => this.mappingListeners.delete(callback);
  }

  private notifyParameterChange(
    instrumentId: number,
    parameterPath: string,
    value: number
  ): void {
    this.changeCallbacks.forEach((callback) => {
      try {
        callback(instrumentId, parameterPath, value);
      } catch (error) {
        console.error('[CCMapManager] Parameter change callback error:', error);
      }
    });
  }

  private notifyLearnChange(isLearning: boolean, parameterPath: string | null): void {
    this.learnListeners.forEach((callback) => {
      try {
        callback(isLearning, parameterPath);
      } catch (error) {
        console.error('[CCMapManager] Learn change callback error:', error);
      }
    });
  }

  private notifyMappingChange(): void {
    this.mappingListeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error('[CCMapManager] Mapping change callback error:', error);
      }
    });
  }

  // ==========================================================================
  // Sensitivity Control
  // ==========================================================================

  /**
   * Set global CC sensitivity (0.1 = very smooth/slow, 1.0 = direct/fast)
   * Default is 0.3 for smooth knob control
   */
  setGlobalSensitivity(sensitivity: number): void {
    this.globalSensitivity = Math.max(0.05, Math.min(1.0, sensitivity));
    console.log(`[CCMapManager] Global sensitivity set to ${this.globalSensitivity}`);
  }

  /**
   * Get current global CC sensitivity
   */
  getGlobalSensitivity(): number {
    return this.globalSensitivity;
  }

  /**
   * Reset smoothed values (call when switching instruments or contexts)
   */
  resetSmoothing(): void {
    this.smoothedValues.clear();
    this.lastCCValues.clear();
  }

  // ==========================================================================
  // Controlled Instrument
  // ==========================================================================

  /**
   * Set the instrument to control with MIDI CC
   * @param instrumentId - The instrument ID to control, or null to control all TB-303 instruments
   */
  setControlledInstrument(instrumentId: number | null): void {
    this.controlledInstrumentId = instrumentId;
    this.resetSmoothing();
    console.log(`[CCMapManager] Controlled instrument set to ${instrumentId ?? 'all'}`);
    this.notifyControlledInstrumentChange(instrumentId);
  }

  /**
   * Get the currently controlled instrument ID
   */
  getControlledInstrument(): number | null {
    return this.controlledInstrumentId;
  }

  /**
   * Subscribe to controlled instrument changes
   */
  onControlledInstrumentChange(callback: (instrumentId: number | null) => void): () => void {
    this.controlledInstrumentListeners.add(callback);
    return () => this.controlledInstrumentListeners.delete(callback);
  }

  private notifyControlledInstrumentChange(instrumentId: number | null): void {
    this.controlledInstrumentListeners.forEach((callback) => {
      try {
        callback(instrumentId);
      } catch (error) {
        console.error('[CCMapManager] Controlled instrument change callback error:', error);
      }
    });
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private saveMappings(): void {
    try {
      const data = JSON.stringify(Array.from(this.mappings.values()));
      localStorage.setItem('cc-mappings-v1', data);
    } catch (error) {
      console.error('[CCMapManager] Failed to save mappings:', error);
    }
  }

  private loadMappings(): void {
    try {
      const data = localStorage.getItem('cc-mappings-v1');
      if (data) {
        const mappings: GeneralCCMapping[] = JSON.parse(data);
        this.mappings.clear();
        mappings.forEach((mapping) => {
          this.mappings.set(mapping.id, mapping);
        });
      }
    } catch (error) {
      console.error('[CCMapManager] Failed to load mappings:', error);
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    if (this.handlerRegistered) {
      const midiManager = getMIDIManager();
      midiManager.removeMessageHandler(this.handleMIDIMessage);
      this.handlerRegistered = false;
    }

    this.mappings.clear();
    this.changeCallbacks.clear();
    this.learnListeners.clear();
    this.mappingListeners.clear();
  }
}

// Export singleton getter
export function getCCMapManager(): CCMapManager {
  return CCMapManager.getInstance();
}

export { CCMapManager };
