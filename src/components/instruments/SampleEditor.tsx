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

import React, { useRef, useCallback, useEffect } from 'react';
import {
  Upload, Trash2, Music, Play, Square, AlertCircle,
  ZoomIn, ZoomOut, Repeat, Sparkles, Wand2, RefreshCcw,
  Scissors, Copy, ClipboardPaste, Crop, VolumeX, Volume2, Volume1,
  Undo2, Redo2, Eye, Download,
  ArrowLeft, ArrowRight, Maximize2, FlipHorizontal,
  Activity, Waves
} from 'lucide-react';
import { useInstrumentStore } from '../../stores';
import type { InstrumentConfig, DeepPartial } from '../../types/instrument';
import { DEFAULT_GRANULAR } from '../../types/instrument';
import * as Tone from 'tone';
import { SampleEnhancerPanel } from './SampleEnhancerPanel';
import { AmiResamplerModal } from './AmiResamplerModal';
import { AmigaPalModal } from './AmigaPalModal';
import { BeatSlicerPanel } from './BeatSlicerPanel';
import type { ProcessedResult } from '../../utils/audio/SampleProcessing';
import { bufferToDataUrl } from '../../utils/audio/SampleProcessing';
import { drawSampleWaveform } from '../../utils/audio/drawSampleWaveform';
import type { WaveformDrawOptions } from '../../utils/audio/drawSampleWaveform';
import { useSampleEditorState } from '../../hooks/useSampleEditorState';
import type { DragTarget } from '../../hooks/useSampleEditorState';

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

  // ─── Persist callbacks for the state hook ────────────────────────
  const onPersistBuffer = useCallback(
    async (buffer: AudioBuffer, label: string) => {
      const dataUrl = await bufferToDataUrl(buffer);
      updateInstrument(instrument.id, {
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
      });
    },
    [instrument.id, instrument.parameters, sampleInfo, updateInstrument],
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
    showBeatSlicer,
    setShowBeatSlicer,
    showAmigaPal,
    setShowAmigaPal,
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
    params: editorParams,
    updateParam,
  } = s;

  const {
    startTime,
    endTime,
    loopEnabled,
    loopStart,
    loopEnd,
    loopType,
    baseNote,
    playbackRate,
    reverse,
  } = editorParams;

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
        playerRef.current = new Tone.Player(sampleUrl).toDestination();
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
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleUrl]);

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
      startTime,
      endTime,
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
      slices: showBeatSlicer ? instrument.sample?.slices : undefined,
    };
    drawSampleWaveform(ctx, CANVAS_W, CANVAS_H, opts);
  }, [
    audioBuffer, viewStart, viewEnd, startTime, endTime,
    selectionStart, selectionEnd, loopEnabled, loopStart, loopEnd, loopType,
    playbackPosition, isGranular, granular, dragTarget, showSpectrum,
    showBeatSlicer, instrument.sample?.slices,
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
      startTime,
      endTime,
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
    audioBuffer, viewStart, viewEnd, startTime, endTime,
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
            startTime: 0,
            endTime: 1,
            loopStart: 0,
            loopEnd: 1,
          },
        };
        if (isGranular) {
          updates.granular = { ...DEFAULT_GRANULAR, ...instrument.granular, sampleUrl: dataUrl };
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

      // Top: start/end handles
      if (normY < handleZone) {
        if (Math.abs(pos - startTime) < hitRadius * viewRange) return 'start';
        if (Math.abs(pos - endTime) < hitRadius * viewRange) return 'end';
      }
      // Bottom: loop handles
      if (loopEnabled && normY > 1 - handleZone) {
        if (Math.abs(pos - loopStart) < hitRadius * viewRange) return 'loopStart';
        if (Math.abs(pos - loopEnd) < hitRadius * viewRange) return 'loopEnd';
      }
      // Fallback
      if (Math.abs(pos - startTime) < hitRadius * viewRange) return 'start';
      if (Math.abs(pos - endTime) < hitRadius * viewRange) return 'end';
      if (loopEnabled) {
        if (Math.abs(pos - loopStart) < hitRadius * viewRange) return 'loopStart';
        if (Math.abs(pos - loopEnd) < hitRadius * viewRange) return 'loopEnd';
      }
      return null;
    },
    [viewStart, viewEnd, startTime, endTime, loopStart, loopEnd, loopEnabled, canvasXToNorm],
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
        case 'start':
          updateParam('startTime', Math.max(0, Math.min(pos, endTime - 0.005)));
          break;
        case 'end':
          updateParam('endTime', Math.min(1, Math.max(pos, startTime + 0.005)));
          break;
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
    getCanvasNorm, canvasXToNorm, canvasXToSample, startTime, endTime,
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
  const handlePlay = useCallback(async () => {
    if (!playerRef.current || !audioBuffer) return;
    await Tone.start();

    if (isPlaying) {
      playerRef.current.stop();
      setIsPlaying(false);
      setPlaybackPosition(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    playerRef.current.playbackRate = playbackRate;
    playerRef.current.reverse = reverse;

    const startOffset = startTime * audioBuffer.duration;
    const dur = (endTime - startTime) * audioBuffer.duration;
    playerRef.current.start(Tone.now(), startOffset, dur);
    setIsPlaying(true);

    const startToneTime = Tone.now();
    const animate = () => {
      const elapsed = Tone.now() - startToneTime;
      const progress = startTime + (elapsed / audioBuffer.duration) * (endTime - startTime) / playbackRate;
      if (progress >= endTime) {
        setIsPlaying(false);
        setPlaybackPosition(0);
        return;
      }
      setPlaybackPosition(progress);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [audioBuffer, isPlaying, playbackRate, reverse, startTime, endTime, setIsPlaying, setPlaybackPosition]);

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
      if (e.key === 'Escape') { clearSelection(); return; }
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
    doDelete, hasSelection, zoomAtPosition, showAll, scrollView, handlePlay,
  ]);

  // ─── Clear sample ────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (isPlaying) { playerRef.current?.stop(); setIsPlaying(false); }
    setAudioBuffer(null);
    clearSelection();
    updateInstrument(instrument.id, {
      parameters: { ...instrument.parameters, sampleUrl: null, sampleInfo: null },
      ...(isGranular
        ? { granular: { ...DEFAULT_GRANULAR, ...instrument.granular, sampleUrl: '' } }
        : {}),
    });
  }, [isPlaying, setIsPlaying, setAudioBuffer, clearSelection, instrument, updateInstrument, isGranular]);

  // ─── Buffer processed (enhancer / resampler) ─────────────────────
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
                    ? 'bg-violet-500 text-white'
                    : 'bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20')
                }
              >
                <Scissors size={11} />
                Slicer
              </button>
              <button
                onClick={() => setShowResampleModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors bg-orange-500/10 text-orange-400 border border-orange-500/30 hover:bg-orange-500/20"
              >
                <RefreshCcw size={11} />
                Resample
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
          onClose={() => setShowBeatSlicer(false)}
        />
      )}

      {/* ─── Error ───────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-2 bg-accent-error/20 border border-accent-error/40 rounded text-accent-error text-xs">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* ─── Waveform canvas ─────────────────────────────────────── */}
      <div
        className={
          'relative rounded-lg overflow-hidden border-2 transition-colors ' +
          (isFileDraggingRef.current
            ? 'border-accent-primary border-dashed bg-accent-primary/10'
            : 'border-dark-border') +
          (!audioBuffer ? ' cursor-pointer hover:border-accent-primary/50' : '')
        }
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !audioBuffer && fileInputRef.current?.click()}
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
        accept="audio/*,.wav,.mp3,.ogg,.flac,.webm"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* ═══════════════ Controls (when sample loaded) ═══════════════ */}
      {audioBuffer && sampleInfo && (
        <>
          {/* ─── Info bar ────────────────────────────────────────── */}
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

          {/* ─── Main toolbar ────────────────────────────────────── */}
          <div className="flex items-center gap-1 flex-wrap">
            {/* File & playback */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-accent-primary/20 text-accent-primary rounded hover:bg-accent-primary/30 transition-colors text-xs"
            >
              <Upload size={12} />
              Replace
            </button>
            <button
              onClick={handlePlay}
              className={
                'p-1.5 rounded transition-colors ' +
                (isPlaying ? 'bg-accent-error/20 text-accent-error' : 'bg-accent-success/20 text-accent-success')
              }
              title={isPlaying ? 'Stop (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Square size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 bg-accent-error/20 text-accent-error rounded hover:bg-accent-error/30 transition-colors"
              title="Remove sample"
            >
              <Trash2 size={14} />
            </button>

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
                    <select
                      value={baseNote.replace(/\d/, '')}
                      onChange={(e) => {
                        const oct = baseNote.match(/\d/)?.[0] || '4';
                        updateParam('baseNote', e.target.value + oct);
                      }}
                      className="input flex-1"
                    >
                      {NOTE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select
                      value={baseNote.match(/\d/)?.[0] || '4'}
                      onChange={(e) => {
                        const note = baseNote.replace(/\d/, '');
                        updateParam('baseNote', note + e.target.value);
                      }}
                      className="input w-14"
                    >
                      {OCTAVE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
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

            {/* Start / End */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-text-muted text-xs mb-1">
                  {'START: '}<span className="text-accent-success">{(startTime * 100).toFixed(1)}%</span>
                </label>
                <input
                  type="range" min="0" max="0.99" step="0.001" value={startTime}
                  onChange={(e) => updateParam('startTime', Math.min(parseFloat(e.target.value), endTime - 0.01))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block font-mono text-text-muted text-xs mb-1">
                  {'END: '}<span className="text-accent-secondary">{(endTime * 100).toFixed(1)}%</span>
                </label>
                <input
                  type="range" min="0.01" max="1" step="0.001" value={endTime}
                  onChange={(e) => updateParam('endTime', Math.max(parseFloat(e.target.value), startTime + 0.01))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Reverse */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={reverse} onChange={(e) => { updateParam('reverse', e.target.checked); e.target.blur(); }} className="w-4 h-4 rounded" />
                <span className="font-mono text-text-secondary text-xs">REVERSE</span>
              </label>
            </div>

            {/* ─── Loop Section ───────────────────────────────────── */}
            <div className="border-t border-dark-border pt-3">
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={loopEnabled} onChange={(e) => { updateParam('loopEnabled', e.target.checked); e.target.blur(); }} className="w-4 h-4 rounded" />
                  <Repeat size={14} className="text-blue-400" />
                  <span className="font-mono text-text-secondary text-xs">LOOP</span>
                </label>

                {loopEnabled && (
                  <>
                    <div className="flex items-center gap-0.5 bg-dark-bgSecondary rounded border border-dark-border p-0.5 ml-2">
                      <button
                        onClick={() => updateParam('loopType', 'forward')}
                        className={
                          'px-2 py-0.5 rounded text-[10px] font-mono transition-colors ' +
                          (loopType === 'forward' || !loopType ? 'bg-blue-500/30 text-blue-400' : 'text-text-muted hover:bg-white/5')
                        }
                        title="Forward loop"
                      >{'\u2192'}</button>
                      <button
                        onClick={() => updateParam('loopType', 'pingpong')}
                        className={
                          'px-2 py-0.5 rounded text-[10px] font-mono transition-colors ' +
                          (loopType === 'pingpong' ? 'bg-blue-500/30 text-blue-400' : 'text-text-muted hover:bg-white/5')
                        }
                        title="Ping-pong loop"
                      >{'\u2194'}</button>
                    </div>
                    <button
                      onClick={doFindLoop}
                      className="px-2 py-0.5 rounded text-[10px] font-mono text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors ml-auto"
                      title="Auto-find best loop point"
                    >Auto</button>
                  </>
                )}
              </div>

              {loopEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-1">
                      {'LOOP START: '}<span className="text-blue-400">{(loopStart * 100).toFixed(1)}%</span>
                    </label>
                    <input
                      type="range" min="0" max="0.99" step="0.001" value={loopStart}
                      onChange={(e) => updateParam('loopStart', Math.min(parseFloat(e.target.value), loopEnd - 0.01))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-text-muted text-xs mb-1">
                      {'LOOP END: '}<span className="text-blue-400">{(loopEnd * 100).toFixed(1)}%</span>
                    </label>
                    <input
                      type="range" min="0.01" max="1" step="0.001" value={loopEnd}
                      onChange={(e) => updateParam('loopEnd', Math.max(parseFloat(e.target.value), loopStart + 0.01))}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>

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
      )}

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
    </div>
  );
};
