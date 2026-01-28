/**
 * Beat Slicer Types
 *
 * Data structures for automatic beat slicing, transient detection,
 * and slice management in the sample editor.
 */

/**
 * Represents a single slice of audio within a sample
 */
export interface BeatSlice {
  id: string;
  startFrame: number;      // Start position in sample frames
  endFrame: number;        // End position in sample frames
  startTime: number;       // Start position in seconds
  endTime: number;         // End position in seconds
  confidence: number;      // 0-1 detection confidence (for transient mode)
  label?: string;          // Optional label (e.g., "Kick", "Snare", "Hat")
}

/**
 * Slice detection/creation mode
 */
export type SliceMode = 'transient' | 'grid' | 'manual';

/**
 * Configuration for beat slice detection and display
 */
export interface BeatSliceConfig {
  mode: SliceMode;
  sensitivity: number;           // 0-1, maps to threshold k (0.5-2.0) for transient detection
  minSliceMs: number;            // Minimum slice duration in milliseconds (default: 50ms)
  gridDivision: number;          // For grid mode: 4, 8, 16, 32
  snapToZeroCrossing: boolean;   // Snap slice points to nearest zero crossing
}

/**
 * State for beat slicer UI and analysis
 */
export interface BeatSliceState {
  slices: BeatSlice[];
  selectedSliceId: string | null;
  isAnalyzing: boolean;
  config: BeatSliceConfig;
}

/**
 * Default configuration for beat slicer
 */
export const DEFAULT_BEAT_SLICE_CONFIG: BeatSliceConfig = {
  mode: 'transient',
  sensitivity: 0.65,          // Medium-high sensitivity
  minSliceMs: 50,             // 50ms minimum slice
  gridDivision: 16,           // 16th notes for grid mode
  snapToZeroCrossing: true,   // Reduce clicks at slice boundaries
};

/**
 * Default state for beat slicer
 */
export const DEFAULT_BEAT_SLICE_STATE: BeatSliceState = {
  slices: [],
  selectedSliceId: null,
  isAnalyzing: false,
  config: DEFAULT_BEAT_SLICE_CONFIG,
};

/**
 * Analysis result from the BeatSliceAnalyzer
 */
export interface TransientAnalysisResult {
  slices: BeatSlice[];
  spectralFlux: Float32Array;     // Raw spectral flux values for visualization
  threshold: Float32Array;        // Adaptive threshold values
  peaks: number[];                // Peak frame indices
}

/**
 * Grid analysis parameters
 */
export interface GridAnalysisParams {
  bpm: number;
  beatsPerBar: number;
  division: number;              // 4, 8, 16, 32
  sampleRate: number;
  totalFrames: number;
}

/**
 * Options for creating sliced instruments
 */
export interface SliceExportOptions {
  namePrefix: string;            // Prefix for new instrument names
  includeSourceName: boolean;    // Include original instrument name
  copyEffects: boolean;          // Copy effects chain to sliced instruments
  normalizeSlices: boolean;      // Normalize each slice's volume
  fadeInMs: number;              // Fade in duration (0 = no fade)
  fadeOutMs: number;             // Fade out duration (0 = no fade)
}

export const DEFAULT_SLICE_EXPORT_OPTIONS: SliceExportOptions = {
  namePrefix: 'Slice',
  includeSourceName: true,
  copyEffects: false,
  normalizeSlices: false,
  fadeInMs: 2,
  fadeOutMs: 5,
};
