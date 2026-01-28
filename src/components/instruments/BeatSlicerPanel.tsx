/**
 * BeatSlicerPanel - Beat/transient slicing UI for sample editor
 *
 * Features:
 * - Automatic transient detection with adjustable sensitivity
 * - Grid-based slicing at beat divisions
 * - Manual slice marker placement
 * - Slice preview and selection
 * - Export slices to new instruments
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Zap, Grid3X3, MousePointer2, Play, Trash2,
  Download, RefreshCw, ChevronDown, ChevronUp, X, Piano
} from 'lucide-react';
import { useInstrumentStore, useTransportStore, notify } from '../../stores';
import type { InstrumentConfig, DrumKitKeyMapping } from '../../types/instrument';
import { DEFAULT_DRUMKIT } from '../../types/instrument';
import type { BeatSlice, BeatSliceConfig, SliceMode } from '../../types/beatSlicer';
import { DEFAULT_BEAT_SLICE_CONFIG } from '../../types/beatSlicer';
import { BeatSliceAnalyzer } from '../../lib/audio/BeatSliceAnalyzer';
import { getToneEngine } from '../../engine/ToneEngine';

interface BeatSlicerPanelProps {
  instrument: InstrumentConfig;
  audioBuffer: AudioBuffer | null;
  onSlicesChange?: (slices: BeatSlice[]) => void;
  onSliceSelect?: (sliceId: string | null) => void;
  selectedSliceId?: string | null;
  onClose?: () => void;
}

export const BeatSlicerPanel: React.FC<BeatSlicerPanelProps> = ({
  instrument,
  audioBuffer,
  onSlicesChange,
  onSliceSelect,
  selectedSliceId,
  onClose,
}) => {
  const { updateSlices, updateSliceConfig, createSlicedInstruments } = useInstrumentStore();
  const bpm = useTransportStore((state) => state.bpm);

  // Local state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Get slices and config from instrument or use defaults
  const slices = instrument.sample?.slices || [];
  const config: BeatSliceConfig = instrument.sample?.sliceConfig || DEFAULT_BEAT_SLICE_CONFIG;

  // Analyzer instance
  const analyzer = useMemo(() => {
    if (!audioBuffer) return null;
    return new BeatSliceAnalyzer(audioBuffer);
  }, [audioBuffer]);

  // Update config helper
  const setConfig = useCallback((updates: Partial<BeatSliceConfig>) => {
    const newConfig = { ...config, ...updates };
    updateSliceConfig(instrument.id, newConfig);
  }, [config, instrument.id, updateSliceConfig]);

  // Update slices helper
  const setSlices = useCallback((newSlices: BeatSlice[]) => {
    updateSlices(instrument.id, newSlices);
    onSlicesChange?.(newSlices);
  }, [instrument.id, updateSlices, onSlicesChange]);

  // Detect slices based on current mode and config
  const handleDetectSlices = useCallback(async () => {
    if (!analyzer || !audioBuffer) {
      notify.error('No audio loaded');
      return;
    }

    setIsAnalyzing(true);

    try {
      // Small delay for UI feedback
      await new Promise(resolve => setTimeout(resolve, 50));

      const detectedSlices = analyzer.analyze(config, bpm);
      setSlices(detectedSlices);

      notify.success(`Detected ${detectedSlices.length} slices`);
    } catch (error) {
      console.error('[BeatSlicerPanel] Detection failed:', error);
      notify.error('Slice detection failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzer, audioBuffer, config, bpm, setSlices]);

  // Clear all slices
  const handleClearSlices = useCallback(() => {
    setSlices([]);
    onSliceSelect?.(null);
  }, [setSlices, onSliceSelect]);

  // Preview a single slice
  const handlePreviewSlice = useCallback(async (slice: BeatSlice) => {
    if (!audioBuffer) return;

    try {
      const engine = getToneEngine();
      await engine.previewSlice(instrument.id, slice.startFrame, slice.endFrame);
    } catch (error) {
      console.error('[BeatSlicerPanel] Preview failed:', error);
    }
  }, [audioBuffer, instrument.id]);

  // Export slices as new instruments
  const handleExportSlices = useCallback(async () => {
    if (slices.length === 0) {
      notify.error('No slices to export');
      return;
    }

    setIsExporting(true);

    try {
      const newIds = await createSlicedInstruments(instrument.id, slices);

      if (newIds.length > 0) {
        notify.success(`Created ${newIds.length} new instruments`);
      } else {
        notify.error('Failed to create instruments');
      }
    } catch (error) {
      console.error('[BeatSlicerPanel] Export failed:', error);
      notify.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [slices, instrument.id, createSlicedInstruments]);

  // Get the createInstrument function
  const createInstrument = useInstrumentStore((state) => state.createInstrument);

  // Create DrumKit from slices
  const [isCreatingKit, setIsCreatingKit] = useState(false);

  const handleCreateDrumKit = useCallback(async () => {
    if (slices.length === 0 || !audioBuffer) {
      notify.error('No slices to create drumkit from');
      return;
    }

    setIsCreatingKit(true);

    try {
      // Create keymap entries - map each slice to a note starting from C-1 (MIDI 24)
      const keymap: DrumKitKeyMapping[] = slices.map((slice, index) => {
        const midiNote = 24 + index; // C-1 = 24, C#1 = 25, D-1 = 26, etc.
        return {
          id: `slice-${index}`,
          noteStart: midiNote,
          noteEnd: midiNote,
          sampleId: instrument.id.toString(),
          sampleUrl: instrument.sample?.url || '',
          sampleName: slice.label || `Slice ${index + 1}`,
          pitchOffset: 0,
          fineTune: 0,
          volumeOffset: 0,
          panOffset: 0,
          // Store slice timing info in base note for reference
          baseNote: undefined,
        };
      });

      // Create a new DrumKit instrument
      const newId = createInstrument({
        name: `${instrument.name} Kit`,
        synthType: 'DrumKit',
        drumKit: {
          ...DEFAULT_DRUMKIT,
          keymap,
          maxVoices: Math.min(slices.length, 16),
        },
        // Also keep the sample reference for loading slice audio
        sample: instrument.sample ? {
          ...instrument.sample,
          slices: [...slices],
        } : undefined,
      });

      notify.success(`Created DrumKit instrument #${newId} with ${slices.length} slices mapped to C-1 and up`);
    } catch (error) {
      console.error('[BeatSlicerPanel] DrumKit creation failed:', error);
      notify.error('Failed to create DrumKit');
    } finally {
      setIsCreatingKit(false);
    }
  }, [slices, audioBuffer, instrument, createInstrument]);

  // Format time display
  const formatTime = (seconds: number): string => {
    return seconds.toFixed(3) + 's';
  };

  // Mode button component
  const ModeButton: React.FC<{
    mode: SliceMode;
    icon: React.ReactNode;
    label: string;
  }> = ({ mode, icon, label }) => (
    <button
      onClick={() => setConfig({ mode })}
      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
        config.mode === mode
          ? 'bg-ft2-highlight text-ft2-bg'
          : 'bg-ft2-shadow text-ft2-text hover:bg-ft2-border'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  if (!audioBuffer) {
    return null;
  }

  return (
    <div className="bg-ft2-header border border-ft2-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-ft2-shadow"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-ft2-highlight" />
          <span className="text-ft2-highlight text-xs font-bold tracking-wide">BEAT SLICER</span>
          {slices.length > 0 && (
            <span className="text-ft2-textDim text-[10px]">({slices.length} slices)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 hover:bg-ft2-border rounded"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3 border-t border-ft2-border">
          {/* Mode Selection */}
          <div className="space-y-1">
            <div className="text-[9px] text-ft2-textDim font-bold">MODE</div>
            <div className="flex gap-1">
              <ModeButton mode="transient" icon={<Zap size={12} />} label="Transient" />
              <ModeButton mode="grid" icon={<Grid3X3 size={12} />} label="Grid" />
              <ModeButton mode="manual" icon={<MousePointer2 size={12} />} label="Manual" />
            </div>
          </div>

          {/* Mode-specific Controls */}
          {config.mode === 'transient' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-ft2-textDim w-20">Sensitivity:</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.sensitivity * 100}
                  onChange={(e) => setConfig({ sensitivity: parseInt(e.target.value) / 100 })}
                  className="flex-1 h-1 accent-ft2-highlight"
                />
                <span className="text-[10px] text-ft2-text w-10 text-right">
                  {Math.round(config.sensitivity * 100)}%
                </span>
              </div>
            </div>
          )}

          {config.mode === 'grid' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-ft2-textDim w-20">Division:</span>
              <select
                value={config.gridDivision}
                onChange={(e) => setConfig({ gridDivision: parseInt(e.target.value) })}
                className="bg-ft2-bg border border-ft2-border rounded px-2 py-1 text-xs text-ft2-text"
              >
                <option value={4}>1/4 (Quarter)</option>
                <option value={8}>1/8 (Eighth)</option>
                <option value={16}>1/16 (Sixteenth)</option>
                <option value={32}>1/32 (32nd)</option>
              </select>
              <span className="text-[10px] text-ft2-textDim">@ {bpm} BPM</span>
            </div>
          )}

          {/* Common Controls */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-ft2-textDim w-20">Min Duration:</span>
              <input
                type="range"
                min="10"
                max="200"
                value={config.minSliceMs}
                onChange={(e) => setConfig({ minSliceMs: parseInt(e.target.value) })}
                className="flex-1 h-1 accent-ft2-highlight"
              />
              <span className="text-[10px] text-ft2-text w-12 text-right">
                {config.minSliceMs}ms
              </span>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.snapToZeroCrossing}
                onChange={(e) => setConfig({ snapToZeroCrossing: e.target.checked })}
                className="w-3 h-3 accent-ft2-highlight"
              />
              <span className="text-[10px] text-ft2-text">Snap to Zero Crossing</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleDetectSlices}
              disabled={isAnalyzing || config.mode === 'manual'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-ft2-highlight text-ft2-bg rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Zap size={12} />
              )}
              <span>{isAnalyzing ? 'Detecting...' : 'Detect Slices'}</span>
            </button>

            <button
              onClick={handleClearSlices}
              disabled={slices.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-ft2-shadow text-ft2-text rounded text-xs font-medium hover:bg-ft2-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={12} />
              <span>Clear</span>
            </button>
          </div>

          {/* Slice List */}
          {slices.length > 0 && (
            <div className="space-y-1">
              <div className="text-[9px] text-ft2-textDim font-bold">
                SLICES ({slices.length})
              </div>
              <div className="max-h-32 overflow-y-auto border border-ft2-border rounded bg-ft2-bg">
                {slices.map((slice, index) => (
                  <div
                    key={slice.id}
                    onClick={() => onSliceSelect?.(slice.id === selectedSliceId ? null : slice.id)}
                    className={`flex items-center gap-2 px-2 py-1 cursor-pointer text-[10px] border-b border-ft2-border last:border-b-0 ${
                      slice.id === selectedSliceId
                        ? 'bg-ft2-cursor/30 text-ft2-highlight'
                        : 'hover:bg-ft2-shadow text-ft2-text'
                    }`}
                  >
                    <span className="w-6 text-ft2-textDim">{index + 1}.</span>
                    <span className="flex-1 font-mono">
                      {formatTime(slice.startTime)} - {formatTime(slice.endTime)}
                    </span>
                    {slice.label && (
                      <span className="text-ft2-textDim">{slice.label}</span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreviewSlice(slice);
                      }}
                      className="p-0.5 hover:bg-ft2-border rounded"
                      title="Preview"
                    >
                      <Play size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export Buttons */}
          {slices.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={handleExportSlices}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-ft2-cursor text-ft2-bg rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                <span>
                  {isExporting
                    ? 'Creating...'
                    : `Create ${slices.length} Sliced Instrument${slices.length > 1 ? 's' : ''}`}
                </span>
              </button>

              <button
                onClick={handleCreateDrumKit}
                disabled={isCreatingKit}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-ft2-highlight text-ft2-bg rounded text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingKit ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Piano size={12} />
                )}
                <span>
                  {isCreatingKit
                    ? 'Creating Kit...'
                    : `Create DrumKit (${slices.length} keys from C-1)`}
                </span>
              </button>
            </div>
          )}

          {/* Help Text */}
          <div className="text-[9px] text-ft2-textDim">
            {config.mode === 'transient' && (
              <span>Automatically detect transients (drum hits, note onsets)</span>
            )}
            {config.mode === 'grid' && (
              <span>Create even slices based on tempo and note division</span>
            )}
            {config.mode === 'manual' && (
              <span>Click on waveform to add slice markers</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BeatSlicerPanel;
