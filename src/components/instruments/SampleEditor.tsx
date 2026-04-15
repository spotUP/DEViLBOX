/**
 * SampleEditor - State-of-the-art sample editor with waveform visualization
 *
 * Features:
 * - Zoom/scroll with mouse wheel + minimap navigation
 * - Range selection via mouse drag
 * - Cut/Copy/Paste/Crop/Delete/Silence on selection
 * - Fade In/Out, Volume adjust, Reverse, Normalize, DC removal
 * - 20-level Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
 * - Draggable start/end + loop handles
 * - Loop types: Off / Forward / Pingpong
 * - Spectrum/FFT view toggle
 * - Enhancement panel, Amiga resampler, Beat slicer integration
 * - Keyboard shortcuts (focus-gated)
 * - WAV export
 * - Supports Sampler, Player, and GranularSynth instruments
 */

import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Upload, Trash2, Music, Play, Square, AlertCircle,
  ZoomIn, ZoomOut, Sparkles, Wand2, RefreshCcw, Zap,
  Scissors, Copy, ClipboardPaste, Crop, VolumeX, Volume2, Volume1,
  Undo2, Redo2, Eye, Download,
  ArrowLeft, ArrowRight, Maximize2, FlipHorizontal,
  Activity, Waves, Clock, Filter, Mic, CircleDot, ChevronDown, X
} from 'lucide-react';
import { WavetableEditor } from './editors/WavetableEditor';
import { Button } from '@components/ui/Button';
import { CustomSelect } from '@components/common/CustomSelect';
import { useInstrumentStore, useTrackerStore } from '../../stores';
import { scan9xxOffsets } from '@/lib/analysis/scan9xxOffsets';
import type { InstrumentConfig, DeepPartial } from '../../types/instrument';
import { DEFAULT_GRANULAR } from '../../types/instrument';
import * as Tone from 'tone';
import { SampleEnhancerPanel } from './SampleEnhancerPanel';
import { AmiResamplerModal } from './AmiResamplerModal';
import { MpcResamplerModal } from './MpcResamplerModal';
import { AudioToMidiModal } from './AudioToMidiModal';
import { AmigaPalModal } from './AmigaPalModal';
import { BeatSyncDialog } from './BeatSyncDialog';
import { BeatSlicerPanel } from './BeatSlicerPanel';
import { SampleSpectrumFilter } from './SampleSpectrumFilter';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { bufferToDataUrl } from '../../utils/audio/SampleProcessing';
import { drawSampleWaveform } from '../../utils/audio/drawSampleWaveform';
import type { WaveformDrawOptions } from '../../utils/audio/drawSampleWaveform';
import { useSampleEditorState } from '../../hooks/useSampleEditorState';
import type { DragTarget } from '../../hooks/useSampleEditorState';
import { addManualSlice } from '../../lib/audio/BeatSliceAnalyzer';
import { UADEEngine } from '../../engine/uade/UADEEngine';
import { UADELiveParamsBar } from './controls/UADELiveParamsBar';
import { UADEDebuggerPanel } from './controls/UADEDebuggerPanel';
import { SampleLoopEditor } from './SampleLoopEditor';
import { useInstrumentPlaybackState } from '../../hooks/useInstrumentPlaybackState';
import { getInstrumentLastAttack } from '@/engine/instrumentPlaybackTracker';

// ─── Props & types ─────────────────────────────────────────────────────

interface SampleEditorProps {
  instrument: InstrumentConfig;
  onChange?: (updates: Partial<InstrumentConfig>) => void;
}

interface SampleInfo {
  name: string;
  duration: number;
  size: number;
  sampleRate?: number;
  channels?: number;
}

const NOTE_OPTIONS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

// Canvas sizes
const CANVAS_W = 1120;
const CANVAS_H = 300;
const MINIMAP_H = 40;

// ─── Icon button helper ────────────────────────────────────────────────

const IconBtn: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}> = ({ onClick, title, disabled, children, active, className }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={
      'p-1.5 rounded transition-colors ' +
      (active
        ? 'bg-accent-primary/30 text-accent-primary'
        : disabled
          ? 'text-text-muted opacity-30 cursor-not-allowed'
          : 'hover:bg-white/10 text-text-secondary') +
      (className ? ' ' + className : '')
    }
  >
    {children}
  </button>
);

// ─── Component ─────────────────────────────────────────────────────────

export const SampleEditor: React.FC<SampleEditorProps> = ({ instrument, onChange }) => {
  const { updateInstrument: storeUpdateInstrument } = useInstrumentStore();
  const allInstruments = useInstrumentStore((s) => s.instruments);

  const updateInstrument = useCallback(
    (id: number, updates: DeepPartial<InstrumentConfig>) => {
      if (onChange) onChange(updates as Partial<InstrumentConfig>);
      else storeUpdateInstrument(id, updates);
    },
    [onChange, storeUpdateInstrument],
  );

  // ─── Refs ────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const playerBlobUrlRef = useRef<string | null>(null);
  /** Raw AudioBufferSourceNodes used by the preview Play button. Bypasses
   *  Tone.Player so we get fully reliable loop semantics. In loop mode
   *  there are TWO scheduled sources: one for the attack (0 → loopEnd,
   *  no loop) and a second one that starts exactly when the first ends
   *  and loops the [loopStart, loopEnd] region forever. This works around
   *  a Chrome quirk where setting loop=true with offset < loopStart
   *  immediately clamps the playhead to loopStart instead of playing the
   *  pre-loop region first. */
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const animationRef = useRef<number | null>(null);
  const isFileDraggingRef = useRef(false);
  const selectionDragStart = useRef<number>(-1);

  // ─── Instrument data ────────────────────────────────────────────
  const params = (instrument.parameters || {}) as Record<string, unknown>;
  const sampleUrl: string | null =
    (instrument.sample?.url as string) ||
    (params.sampleUrl as string) ||
    (instrument.granular?.sampleUrl as string) ||
    null;
  const sampleInfo: SampleInfo | null = (params.sampleInfo as SampleInfo) || null;
  const granular = instrument.granular;
  const isGranular = instrument.synthType === 'GranularSynth';

  // ─── Beat slicer state ──────────────────────────────────────────
  const [selectedSliceId, setSelectedSliceId] = React.useState<string | null>(null);

  // ─── Waveform Studio modal state ────────────────────────────────
  const [showWaveformStudio, setShowWaveformStudio] = React.useState(false);

  // ─── Persist callbacks for the state hook ────────────────────────
  const onPersistBuffer = useCallback(
    async (buffer: AudioBuffer, label: string) => {
      const dataUrl = await bufferToDataUrl(buffer);
      console.log(`[SampleEditor] onPersistBuffer: label="${label}" bufDur=${buffer.duration.toFixed(3)}s dataUrlLen=${dataUrl.length} hasSample=${!!instrument.sample} sampleUrl=${instrument.sample?.url?.substring(0, 60)}...`);
      const updates: Parameters<typeof updateInstrument>[1] = {
        parameters: {
          ...instrument.parameters,
          sampleUrl: dataUrl,
          sampleInfo: {
            name: sampleInfo?.name
              ? sampleInfo.name.startsWith(label + '_')
                ? sampleInfo.name
                : label.replace(/\s+/g, '_') + '_' + sampleInfo.name
              : label,
            duration: buffer.duration,
            size: Math.round(((dataUrl.split(',')[1] || '').length * 3) / 4),
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels,
          },
        },
      };
      // If instrument.sample?.url exists it takes priority in the engine's
      // sampleUrl resolution, so we must also update it here — otherwise the
      // engine recreates the Sampler with the original (pre-edit) sample.url.
      if (instrument.sample) {
        updates.sample = { ...instrument.sample, url: dataUrl };
      }
      console.log(`[SampleEditor] onPersistBuffer: updates.sample set=${!!updates.sample} newUrlLen=${dataUrl.length}`);
      updateInstrument(instrument.id, updates);

      // Write-back to UADE chip RAM when editing a UADE enhanced-mode sample.
      const samplePtr = instrument.sample?.uadeSamplePtr;
      if (samplePtr && UADEEngine.hasInstance()) {
        // Convert AudioBuffer Float32 → 8-bit signed Amiga PCM stored as unsigned bytes.
        // Paula is mono — use channel 0.
        const f32 = buffer.getChannelData(0);
        const pcm8 = new Uint8Array(f32.length);
        for (let i = 0; i < f32.length; i++) {
          const s8 = Math.round(Math.max(-1, Math.min(1, f32[i])) * 127);
          pcm8[i] = s8 < 0 ? s8 + 256 : s8;
        }
        UADEEngine.getInstance().setInstrumentSample(samplePtr, pcm8);
      }
    },
    [instrument.id, instrument.parameters, instrument.sample, sampleInfo, updateInstrument],
  );

  const onUpdateParams = useCallback(
    (updates: Record<string, unknown>) => {
      updateInstrument(instrument.id, {
        parameters: { ...instrument.parameters, ...updates },
      });
    },
    [instrument.id, instrument.parameters, updateInstrument],
  );

  // ─── State hook ──────────────────────────────────────────────────
  const s = useSampleEditorState({
    instrumentId: instrument.id,
    instrumentParameters: instrument.parameters as Record<string, unknown> | undefined,
    onPersistBuffer,
    onUpdateParams,
  });

  const {
    audioBuffer,
    setAudioBuffer,
    viewStart,
    viewEnd,
    zoomAtPosition,
    scrollView,
    showAll,
    zoomToSelection,
    selectionStart,
    selectionEnd,
    setSelection,
    clearSelection,
    selectAll,
    hasSelection,
    selectionLength,
    setDragTarget,
    dragTargetRef,
    dragTarget,
    clipboardBuffer,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undoCount,
    redoCount,
    showSpectrum,
    setShowSpectrum,
    showEnhancer,
    setShowEnhancer,
    showResampleModal,
    setShowResampleModal,
    showMpcResampleModal,
    setShowMpcResampleModal,
    showAudioToMidiModal,
    setShowAudioToMidiModal,
    showBeatSlicer,
    setShowBeatSlicer,
    showBeatSync,
    setShowBeatSync,
    showAmigaPal,
    setShowAmigaPal,
    showSpectrumFilter,
    setShowSpectrumFilter,
    isPlaying,
    setIsPlaying,
    playbackPosition,
    setPlaybackPosition,
    isLoading,
    setIsLoading,
    error,
    setError,
    doCut,
    doCopy,
    doPaste,
    doCrop,
    doDelete,
    doSilence,
    doFadeIn,
    doFadeOut,
    doVolumeUp,
    doVolumeDown,
    doReverse,
    doNormalize,
    doDcRemoval,
    doUndo,
    doRedo,
    doExportWav,
    doFindLoop,
    doSnapLoopToZero,
    params: editorParams,
    updateParam,
  } = s;

  const {
    loopEnabled,
    loopStart,
    loopEnd,
    loopType,
    baseNote,
    playbackRate,
    reverse,
  } = editorParams;

  // ─── Song playback position for this instrument (WASM + ToneEngine) ─────────
  const songPlayback = useInstrumentPlaybackState(
    instrument.id, instrument.synthType, audioBuffer?.duration,
  );
  useEffect(() => {
    if (songPlayback.isPlaying && songPlayback.position >= 0) {
      setPlaybackPosition(songPlayback.position);
      if (!isPlaying) setIsPlaying(true);
    } else if (!songPlayback.isPlaying && isPlaying && playerRef.current?.state !== 'started') {
      setPlaybackPosition(0);
    }
  }, [songPlayback.isPlaying, songPlayback.position, isPlaying, setIsPlaying, setPlaybackPosition]);

  // ─── Test-keyboard / external-MIDI playhead overlay ───────────────
  // When the user triggers notes via the test keyboard, test piano, or
  // external MIDI, ToneEngine records the attack time in
  // instrumentPlaybackTracker. This effect polls it and animates the
  // editor's playhead from there using the same loop math as the
  // editor's own Play button. Inactive when the editor's own Play
  // button is running its own animation.
  useEffect(() => {
    if (isPlaying) return; // handlePlay owns the playhead in this case
    if (!audioBuffer) return;
    const duration = audioBuffer.duration;
    if (!duration || duration <= 0) return;

    let rafId = 0;
    let lastSeenAttack = -1;
    let attackCtxTime = 0;

    const tick = () => {
      const lastAttack = getInstrumentLastAttack(instrument.id);
      if (lastAttack !== null && lastAttack !== lastSeenAttack) {
        lastSeenAttack = lastAttack;
        attackCtxTime = lastAttack;
      }

      if (lastSeenAttack > 0) {
        const ctx = Tone.getContext().rawContext as AudioContext;
        const elapsed = ctx.currentTime - attackCtxTime;

        let progress = 0;
        if (loopEnabled) {
          const loopStartNorm = Math.max(0, Math.min(0.99, loopStart));
          const loopEndNorm = Math.max(loopStartNorm + 0.001, Math.min(1, loopEnd));
          const loopRegionDur = (loopEndNorm - loopStartNorm) * duration;
          const preLoopDur = loopEndNorm * duration;

          if (elapsed < preLoopDur) {
            progress = elapsed / duration;
          } else if (loopType === 'pingpong') {
            const cycleDur = 2 * loopRegionDur;
            const cycleElapsed = (elapsed - preLoopDur) % cycleDur;
            if (cycleElapsed < loopRegionDur) {
              progress = loopStartNorm + (cycleElapsed / loopRegionDur) * (loopEndNorm - loopStartNorm);
            } else {
              const back = cycleElapsed - loopRegionDur;
              progress = loopEndNorm - (back / loopRegionDur) * (loopEndNorm - loopStartNorm);
            }
          } else {
            const loopElapsed = (elapsed - preLoopDur) % loopRegionDur;
            progress = loopStartNorm + loopElapsed / duration;
          }

          // Cap the loop animation at 60s of wall-clock so a stale
          // "attack ages ago" doesn't keep the playhead spinning forever.
          if (elapsed > 60) {
            lastSeenAttack = -1;
            setPlaybackPosition(0);
          } else {
            setPlaybackPosition(progress);
          }
        } else {
          // One-shot — animate over the sample's natural duration
          progress = elapsed / duration;
          if (progress >= 1) {
            lastSeenAttack = -1;
            setPlaybackPosition(0);
          } else {
            setPlaybackPosition(progress);
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    isPlaying, audioBuffer, instrument.id,
    loopEnabled, loopStart, loopEnd, loopType,
    setPlaybackPosition,
  ]);

  // ─── Sync loop params from parameters → sample config ────────────
  // The sample editor writes loop settings to `parameters` (normalized 0-1),
  // but the audio engine reads from `sample` (frame indices). Bridge them.
  useEffect(() => {
    const totalFrames = audioBuffer?.length ?? 0;
    const sampleRate = audioBuffer?.sampleRate;
    const currentSample = instrument.sample || {} as Record<string, unknown>;

    // Convert normalized 0-1 positions to frame indices
    const frameLoopStart = Math.round(loopStart * totalFrames);
    const frameLoopEnd = Math.round(loopEnd * totalFrames);

    // Only update if something actually changed to avoid infinite loops
    const needsUpdate =
      currentSample.loop !== loopEnabled ||
      currentSample.loopStart !== frameLoopStart ||
      currentSample.loopEnd !== frameLoopEnd ||
      currentSample.loopType !== loopType ||
      (sampleRate && currentSample.sampleRate !== sampleRate);

    if (needsUpdate && totalFrames > 0) {
      updateInstrument(instrument.id, {
        sample: {
          ...currentSample,
          loop: loopEnabled,
          loopStart: frameLoopStart,
          loopEnd: frameLoopEnd,
          loopType,
          ...(sampleRate ? { sampleRate } : {}),
        },
      });
    }
  }, [loopEnabled, loopStart, loopEnd, loopType, audioBuffer, instrument.id, instrument.sample, updateInstrument]);

  // ─── Scan current pattern for 9xx offset markers ─────────────────
  // Subscribe to pattern data so we re-scan when cells change
  const currentPattern = useTrackerStore((s) => s.patterns[s.currentPatternIndex]);
  const offsetMarkers = useMemo(() => {
    if (!currentPattern || !audioBuffer || !instrument.id) return undefined;
    const offsets = scan9xxOffsets(currentPattern, instrument.id);
    return offsets.length > 0 ? offsets : undefined;
  }, [currentPattern, audioBuffer, instrument.id]);

  // ─── Load audio buffer when URL changes ──────────────────────────
  useEffect(() => {
    if (!sampleUrl) {
      setAudioBuffer(null);
      return;
    }

    const loadBuffer = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(sampleUrl);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('text/html')) throw new Error('Server returned HTML (404?)');
        const arrayBuffer = await response.arrayBuffer();
        const { getDevilboxAudioContext } = await import('@utils/audio-context');
        let ctx: AudioContext;
        try {
          ctx = getDevilboxAudioContext();
        } catch {
          ctx = new AudioContext();
        }
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        setAudioBuffer(buffer);

        if (!sampleInfo) {
          updateInstrument(instrument.id, {
            parameters: {
              ...instrument.parameters,
              sampleInfo: {
                name: 'Sample',
                duration: buffer.duration,
                size: arrayBuffer.byteLength,
                sampleRate: buffer.sampleRate,
                channels: buffer.numberOfChannels,
              },
            },
          });
        }

        if (playerRef.current) playerRef.current.dispose();
        if (playerBlobUrlRef.current) URL.revokeObjectURL(playerBlobUrlRef.current);
        // Create a Blob URL from the raw WAV bytes for Tone.Player —
        // more efficient than re-fetching large base64 data URLs
        const blob = new Blob([arrayBuffer.slice(0)], { type: 'audio/wav' });
        const blobUrl = URL.createObjectURL(blob);
        playerBlobUrlRef.current = blobUrl;
        playerRef.current = new Tone.Player(blobUrl).toDestination();
      } catch (err) {
        console.error('[SampleEditor] Failed to load audio:', err);
        setError('Failed to load audio file');
      } finally {
        setIsLoading(false);
      }
    };

    loadBuffer();
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
      if (playerBlobUrlRef.current) {
        URL.revokeObjectURL(playerBlobUrlRef.current);
        playerBlobUrlRef.current = null;
      }
      // Tear down any in-flight preview sources
      for (const s of previewSourcesRef.current) {
        try { s.stop(); } catch { /* ok */ }
        try { s.disconnect(); } catch { /* ok */ }
      }
      previewSourcesRef.current = [];
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleUrl]);

  // ─── Keep Tone.Player buffer in sync with audioBuffer ────────────
  // After in-place edits (cut/delete/paste/reverse/normalize/etc.) the
  // hook updates `audioBuffer` synchronously and persists a new dataUrl
  // asynchronously. The dataUrl roundtrip can take a moment, and during
  // that window the player would still hold the OLD buffer — meaning
  // Play would use new offsets (audioBuffer.duration) but play old audio.
  // Push the edited buffer straight into the existing player so playback
  // is always in sync with the visible waveform.
  useEffect(() => {
    if (!audioBuffer || !playerRef.current) return;
    try {
      playerRef.current.buffer = new Tone.ToneAudioBuffer(audioBuffer);
    } catch (err) {
      console.warn('[SampleEditor] failed to sync player buffer:', err);
    }
  }, [audioBuffer]);

  // ─── Canvas draw: main waveform ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_W * dpr) {
      canvas.width = CANVAS_W * dpr;
      canvas.height = CANVAS_H * dpr;
      ctx.scale(dpr, dpr);
    }

    const opts: WaveformDrawOptions = {
      audioBuffer,
      viewStart,
      viewEnd,
      selectionStart,
      selectionEnd,
      loopEnabled,
      loopStart,
      loopEnd,
      loopType: loopType || 'forward',
      playbackPosition,
      granularPosition: isGranular ? (granular?.scanPosition ?? undefined) : undefined,
      activeDrag: dragTarget,
      showSpectrum,
      slices: instrument.sample?.slices,
      selectedSliceId: showBeatSlicer ? selectedSliceId : null,
      offsetMarkers,
    };
    drawSampleWaveform(ctx, CANVAS_W, CANVAS_H, opts);
  }, [
    audioBuffer, viewStart, viewEnd,
    selectionStart, selectionEnd, loopEnabled, loopStart, loopEnd, loopType,
    playbackPosition, isGranular, granular, dragTarget, showSpectrum,
    showBeatSlicer, instrument.sample?.slices, selectedSliceId, offsetMarkers,
  ]);

  // ─── Canvas draw: minimap ────────────────────────────────────────
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_W * dpr) {
      canvas.width = CANVAS_W * dpr;
      canvas.height = MINIMAP_H * dpr;
      ctx.scale(dpr, dpr);
    }

    const opts: WaveformDrawOptions = {
      audioBuffer,
      viewStart: 0,
      viewEnd: 1,
      selectionStart,
      selectionEnd,
      loopEnabled,
      loopStart,
      loopEnd,
      loopType: loopType || 'forward',
      playbackPosition: 0,
      activeDrag: null,
      simplified: true,
      viewportRect: { start: viewStart, end: viewEnd },
    };
    drawSampleWaveform(ctx, CANVAS_W, MINIMAP_H, opts);
  }, [
    audioBuffer, viewStart, viewEnd,
    selectionStart, selectionEnd, loopEnabled, loopStart, loopEnd, loopType,
  ]);

  // ─── Granular helper ─────────────────────────────────────────────
  const updateGranular = useCallback(
    (key: string, value: string | number | boolean) => {
      updateInstrument(instrument.id, {
        granular: { ...DEFAULT_GRANULAR, ...instrument.granular, [key]: value },
      });
    },
    [instrument.id, instrument.granular, updateInstrument],
  );

  // ─── File handling ───────────────────────────────────────────────
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|flac|webm)$/i)) {
        setError('Invalid file type');
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setError('File too large (max 15MB)');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const duration = await new Promise<number>((resolve, reject) => {
          const audio = new Audio();
          audio.onloadedmetadata = () => resolve(audio.duration);
          audio.onerror = reject;
          audio.src = dataUrl;
        });
        const updates: Partial<InstrumentConfig> = {
          parameters: {
            ...instrument.parameters,
            sampleUrl: dataUrl,
            sampleInfo: { name: file.name, duration, size: file.size },
            loopStart: 0,
            loopEnd: 1,
          },
        };
        if (isGranular) {
          updates.granular = { ...DEFAULT_GRANULAR, ...instrument.granular, sampleUrl: dataUrl };
        }
        // If instrument.sample?.url exists it takes priority in sampleUrl derivation,
        // so we must also update it here to ensure the waveform useEffect re-fires.
        if (instrument.sample) {
          updates.sample = { ...instrument.sample, url: dataUrl };
        }
        updateInstrument(instrument.id, updates);
        clearSelection();
        showAll();
      } catch {
        setError('Failed to load audio file');
      } finally {
        setIsLoading(false);
      }
    },
    [instrument, updateInstrument, isGranular, clearSelection, showAll, setIsLoading, setError],
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── File drag & drop ───────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    isFileDraggingRef.current = true;
  };
  const handleDragLeave = () => {
    isFileDraggingRef.current = false;
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    isFileDraggingRef.current = false;
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ─── Canvas interaction helpers ──────────────────────────────────
  const getCanvasNorm = useCallback(
    (e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
      };
    },
    [],
  );

  const canvasXToNorm = useCallback(
    (cx: number) => viewStart + cx * (viewEnd - viewStart),
    [viewStart, viewEnd],
  );

  const canvasXToSample = useCallback(
    (cx: number) => {
      if (!audioBuffer) return 0;
      return Math.round(canvasXToNorm(cx) * audioBuffer.length);
    },
    [audioBuffer, canvasXToNorm],
  );

  // Hit-test handles
  const hitTestHandle = useCallback(
    (normX: number, normY: number): DragTarget => {
      const viewRange = viewEnd - viewStart;
      const hitRadius = 0.015 / (viewRange || 1);
      const pos = canvasXToNorm(normX);
      const handleZone = 0.12;

      // Loop handles (top OR bottom — easier to grab anywhere along the
      // edges, since start/end markers are gone)
      if (loopEnabled && (normY < handleZone || normY > 1 - handleZone)) {
        if (Math.abs(pos - loopStart) < hitRadius * viewRange) return 'loopStart';
        if (Math.abs(pos - loopEnd) < hitRadius * viewRange) return 'loopEnd';
      }
      // Fallback — anywhere on the canvas
      if (loopEnabled) {
        if (Math.abs(pos - loopStart) < hitRadius * viewRange) return 'loopStart';
        if (Math.abs(pos - loopEnd) < hitRadius * viewRange) return 'loopEnd';
      }
      return null;
    },
    [viewStart, viewEnd, loopStart, loopEnd, loopEnabled, canvasXToNorm],
  );

  // ─── Canvas mouse down ──────────────────────────────────────────
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (!audioBuffer) {
        fileInputRef.current?.click();
        return;
      }

      // Manual slice mode: add slice at click position
      const sliceConfig = instrument.sample?.sliceConfig;
      if (showBeatSlicer && sliceConfig?.mode === 'manual') {
        const { x } = getCanvasNorm(e);
        const framePos = canvasXToSample(x);
        const currentSlices = instrument.sample?.slices || [];

        const newSlices = addManualSlice(currentSlices, framePos, audioBuffer, sliceConfig);

        if (newSlices.length !== currentSlices.length) {
          updateInstrument(instrument.id, {
            sample: {
              ...instrument.sample,
              slices: newSlices,
            },
          });
        }
        return;
      }

      // Ctrl+Click: granular scan position
      if (isGranular && (e.ctrlKey || e.metaKey)) {
        const { x } = getCanvasNorm(e);
        updateGranular('scanPosition', canvasXToNorm(x) * 100);
        return;
      }
      const { x, y } = getCanvasNorm(e);
      const handle = hitTestHandle(x, y);
      if (handle) {
        setDragTarget(handle);
        dragTargetRef.current = handle;
        return;
      }
      // Start range selection
      const sample = canvasXToSample(x);
      selectionDragStart.current = sample;
      setDragTarget('selection');
      dragTargetRef.current = 'selection';
      setSelection(sample, sample);
    },
    [
      audioBuffer, isGranular, getCanvasNorm, hitTestHandle, setDragTarget,
      dragTargetRef, canvasXToSample, canvasXToNorm, setSelection, updateGranular,
      showBeatSlicer, instrument, updateInstrument,
    ],
  );

  // ─── Window-level mouse move/up for dragging ────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const target = dragTargetRef.current;
      if (!target) return;
      const { x } = getCanvasNorm(e);
      const pos = canvasXToNorm(x);

      switch (target) {
        case 'loopStart':
          updateParam('loopStart', Math.max(0, Math.min(pos, loopEnd - 0.005)));
          break;
        case 'loopEnd':
          updateParam('loopEnd', Math.min(1, Math.max(pos, loopStart + 0.005)));
          break;
        case 'selection': {
          if (!audioBuffer) break;
          const sample = canvasXToSample(x);
          const lo = Math.min(selectionDragStart.current, sample);
          const hi = Math.max(selectionDragStart.current, sample);
          setSelection(Math.max(0, lo), Math.min(audioBuffer.length, hi));
          break;
        }
      }
    };

    const handleMouseUp = () => {
      const target = dragTargetRef.current;
      if (target === 'selection' && selectionStart >= 0 && selectionEnd <= selectionStart + 1) {
        clearSelection();
      }
      setDragTarget(null);
      dragTargetRef.current = null;
      selectionDragStart.current = -1;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    getCanvasNorm, canvasXToNorm, canvasXToSample,
    loopStart, loopEnd, audioBuffer, selectionStart, selectionEnd,
    updateParam, setSelection, clearSelection, setDragTarget, dragTargetRef,
  ]);

  // ─── Canvas hover cursor ─────────────────────────────────────────
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!audioBuffer || dragTargetRef.current) return;
      const { x, y } = getCanvasNorm(e);
      const handle = hitTestHandle(x, y);
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = handle ? 'ew-resize' : 'crosshair';
    },
    [audioBuffer, getCanvasNorm, hitTestHandle, dragTargetRef],
  );

  // ─── Mouse wheel: zoom / scroll ──────────────────────────────────
  // Must use native addEventListener with { passive: false } to allow
  // preventDefault() — React's onWheel registers as passive in Chrome.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!audioBuffer) return;
      if (e.shiftKey) {
        scrollView(e.deltaY > 0 ? 1 : -1);
      } else {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        zoomAtPosition(e.deltaY > 0 ? 1.25 : 0.8, x);
      }
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [audioBuffer, zoomAtPosition, scrollView]);

  // ─── Minimap click ────────────────────────────────────────────────
  const handleMinimapClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = minimapRef.current;
      if (!canvas || !audioBuffer) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const range = viewEnd - viewStart;
      let ns = x - range / 2;
      let ne = ns + range;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > 1) { ns -= ne - 1; ne = 1; ns = Math.max(0, ns); }
      s.setView(ns, ne);
    },
    [audioBuffer, viewStart, viewEnd, s],
  );

  // ─── Preview playback ────────────────────────────────────────────
  const stopPreviewSources = useCallback(() => {
    for (const s of previewSourcesRef.current) {
      try { s.onended = null; } catch { /* ok */ }
      try { s.stop(); } catch { /* ok */ }
      try { s.disconnect(); } catch { /* ok */ }
    }
    previewSourcesRef.current = [];
  }, []);

  const handlePlay = useCallback(async () => {
    console.log('[SampleEditor] handlePlay called ' + JSON.stringify({
      hasBuffer: !!audioBuffer,
      isPlaying,
      sourcesActive: previewSourcesRef.current.length,
      loopEnabled,
      loopStart,
      loopEnd,
    }));
    if (!audioBuffer) {
      console.warn('[SampleEditor] handlePlay: no audioBuffer');
      return;
    }
    await Tone.start();

    // Toggle: stop if currently playing
    if (isPlaying || previewSourcesRef.current.length > 0) {
      console.log('[SampleEditor] handlePlay: stopping playback');
      stopPreviewSources();
      setIsPlaying(false);
      setPlaybackPosition(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const ctx = Tone.getContext().rawContext as AudioContext;
    const duration = audioBuffer.duration;
    if (!duration || duration <= 0) {
      console.warn('[SampleEditor] cannot play: audioBuffer has no duration');
      return;
    }

    // Pre-flip the buffer for reverse (AudioBufferSourceNode has no
    // built-in reverse property).
    let bufToPlay = audioBuffer;
    if (reverse) {
      bufToPlay = ctx.createBuffer(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        const dst = bufToPlay.getChannelData(ch);
        for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
      }
    }

    // Loop region comes ONLY from parameters.loopStart/loopEnd. The
    // instrument.sample.loopStart/loopEnd values are not authoritative
    // here — the bridge useEffect overwrites them from the parameters,
    // so they round-trip back to whatever the params say (including
    // defaults), which would force the loop region to be the full
    // buffer. The user must drag the loop markers (or use the sliders)
    // to set a real loop region.
    const loopStartNorm = Math.max(0, Math.min(0.99, loopStart));
    const loopEndNorm = Math.max(loopStartNorm + 0.001, Math.min(1, loopEnd));
    const loopStartSec = loopStartNorm * duration;
    const loopEndSec = loopEndNorm * duration;
    const totalFrames = audioBuffer.length;

    console.log('[SampleEditor] play raw values ' + JSON.stringify({
      loopEnabled,
      loopStart_param: loopStart,
      loopEnd_param: loopEnd,
      totalFrames,
      duration,
      loopStartNorm,
      loopEndNorm,
      loopStartSec,
      loopEndSec,
    }));

    const now = ctx.currentTime;
    setIsPlaying(true);

    if (loopEnabled) {
      // === TWO-SOURCE SCHEDULING ===
      // Chrome clamps source.start(when, offset) to loopStart whenever
      // loop=true and offset < loopStart, so a single source can't
      // produce "play attack then loop". Workaround:
      //   1) attack source: loop=false, plays 0 → loopEnd as a one-shot
      //   2) loop source:   loop=true, scheduled to overlap the last
      //                     XFADE_SEC of the attack and fade in over
      //                     the same window. Equal-power crossfade
      //                     masks the sample-level discontinuity at
      //                     the handoff (attack ends at ~s[loopEnd-1],
      //                     loop begins at s[loopStart]).
      // Behavior depends on loopType:
      //   'forward'  → loops [loopStart, loopEnd]
      //   'pingpong' → loops a pre-built pingpong cycle buffer
      //                (forward + reverse, mathematically continuous
      //                across the wrap and the fwd↔rev turn)
      const XFADE_SEC = 0.005;
      const attackBufferSec = loopEndSec;
      const attackWallSec = attackBufferSec / playbackRate;
      const attackEndTime = now + attackWallSec;
      const loopStartTime = Math.max(now, attackEndTime - XFADE_SEC);

      // Attack source + fade-out gain
      const attackGain = ctx.createGain();
      attackGain.gain.value = 1.0;
      attackGain.gain.setValueAtTime(1.0, loopStartTime);
      attackGain.gain.linearRampToValueAtTime(0.0001, attackEndTime);
      attackGain.connect(ctx.destination);

      const attackSrc = ctx.createBufferSource();
      attackSrc.buffer = bufToPlay;
      attackSrc.playbackRate.value = playbackRate;
      attackSrc.connect(attackGain);
      attackSrc.start(now, 0, attackBufferSec);

      // Loop source + fade-in gain
      const loopGain = ctx.createGain();
      loopGain.gain.value = 0.0001;
      loopGain.gain.setValueAtTime(0.0001, loopStartTime);
      loopGain.gain.linearRampToValueAtTime(1.0, attackEndTime);
      loopGain.connect(ctx.destination);

      const loopSrc = ctx.createBufferSource();
      loopSrc.playbackRate.value = playbackRate;
      loopSrc.loop = true;

      if (loopType === 'pingpong') {
        const startFrame = Math.round(loopStartNorm * totalFrames);
        const endFrame = Math.round(loopEndNorm * totalFrames);
        const fwdLen = endFrame - startFrame;
        const revLen = Math.max(0, fwdLen - 2);
        const cycleLen = fwdLen + revLen;
        if (cycleLen > 0) {
          // Cycle buffer:
          //   dst[0..fwdLen-1]            = src[loopStart..loopEnd-1]
          //   dst[fwdLen..fwdLen+revLen-1] = src[loopEnd-2..loopStart+1]
          // Wrap (last reverse → first forward) is s[loopStart+1] →
          //   s[loopStart] (adjacent in original). The fwd↔rev turn at
          //   the cycle midpoint is s[loopEnd-1] → s[loopEnd-2] (also
          //   adjacent). Both are mathematically continuous, so the
          //   pingpong loop has no internal discontinuities — only the
          //   attack→loop handoff (handled by the crossfade above).
          const cycleBuf = ctx.createBuffer(
            bufToPlay.numberOfChannels,
            cycleLen,
            bufToPlay.sampleRate,
          );
          for (let ch = 0; ch < bufToPlay.numberOfChannels; ch++) {
            const src = bufToPlay.getChannelData(ch);
            const dst = cycleBuf.getChannelData(ch);
            for (let i = 0; i < fwdLen; i++) {
              dst[i] = src[startFrame + i];
            }
            for (let i = 0; i < revLen; i++) {
              dst[fwdLen + i] = src[startFrame + fwdLen - 2 - i];
            }
          }
          loopSrc.buffer = cycleBuf;
          loopSrc.loopStart = 0;
          loopSrc.loopEnd = cycleLen / bufToPlay.sampleRate;
          loopSrc.connect(loopGain);
          loopSrc.start(loopStartTime, 0);
        } else {
          // Loop region too small for pingpong — fall back to forward.
          loopSrc.buffer = bufToPlay;
          loopSrc.loopStart = loopStartSec;
          loopSrc.loopEnd = loopEndSec;
          loopSrc.connect(loopGain);
          loopSrc.start(loopStartTime, loopStartSec);
        }
      } else {
        // Forward loop
        loopSrc.buffer = bufToPlay;
        loopSrc.loopStart = loopStartSec;
        loopSrc.loopEnd = loopEndSec;
        loopSrc.connect(loopGain);
        loopSrc.start(loopStartTime, loopStartSec);
      }

      previewSourcesRef.current = [attackSrc, loopSrc];
    } else {
      // === ONE-SHOT === plays the entire sample once
      const src = ctx.createBufferSource();
      src.buffer = bufToPlay;
      src.playbackRate.value = playbackRate;
      src.connect(ctx.destination);
      src.start(now, 0);
      src.onended = () => {
        if (previewSourcesRef.current.includes(src)) {
          stopPreviewSources();
          setIsPlaying(false);
          setPlaybackPosition(0);
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
        }
      };
      previewSourcesRef.current = [src];
    }

    // Playhead animation
    const startCtxTime = now;
    const loopRegionDur = (loopEndSec - loopStartSec) / playbackRate;
    const preLoopDur = loopEndSec / playbackRate;

    const animate = () => {
      const elapsed = ctx.currentTime - startCtxTime;
      let progress: number;

      if (loopEnabled && loopRegionDur > 0) {
        if (elapsed < preLoopDur) {
          progress = (elapsed * playbackRate) / duration;
        } else if (loopType === 'pingpong') {
          // Pingpong: position oscillates between loopStart and loopEnd
          const cycleDur = 2 * loopRegionDur;
          const cycleElapsed = (elapsed - preLoopDur) % cycleDur;
          if (cycleElapsed < loopRegionDur) {
            progress = loopStartNorm + ((cycleElapsed / loopRegionDur) * (loopEndNorm - loopStartNorm));
          } else {
            const back = cycleElapsed - loopRegionDur;
            progress = loopEndNorm - ((back / loopRegionDur) * (loopEndNorm - loopStartNorm));
          }
        } else {
          // Forward loop
          const loopElapsed = (elapsed - preLoopDur) % loopRegionDur;
          progress = loopStartNorm + (loopElapsed * playbackRate) / duration;
        }
      } else {
        // One-shot — animate from 0 to 1 over the sample's natural duration
        progress = (elapsed * playbackRate) / duration;
        if (progress >= 1) return; // onended will clear state
      }

      setPlaybackPosition(progress);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [
    audioBuffer, isPlaying, playbackRate, reverse,
    loopEnabled, loopStart, loopEnd, loopType,
    setIsPlaying, setPlaybackPosition, stopPreviewSources,
  ]);

  // ─── Keyboard shortcuts (focus-gated) ─────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
      if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); doRedo(); return; }
      if (mod && e.key === 'y') { e.preventDefault(); doRedo(); return; }

      if (mod && e.key === 'x') { e.preventDefault(); doCut(); return; }
      if (mod && e.key === 'c') { e.preventDefault(); doCopy(); return; }
      if (mod && e.key === 'v') { e.preventDefault(); doPaste(); return; }

      if (mod && e.key === 'a') { e.preventDefault(); selectAll(); return; }
      if (e.key === 'Escape') {
        // Stop preview playback first (especially relevant when looping),
        // then clear any selection.
        if (isPlaying || previewSourcesRef.current.length > 0) handlePlay();
        clearSelection();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasSelection) { e.preventDefault(); doDelete(); }
        return;
      }

      if (e.key === ' ') { e.preventDefault(); handlePlay(); return; }

      if (e.key === '+' || e.key === '=') { zoomAtPosition(0.8, 0.5); return; }
      if (e.key === '-') { zoomAtPosition(1.25, 0.5); return; }
      if (e.key === '0') { showAll(); return; }

      if (e.key === 'ArrowLeft') { scrollView(-1); return; }
      if (e.key === 'ArrowRight') { scrollView(1); return; }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [
    doUndo, doRedo, doCut, doCopy, doPaste, selectAll, clearSelection,
    doDelete, hasSelection, zoomAtPosition, showAll, scrollView, handlePlay, isPlaying,
  ]);

  // ─── Clear sample ────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (isPlaying) {
      stopPreviewSources();
      setIsPlaying(false);
    }
    setAudioBuffer(null);
    clearSelection();
    updateInstrument(instrument.id, {
      parameters: { ...instrument.parameters, sampleUrl: null, sampleInfo: null },
      ...(isGranular
        ? { granular: { ...DEFAULT_GRANULAR, ...instrument.granular, sampleUrl: '' } }
        : {}),
    });
  }, [isPlaying, setIsPlaying, setAudioBuffer, clearSelection, instrument, updateInstrument, isGranular, stopPreviewSources]);

  // ─── Buffer processed (enhancer / resampler / beat sync / filter) ─
  const handleBufferProcessed = useCallback(
    async (result: ProcessedResult, prefix: string) => {
      const { buffer: newBuf, dataUrl } = result;
      setAudioBuffer(newBuf);
      updateInstrument(instrument.id, {
        parameters: {
          ...instrument.parameters,
          sampleUrl: dataUrl,
          sampleInfo: {
            name: sampleInfo?.name
              ? sampleInfo.name.startsWith(prefix + '_')
                ? sampleInfo.name
                : prefix + '_' + sampleInfo.name
              : prefix + '_Sample',
            duration: newBuf.duration,
            size: Math.round(((dataUrl.split(',')[1] || '').length * 3) / 4),
            sampleRate: newBuf.sampleRate,
            channels: newBuf.numberOfChannels,
          },
        },
      });
      // Force ToneEngine to recreate its Player with the new buffer
      try {
        const { getToneEngine } = await import('@engine/ToneEngine');
        getToneEngine().invalidateInstrument(instrument.id);
      } catch { /* ToneEngine not active */ }
    },
    [instrument.id, instrument.parameters, sampleInfo, updateInstrument, setAudioBuffer],
  );

  // ─── Format helpers ──────────────────────────────────────────────
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const ss = (sec % 60).toFixed(2);
    return m + ':' + ss.padStart(5, '0');
  };
  const formatSize = (b: number) => {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };
  const formatSamples = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  const zoomLevel = 1 / (viewEnd - viewStart);
  const isZoomed = viewEnd - viewStart < 0.999;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-3" ref={containerRef} tabIndex={0} style={{ outline: 'none' }}>
      {/* ─── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-text-primary text-sm font-bold flex items-center gap-2">
          {isGranular
            ? <Sparkles size={16} className="text-violet-400" />
            : <Music size={16} className="text-accent-primary" />}
          {isGranular ? 'GRANULAR SAMPLE' : 'SAMPLE EDITOR'}
        </h3>
        <div className="flex items-center gap-1.5">
          {audioBuffer && (
            <>
              <button
                onClick={() => setShowBeatSlicer(!showBeatSlicer)}
                className={
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ' +
                  (showBeatSlicer
                    ? 'bg-violet-500 text-text-primary'
                    : 'bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20')
                }
              >
                <Scissors size={11} />
                Slicer
              </button>
              <button
                onClick={() => setShowBeatSync(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20"
              >
                <Clock size={11} />
                Beat Sync
              </button>
              <button
                onClick={() => setShowSpectrumFilter(!showSpectrumFilter)}
                className={
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ' +
                  (showSpectrumFilter
                    ? 'bg-blue-500 text-text-primary'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20')
                }
              >
                <Filter size={11} />
                Filter
              </button>
              <button
                onClick={() => setShowResampleModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20"
              >
                <RefreshCcw size={11} />
                Resample
              </button>
              <button
                onClick={() => setShowMpcResampleModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
              >
                <Zap size={11} />
                MPC
              </button>
              <button
                onClick={() => setShowAudioToMidiModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
              >
                <Music size={11} />
                To MIDI
              </button>
              <button
                onClick={() => setShowEnhancer(!showEnhancer)}
                className={
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors ' +
                  (showEnhancer
                    ? 'bg-accent-primary text-text-inverse'
                    : 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30 hover:bg-accent-primary/20')
                }
              >
                <Wand2 size={11} />
                Enhance
              </button>
            </>
          )}
          {sampleInfo && (
            <span className="text-xs text-text-muted font-mono truncate max-w-[140px]">
              {sampleInfo.name}
            </span>
          )}
        </div>
      </div>

      {/* ─── Spectrum Filter Panel ───────────────────────────────── */}
      {showSpectrumFilter && (
        <SampleSpectrumFilter
          audioBuffer={audioBuffer}
          selectionStart={selectionStart}
          selectionEnd={selectionEnd}
          onApply={async (buf) => {
            const dataUrl = await bufferToDataUrl(buf);
            handleBufferProcessed({ buffer: buf, dataUrl }, 'Filter');
            setShowSpectrumFilter(false);
          }}
          onClose={() => setShowSpectrumFilter(false)}
        />
      )}

      {/* ─── Enhancement Panel ───────────────────────────────────── */}
      {showEnhancer && audioBuffer && (
        <SampleEnhancerPanel
          audioBuffer={audioBuffer}
          isLoading={isLoading}
          onBufferProcessed={(r: ProcessedResult) => handleBufferProcessed(r, 'Enhanced')}
        />
      )}

      {/* ─── Beat Slicer Panel ───────────────────────────────────── */}
      {showBeatSlicer && audioBuffer && (
        <BeatSlicerPanel
          instrument={instrument}
          audioBuffer={audioBuffer}
          selectedSliceId={selectedSliceId}
          onSliceSelect={setSelectedSliceId}
          onClose={() => setShowBeatSlicer(false)}
        />
      )}

      {/* ─── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-accent-error/20 border border-accent-error/40 rounded text-accent-error text-xs select-text cursor-text">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ─── UADE Live Params (enhanced-scan instruments only) ──── */}
      {(instrument.uadeChipRam?.sections?.volume != null ||
        instrument.uadeChipRam?.sections?.period != null) && (
        <UADELiveParamsBar instrument={instrument} />
      )}

      {/* ─── UADE Paula Debugger (all UADE instruments) ──────────── */}
      {instrument.uadeChipRam != null && (
        <UADEDebuggerPanel instruments={allInstruments} />
      )}

      {/* ─── Waveform canvas ─────────────────────────────────────── */}
      <div
        className={
          'relative rounded-lg overflow-hidden border-2 transition-colors ' +
          (isFileDraggingRef.current
            ? 'border-accent-primary border-dashed bg-accent-primary/10'
            : 'border-dark-border')
        }
        data-sample-drop-zone="true"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full h-[150px]"
          style={{ imageRendering: 'pixelated' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onDoubleClick={(e) => { e.preventDefault(); selectAll(); }}
        />
        {isLoading && (
          <div className="absolute inset-0 bg-dark-bg/80 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* ─── Minimap (when zoomed) ───────────────────────────────── */}
      {audioBuffer && isZoomed && (
        <canvas
          ref={minimapRef}
          width={CANVAS_W}
          height={MINIMAP_H}
          className="w-full h-[20px] rounded border border-dark-border cursor-pointer"
          style={{ imageRendering: 'pixelated' }}
          onClick={handleMinimapClick}
        />
      )}

      {/* ─── Hidden file input ───────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.webm,.opus,.aac,.m4a,.aiff,.aif"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* ═══════════════ Controls (always shown, disabled when empty) ═══════════════ */}
      <>
          {/* ─── Info bar ────────────────────────────────────────── */}
          {audioBuffer && sampleInfo ? (
            <div className="flex items-center justify-between text-[10px] font-mono text-text-muted px-1">
              <span>{formatDuration(sampleInfo.duration)} | {formatSize(sampleInfo.size)}</span>
              <span>
                {sampleInfo.sampleRate ? (sampleInfo.sampleRate / 1000).toFixed(1) + 'kHz' : ''}
                {sampleInfo.channels === 1 ? ' Mono' : sampleInfo.channels === 2 ? ' Stereo' : ''}
                {' | '}{audioBuffer.length.toLocaleString()} samples
              </span>
              {hasSelection && (
                <span className="text-blue-400">
                  Sel: {formatSamples(selectionLength)} ({((selectionLength / audioBuffer.length) * 100).toFixed(1)}%)
                </span>
              )}
              <span>Zoom: {zoomLevel.toFixed(1)}x</span>
            </div>
          ) : (
            <div className="flex items-center justify-center text-[10px] font-mono text-text-muted px-1">
              <span>No sample — click the waveform, upload a file, or record from mic</span>
            </div>
          )}

          {/* ─── Main toolbar ────────────────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* File & playback */}
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={12} />}
              onClick={() => fileInputRef.current?.click()}
              title="Replace sample with a file"
            >
              Replace
            </Button>
            <Button
              variant={isPlaying ? 'danger' : 'default'}
              size="sm"
              onClick={handlePlay}
              title={isPlaying ? 'Stop (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleClear}
              title="Remove sample"
            >
              <Trash2 size={14} />
            </Button>
            <RecordButton instrumentId={instrument.id} onRecorded={async (dataUrl, _duration, buffer) => {
              // Route through handleBufferProcessed so ToneEngine invalidates
              // its cached Player — otherwise the test keyboard plays the
              // stale sample while only our local Tone.Player has the new audio.
              await handleBufferProcessed({ buffer, dataUrl }, 'Recording');
              // Also update sample.url if the instrument has a sample object
              if (instrument.sample) {
                updateInstrument(instrument.id, { sample: { ...instrument.sample, url: dataUrl } });
              }
              clearSelection();
              showAll();
            }} />

            {/* Open Waveform Studio (chip-style cycle drawing) */}
            <Button
              variant="primary"
              size="sm"
              icon={<Waves size={12} />}
              onClick={() => setShowWaveformStudio(true)}
              title="Open Waveform Studio — draw single-cycle chip waveforms (Protracker, AHX, etc.)"
            >
              Studio
            </Button>

            <div className="w-px h-6 bg-dark-border mx-1" />

            {/* Undo / Redo */}
            <IconBtn onClick={doUndo} title={'Undo' + (undoLabel ? ': ' + undoLabel : '') + ' (Ctrl+Z)'} disabled={!canUndo}>
              <Undo2 size={14} />
            </IconBtn>
            {undoCount > 0 && <span className="text-[9px] font-mono text-text-muted -ml-1">{undoCount}</span>}
            <IconBtn onClick={doRedo} title={'Redo' + (redoLabel ? ': ' + redoLabel : '') + ' (Ctrl+Shift+Z)'} disabled={!canRedo}>
              <Redo2 size={14} />
            </IconBtn>
            {redoCount > 0 && <span className="text-[9px] font-mono text-text-muted -ml-1">{redoCount}</span>}

            <div className="w-px h-6 bg-dark-border mx-1" />

            {/* Clipboard */}
            <div className="flex items-center gap-0.5 bg-dark-bgSecondary p-0.5 rounded border border-dark-border">
              <IconBtn onClick={doCut} title="Cut (Ctrl+X)" disabled={!hasSelection}><Scissors size={13} /></IconBtn>
              <IconBtn onClick={doCopy} title="Copy (Ctrl+C)" disabled={!hasSelection}><Copy size={13} /></IconBtn>
              <IconBtn onClick={doPaste} title="Paste (Ctrl+V)" disabled={!clipboardBuffer}><ClipboardPaste size={13} /></IconBtn>
              <IconBtn onClick={doCrop} title="Crop to selection" disabled={!hasSelection}><Crop size={13} /></IconBtn>
              <IconBtn onClick={doDelete} title="Delete selection (Del)" disabled={!hasSelection}><Trash2 size={13} /></IconBtn>
              <IconBtn onClick={doSilence} title="Silence selection" disabled={!hasSelection}><VolumeX size={13} /></IconBtn>
            </div>

            <div className="w-px h-6 bg-dark-border mx-1" />

            {/* Processing */}
            <div className="flex items-center gap-0.5 bg-dark-bgSecondary p-0.5 rounded border border-dark-border">
              <IconBtn onClick={doFadeIn} title="Fade In" disabled={!hasSelection}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 14 L14 2" stroke="currentColor" strokeWidth="2" /><path d="M2 14 Q2 2 14 2" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" /></svg>
              </IconBtn>
              <IconBtn onClick={doFadeOut} title="Fade Out" disabled={!hasSelection}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2 L14 14" stroke="currentColor" strokeWidth="2" /><path d="M2 2 Q14 2 14 14" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" /></svg>
              </IconBtn>
              <IconBtn onClick={doVolumeUp} title="Volume +3dB"><Volume2 size={13} /></IconBtn>
              <IconBtn onClick={doVolumeDown} title="Volume -3dB"><Volume1 size={13} /></IconBtn>
              <IconBtn onClick={doReverse} title="Reverse"><FlipHorizontal size={13} /></IconBtn>
              <IconBtn onClick={doNormalize} title="Normalize"><Maximize2 size={13} /></IconBtn>
              <IconBtn onClick={() => setShowAmigaPal(true)} title="AmigaPal 8-bit (Perfect Amiga samples!)" className="text-amber-400 hover:text-amber-300"><Waves size={13} /></IconBtn>
              <IconBtn onClick={doDcRemoval} title="DC Offset Removal"><Activity size={13} /></IconBtn>
            </div>

            <div className="flex-1" />

            {/* View */}
            <IconBtn onClick={() => setShowSpectrum(!showSpectrum)} title="Toggle Spectrum View" active={showSpectrum}>
              <Waves size={14} />
            </IconBtn>

            <div className="w-px h-6 bg-dark-border mx-1" />

            {/* Zoom / scroll */}
            <IconBtn onClick={() => scrollView(-1)} title="Scroll Left" disabled={viewStart <= 0.001}>
              <ArrowLeft size={13} />
            </IconBtn>
            <IconBtn onClick={() => zoomAtPosition(0.7, 0.5)} title="Zoom In (+)" disabled={zoomLevel >= 100}>
              <ZoomIn size={13} />
            </IconBtn>
            <span className="text-[10px] font-mono text-text-muted w-8 text-center">{zoomLevel.toFixed(1)}x</span>
            <IconBtn onClick={() => zoomAtPosition(1.4, 0.5)} title="Zoom Out (-)" disabled={zoomLevel <= 1.01}>
              <ZoomOut size={13} />
            </IconBtn>
            <IconBtn onClick={() => scrollView(1)} title="Scroll Right" disabled={viewEnd >= 0.999}>
              <ArrowRight size={13} />
            </IconBtn>
            {isZoomed && (
              <IconBtn onClick={showAll} title="Show All (0)"><Eye size={13} /></IconBtn>
            )}
            {hasSelection && (
              <IconBtn onClick={zoomToSelection} title="Zoom to Selection"><Crop size={13} /></IconBtn>
            )}

            <div className="w-px h-6 bg-dark-border mx-1" />

            {/* Export */}
            <IconBtn onClick={doExportWav} title="Export as WAV"><Download size={14} /></IconBtn>
          </div>

          {/* ─── Parameters Panel ────────────────────────────────── */}
          <div className="panel p-3 rounded-lg space-y-3">
            {/* Base Note (Sampler) */}
            {instrument.synthType === 'Sampler' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-text-muted text-xs mb-1">BASE NOTE</label>
                  <div className="flex gap-1">
                    <CustomSelect
                      value={baseNote.replace(/\d/, '')}
                      onChange={(v) => {
                        const oct = baseNote.match(/\d/)?.[0] || '4';
                        updateParam('baseNote', v + oct);
                      }}
                      className="input flex-1"
                      options={NOTE_OPTIONS.map((n) => ({ value: n, label: n }))}
                    />
                    <CustomSelect
                      value={baseNote.match(/\d/)?.[0] || '4'}
                      onChange={(v) => {
                        const note = baseNote.replace(/\d/, '');
                        updateParam('baseNote', note + v);
                      }}
                      className="input w-14"
                      options={OCTAVE_OPTIONS.map((o) => ({ value: String(o), label: String(o) }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-text-muted text-xs mb-1">
                    {'PLAYBACK: '}<span className="text-accent-primary">{playbackRate.toFixed(2)}x</span>
                  </label>
                  <input
                    type="range" min="0.25" max="4" step="0.01"
                    value={playbackRate}
                    onChange={(e) => updateParam('playbackRate', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Reverse */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={reverse} onChange={(e) => { updateParam('reverse', e.target.checked); e.target.blur(); }} className="w-4 h-4 rounded" />
                <span className="font-mono text-text-secondary text-xs">REVERSE</span>
              </label>
            </div>

            {/* ─── Loop Section ───────────────────────────────────── */}
            <SampleLoopEditor
              loopEnabled={loopEnabled}
              loopStart={loopStart}
              loopEnd={loopEnd}
              loopType={loopType}
              updateParam={updateParam}
              doFindLoop={doFindLoop}
              doSnapLoopToZero={doSnapLoopToZero}
            />

            {/* ─── Granular controls ──────────────────────────────── */}
            {isGranular && granular && (
              <div className="border-t border-dark-border pt-3 space-y-3">
                <h4 className="font-mono text-violet-400 text-xs font-bold flex items-center gap-2">
                  <Sparkles size={12} />
                  GRANULAR
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-mono text-text-muted text-[10px] mb-1">
                      {'GRAIN: '}<span className="text-violet-400">{granular.grainSize}ms</span>
                    </label>
                    <input type="range" min="10" max="500" step="1" value={granular.grainSize}
                      onChange={(e) => updateGranular('grainSize', parseInt(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-[10px] mb-1">
                      {'OVERLAP: '}<span className="text-violet-400">{granular.grainOverlap}%</span>
                    </label>
                    <input type="range" min="0" max="100" step="1" value={granular.grainOverlap}
                      onChange={(e) => updateGranular('grainOverlap', parseInt(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-[10px] mb-1">
                      {'DENSITY: '}<span className="text-violet-400">{granular.density}</span>
                    </label>
                    <input type="range" min="1" max="16" step="1" value={granular.density}
                      onChange={(e) => updateGranular('density', parseInt(e.target.value))} className="w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-mono text-text-muted text-[10px] mb-1">
                      {'SCAN: '}<span className="text-violet-400">{granular.scanPosition.toFixed(0)}%</span>
                    </label>
                    <input type="range" min="0" max="100" step="0.1" value={granular.scanPosition}
                      onChange={(e) => updateGranular('scanPosition', parseFloat(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-[10px] mb-1">
                      {'SPEED: '}<span className="text-violet-400">{granular.scanSpeed}%</span>
                    </label>
                    <input type="range" min="-100" max="100" step="1" value={granular.scanSpeed}
                      onChange={(e) => updateGranular('scanSpeed', parseInt(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-[10px] mb-1">
                      {'PITCH RND: '}<span className="text-violet-400">{granular.randomPitch}%</span>
                    </label>
                    <input type="range" min="0" max="100" step="1" value={granular.randomPitch}
                      onChange={(e) => updateGranular('randomPitch', parseInt(e.target.value))} className="w-full" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={granular.reverse}
                    onChange={(e) => { updateGranular('reverse', e.target.checked); e.target.blur(); }} className="w-4 h-4 rounded" />
                  <span className="font-mono text-text-secondary text-xs">REVERSE GRAINS</span>
                </label>
              </div>
            )}
          </div>

          {/* ─── Help text ───────────────────────────────────────── */}
          <div className="text-[10px] text-text-muted leading-relaxed px-1">
            <span className="text-text-secondary">Drag handles</span>{' start/end \u2022 '}
            <span className="text-text-secondary">Click+drag</span>{' select range \u2022 '}
            <span className="text-text-secondary">Wheel</span>{' zoom \u2022 '}
            <span className="text-text-secondary">Shift+Wheel</span>{' scroll \u2022 '}
            <span className="text-text-secondary">Dbl-click</span>{' select all \u2022 '}
            <span className="text-text-secondary">Ctrl+Z</span>{' undo'}
            {loopEnabled && (
              <>{' \u2022 '}<span className="text-text-secondary">Drag blue handles</span>{' loop'}</>
            )}
            {isGranular && (
              <>{' \u2022 '}<span className="text-text-secondary">Ctrl+Click</span>{' granular pos'}</>
            )}
          </div>
      </>

      {/* ─── Empty state ─────────────────────────────────────────── */}
      {!audioBuffer && (
        <div className="text-center text-text-muted text-sm py-2">
          {instrument.synthType === 'Sampler' && 'Sampler maps the sample to C4 and pitches across the keyboard'}
          {instrument.synthType === 'Player' && 'Player plays the full sample as a one-shot or loop'}
          {instrument.synthType === 'GranularSynth' && 'Granular breaks the sample into tiny grains for texture and pads'}
        </div>
      )}

      {/* ─── AmiResamplerModal ───────────────────────────────────── */}
      <AmiResamplerModal
        isOpen={showResampleModal}
        onClose={() => setShowResampleModal(false)}
        audioBuffer={audioBuffer}
        onBufferProcessed={(r: ProcessedResult) => {
          setShowResampleModal(false);
          handleBufferProcessed(r, 'Ami');
        }}
      />

      {/* ─── MpcResamplerModal ───────────────────────────────────── */}
      <MpcResamplerModal
        isOpen={showMpcResampleModal}
        onClose={() => setShowMpcResampleModal(false)}
        audioBuffer={audioBuffer}
        onBufferProcessed={(r: ProcessedResult) => {
          setShowMpcResampleModal(false);
          handleBufferProcessed(r, 'MPC');
        }}
      />

      {/* ─── AudioToMidiModal ─────────────────────────────────────── */}
      <AudioToMidiModal
        isOpen={showAudioToMidiModal}
        onClose={() => setShowAudioToMidiModal(false)}
        audioBuffer={audioBuffer}
        instrument={instrument}
      />

      {/* ─── AmigaPalModal ────────────────────────────────────────── */}
      <AmigaPalModal
        isOpen={showAmigaPal}
        onClose={() => setShowAmigaPal(false)}
        buffer={audioBuffer}
        onApply={(r: ProcessedResult) => {
          setShowAmigaPal(false);
          handleBufferProcessed(r, 'AmigaPal');
        }}
      />

      {/* ─── BeatSyncDialog ────────────────────────────────────────── */}
      <BeatSyncDialog
        isOpen={showBeatSync}
        onClose={() => setShowBeatSync(false)}
        audioBuffer={audioBuffer}
        onApply={async (buf) => {
          setShowBeatSync(false);
          const dataUrl = await bufferToDataUrl(buf);
          handleBufferProcessed({ buffer: buf, dataUrl }, 'BeatSync');
        }}
      />

      {/* ─── Waveform Studio modal ───────────────────────────────── */}
      {showWaveformStudio && (
        <SampleWaveformStudioModal
          audioBuffer={audioBuffer}
          onClose={() => setShowWaveformStudio(false)}
          onCommit={async (buf, label) => {
            const dataUrl = await bufferToDataUrl(buf);
            handleBufferProcessed({ buffer: buf, dataUrl }, label);
            setShowWaveformStudio(false);
          }}
        />
      )}
    </div>
  );
};

/**
 * RecordButton — mic recording with input device dropdown, live level meter,
 * effects toggle (opens master effects dialog), and proper diagnostics.
 */
const RecordButton: React.FC<{
  instrumentId: number;
  onRecorded: (dataUrl: string, duration: number, buffer: AudioBuffer) => void | Promise<void>;
}> = ({ onRecorded }) => {
  const [recording, setRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [withEffects, setWithEffects] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showMasterFx, setShowMasterFx] = useState(false);
  const timerRef = useRef<number | null>(null);
  const meterRef = useRef<number | null>(null);

  // ── Always-on level meter (helps verify mic before recording) ──────
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const { getAudioInputManager } = await import('@engine/AudioInputManager');
        const mgr = getAudioInputManager();
        if (mounted && mgr.isConnected()) {
          setLevel(mgr.getInputLevel());
        }
      } catch { /* ignore */ }
    };
    const id = window.setInterval(tick, 80);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // ── Enumerate input devices on mount ────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      const { getAudioInputManager } = await import('@engine/AudioInputManager');
      const mgr = getAudioInputManager();
      const list = await mgr.getInputDevices();
      setDevices(list.map((d) => ({ deviceId: d.deviceId, label: d.label })));
      if (list.length > 0 && !deviceId) {
        setDeviceId(list[0].deviceId);
      }
    } catch (err) {
      console.error('[RecordButton] Failed to enumerate devices:', err);
    }
  }, [deviceId]);

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    try {
      const { getAudioInputManager } = await import('@engine/AudioInputManager');
      const mgr = getAudioInputManager();
      // Resume audio context if suspended (iOS, autoplay policies)
      try {
        const Tone = await import('tone');
        await Tone.start();
        const ctx = Tone.getContext().rawContext as AudioContext;
        if (ctx.state === 'suspended') await ctx.resume();
      } catch { /* ok */ }

      if (!mgr.isConnected() || (deviceId && mgr.getCurrentDeviceId() !== deviceId)) {
        const ok = await mgr.selectDevice(deviceId || undefined);
        if (!ok) {
          setError('Failed to access microphone. Check browser permissions.');
          return false;
        }
        setConnected(true);
        // Refresh device list now that we have permission (so labels show)
        await refreshDevices();
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [deviceId, refreshDevices]);

  const handleSelectDevice = useCallback(async (id: string) => {
    setDeviceId(id);
    setShowDeviceMenu(false);
    setError(null);
    try {
      const { getAudioInputManager } = await import('@engine/AudioInputManager');
      const mgr = getAudioInputManager();
      const ok = await mgr.selectDevice(id);
      setConnected(ok);
      if (!ok) setError('Failed to switch device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    const ok = await ensureConnected();
    if (!ok) return;

    const { getAudioInputManager } = await import('@engine/AudioInputManager');
    const mgr = getAudioInputManager();

    if (withEffects) {
      await mgr.enableEffectsRouting();
    }
    mgr.setMonitoring(true);
    try {
      mgr.startRecording(withEffects);
    } catch (err) {
      setError('startRecording failed: ' + (err instanceof Error ? err.message : String(err)));
      return;
    }
    setRecording(true);
    setElapsed(0);
    const start = Date.now();
    timerRef.current = window.setInterval(() => setElapsed((Date.now() - start) / 1000), 100);
    meterRef.current = window.setInterval(() => setLevel(mgr.getInputLevel()), 50);
  }, [withEffects, ensureConnected]);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (meterRef.current) { clearInterval(meterRef.current); meterRef.current = null; }
    setRecording(false);

    const { getAudioInputManager } = await import('@engine/AudioInputManager');
    const mgr = getAudioInputManager();
    mgr.setMonitoring(false);
    let buffer: AudioBuffer | null = null;
    try {
      buffer = await mgr.stopRecording();
    } catch (err) {
      setError('stopRecording failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    if (mgr.isEffectsRouted()) await mgr.disableEffectsRouting();

    if (!buffer || buffer.length === 0) {
      setError('Recording was empty. Check your input device and mic level.');
      return;
    }

    try {
      const { bufferToDataUrl } = await import('@utils/audio/SampleProcessing');
      const dataUrl = await bufferToDataUrl(buffer);
      await onRecorded(dataUrl, buffer.duration, buffer);
    } catch (err) {
      setError('Encode failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [onRecorded]);

  const toggleDeviceMenu = useCallback(async () => {
    if (!showDeviceMenu) {
      await refreshDevices();
    }
    setShowDeviceMenu(!showDeviceMenu);
  }, [showDeviceMenu, refreshDevices]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (meterRef.current) clearInterval(meterRef.current);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 relative">
      {/* Record / Stop button */}
      {recording ? (
        <Button
          variant="danger"
          size="sm"
          icon={<CircleDot size={12} />}
          onClick={stopRecording}
          title="Stop recording"
          className="animate-pulse"
        >
          {elapsed.toFixed(1)}s
        </Button>
      ) : (
        <Button
          variant={connected ? 'danger' : 'default'}
          size="sm"
          icon={<Mic size={12} />}
          onClick={startRecording}
          title="Record from microphone"
        >
          Record
        </Button>
      )}

      {/* Live level meter (always visible) */}
      <div
        className="w-14 h-3 bg-dark-bg rounded overflow-hidden border border-dark-border"
        title={`Input level: ${(level * 100).toFixed(0)}%`}
      >
        <div
          className={`h-full transition-all ${level > 0.85 ? 'bg-accent-error' : 'bg-accent-success'}`}
          style={{ width: `${Math.min(100, level * 300)}%` }}
        />
      </div>

      {/* Input device dropdown */}
      <Button
        variant="default"
        size="sm"
        onClick={toggleDeviceMenu}
        title="Select input device"
      >
        <Music size={12} />
        <ChevronDown size={10} />
      </Button>
      {showDeviceMenu && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-dark-bg border border-dark-border rounded shadow-xl min-w-[200px] py-1">
          {devices.length === 0 ? (
            <div className="px-3 py-2 text-[10px] font-mono text-text-muted">
              No input devices found.
              <br />
              Grant mic permission first.
            </div>
          ) : (
            devices.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => handleSelectDevice(d.deviceId)}
                className={`w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-dark-bgSecondary ${
                  d.deviceId === deviceId ? 'text-accent-highlight' : 'text-text-primary'
                }`}
              >
                {d.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* Effects: opens master effects dialog and enables effects routing */}
      <Button
        variant={withEffects ? 'primary' : 'default'}
        size="sm"
        icon={<Sparkles size={12} />}
        onClick={() => {
          setWithEffects(true);
          setShowMasterFx(true);
        }}
        title="Configure master effects applied to recording"
      >
        Effects
      </Button>

      {/* Error toast */}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-50 px-2 py-1 bg-accent-error/20 border border-accent-error/50 rounded text-[9px] font-mono text-accent-error max-w-[300px]">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Master Effects modal portal */}
      {showMasterFx && (
        <RecordingEffectsDialog onClose={() => setShowMasterFx(false)} />
      )}
    </div>
  );
};

/** Lazy-loaded MasterEffectsModal so we don't pull it into every Sample Editor */
const RecordingEffectsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [Modal, setModal] = useState<React.ComponentType<{ isOpen: boolean; onClose: () => void }> | null>(null);
  useEffect(() => {
    let mounted = true;
    import('@components/effects/MasterEffectsModal').then((m) => {
      if (mounted) setModal(() => m.MasterEffectsModal);
    });
    return () => { mounted = false; };
  }, []);
  if (!Modal) return null;
  return <Modal isOpen={true} onClose={onClose} />;
};

/**
 * SampleWaveformStudioModal — opens the Waveform Studio for a sample.
 *
 * Adapts the sample's AudioBuffer (Float32 -1..+1) to the studio's int
 * array format (0..maxValue). On commit, renders the studio waveform
 * back to a one-cycle AudioBuffer that can be used as a Protracker /
 * AHX / chip-music sample. The cycle gets played back at the sampler's
 * base note as a tonal source.
 *
 * If the sample is empty, opens at default 32 samples × 8-bit (a good
 * Amiga MOD starting point).
 */
const SampleWaveformStudioModal: React.FC<{
  audioBuffer: AudioBuffer | null;
  onClose: () => void;
  onCommit: (buf: AudioBuffer, label: string) => Promise<void>;
}> = ({ audioBuffer, onClose, onCommit }) => {
  // Build initial WavetableData from the existing sample (resampled to one cycle)
  // or default if there's no sample.
  const buildInitial = useCallback((): { id: number; data: number[]; len: number; max: number } => {
    const maxValue = 255; // 8-bit, matches Amiga sample resolution
    const len = 64; // single-cycle default — tweakable in the studio toolbar

    if (audioBuffer && audioBuffer.length > 0) {
      const channel = audioBuffer.getChannelData(0);
      // Resample down to `len` samples by taking every Nth sample (or interp)
      const out: number[] = [];
      const ratio = channel.length / len;
      const mid = maxValue / 2;
      // Find peak for normalization
      let peak = 0;
      for (let i = 0; i < channel.length; i++) {
        const a = Math.abs(channel[i]);
        if (a > peak) peak = a;
      }
      const gain = peak > 0 ? 1 / peak : 1;
      for (let i = 0; i < len; i++) {
        const srcPos = i * ratio;
        const idx = Math.floor(srcPos);
        const frac = srcPos - idx;
        const a = channel[idx] ?? 0;
        const b = channel[Math.min(channel.length - 1, idx + 1)] ?? 0;
        const v = (a + (b - a) * frac) * gain;
        out.push(Math.max(0, Math.min(maxValue, Math.round(v * mid + mid))));
      }
      return { id: 0, data: out, len, max: maxValue };
    }

    // Empty: a sine wave is a friendlier starting point than silence
    const out: number[] = [];
    const mid = maxValue / 2;
    for (let i = 0; i < len; i++) {
      out.push(Math.round(Math.sin((i / len) * Math.PI * 2) * mid + mid));
    }
    return { id: 0, data: out, len, max: maxValue };
  }, [audioBuffer]);

  const [wavetable, setWavetable] = React.useState<{ id: number; data: number[]; len?: number; max?: number }>(buildInitial);

  // Convert the int array back to a Float32 AudioBuffer at the audio context's
  // sample rate. The cycle is repeated enough times to be a usable sample
  // (the user can loop it in the sample editor for sustain).
  const handleCommit = useCallback(async () => {
    const { getDevilboxAudioContext } = await import('@utils/audio-context');
    let ctx: AudioContext;
    try { ctx = getDevilboxAudioContext(); }
    catch { ctx = new AudioContext(); }

    const max = wavetable.max ?? 255;
    const mid = max / 2;
    const cycle = wavetable.data.map((v) => (v - mid) / mid);

    // Render N cycles of the waveform so it's a usable note-length sample.
    // 16 cycles at 64-sample length = 1024 samples ≈ 21ms at 44.1kHz which
    // is a perfect tonal source. The sampler will pitch it across notes.
    const cyclesToRender = Math.max(8, Math.ceil(2048 / cycle.length));
    const totalSamples = cycle.length * cyclesToRender;

    const buf = ctx.createBuffer(1, totalSamples, ctx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < totalSamples; i++) {
      out[i] = cycle[i % cycle.length];
    }

    await onCommit(buf, 'Waveform Studio');
  }, [wavetable, onCommit]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-dark-bg border border-dark-border rounded-lg shadow-2xl w-full max-w-[1100px] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
          <div>
            <h2 className="text-sm font-mono font-bold text-text-primary uppercase tracking-wider">
              Waveform Studio — single-cycle sample
            </h2>
            <p className="text-[10px] font-mono text-text-muted">
              Draw a chip-style waveform. On save, it's rendered as a looped sample for Protracker / AHX / etc.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded text-text-muted hover:text-text-primary border border-dark-border"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <WavetableEditor
            wavetable={wavetable}
            onChange={setWavetable}
            initialLayout="studio"
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-dark-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase bg-dark-bgSecondary text-text-muted hover:text-text-primary border border-dark-border"
          >
            Cancel
          </button>
          <button
            onClick={handleCommit}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold uppercase bg-accent-highlight/20 text-accent-highlight hover:bg-accent-highlight/30 border border-accent-highlight/50"
          >
            Save as sample
          </button>
        </div>
      </div>
    </div>
  );
};
