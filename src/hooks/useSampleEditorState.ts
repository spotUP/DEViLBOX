/**
 * useSampleEditorState - Centralized state & logic for SampleEditor
 *
 * Combines view/zoom/scroll, selection, loop, undo/redo, clipboard,
 * and keyboard shortcuts into a single hook.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { SampleUndoManager } from '../lib/audio/SampleUndoManager';
import type { UndoState } from '../lib/audio/SampleUndoManager';
import { WaveformProcessor } from '../lib/audio/WaveformProcessor';
import { notify } from '../stores/useNotificationStore';

// ─── Types ─────────────────────────────────────────────────────────────

export type DragTarget = 'start' | 'end' | 'loopStart' | 'loopEnd' | 'selection' | null;
export type LoopType = 'off' | 'forward' | 'pingpong';

export interface SampleEditorParams {
  startTime: number;
  endTime: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  loopType: LoopType;
  baseNote: string;
  playbackRate: number;
  reverse: boolean;
}

export interface SampleEditorState {
  // Audio
  audioBuffer: AudioBuffer | null;
  setAudioBuffer: (buf: AudioBuffer | null) => void;

  // View window (0–1)
  viewStart: number;
  viewEnd: number;
  setView: (start: number, end: number) => void;
  zoomAtPosition: (factor: number, normX: number) => void;
  scrollView: (delta: number) => void;
  showAll: () => void;
  zoomToSelection: () => void;
  
  // Selection (sample indices)
  selectionStart: number;
  selectionEnd: number;
  setSelection: (start: number, end: number) => void;
  clearSelection: () => void;
  selectAll: () => void;
  hasSelection: boolean;
  selectionLength: number;

  // Drag
  dragTarget: DragTarget;
  setDragTarget: (t: DragTarget) => void;
  dragTargetRef: React.MutableRefObject<DragTarget>;

  // Clipboard
  clipboardBuffer: AudioBuffer | null;

  // Undo
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undoCount: number;
  redoCount: number;

  // Display
  showSpectrum: boolean;
  setShowSpectrum: (v: boolean) => void;
  showEnhancer: boolean;
  setShowEnhancer: (v: boolean) => void;
  showResampleModal: boolean;
  setShowResampleModal: (v: boolean) => void;
  showBeatSlicer: boolean;
  setShowBeatSlicer: (v: boolean) => void;

  // Playback
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  playbackPosition: number;
  setPlaybackPosition: (v: number) => void;

  // Loading
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;

  // Operations (all push undo state)
  doCut: () => Promise<void>;
  doCopy: () => void;
  doPaste: () => Promise<void>;
  doCrop: () => Promise<void>;
  doDelete: () => Promise<void>;
  doSilence: () => Promise<void>;
  doFadeIn: () => Promise<void>;
  doFadeOut: () => Promise<void>;
  doVolumeUp: () => Promise<void>;
  doVolumeDown: () => Promise<void>;
  doReverse: () => Promise<void>;
  doNormalize: () => Promise<void>;
  doDcRemoval: () => Promise<void>;
  doUndo: () => void;
  doRedo: () => void;
  doExportWav: () => Promise<void>;
  doFindLoop: () => void;

  // Params
  params: SampleEditorParams;
  updateParam: (key: string, value: string | number | boolean | null) => void;
}

interface UseSampleEditorStateOptions {
  instrumentId: number;
  instrumentParameters: Record<string, unknown> | undefined;
  onPersistBuffer: (buffer: AudioBuffer, label: string) => Promise<void>;
  onUpdateParams: (updates: Record<string, unknown>) => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSampleEditorState(opts: UseSampleEditorStateOptions): SampleEditorState {
  const { instrumentId, instrumentParameters, onPersistBuffer, onUpdateParams } = opts;

  // ─── Audio buffer ────────────────────────────────────────────────
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // ─── View window ─────────────────────────────────────────────────
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(1);

  const setView = useCallback((start: number, end: number) => {
    const s = Math.max(0, Math.min(start, 0.9999));
    const e = Math.max(s + 0.0001, Math.min(end, 1));
    setViewStart(s);
    setViewEnd(e);
  }, []);

  const zoomAtPosition = useCallback((factor: number, normX: number) => {
    const currentRange = viewEnd - viewStart;
    const newRange = Math.max(0.001, Math.min(1, currentRange * factor));
    // Center on mouse position
    const viewPos = viewStart + normX * currentRange;
    let newStart = viewPos - normX * newRange;
    let newEnd = newStart + newRange;
    // Clamp
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > 1) { newStart -= (newEnd - 1); newEnd = 1; newStart = Math.max(0, newStart); }
    setView(newStart, newEnd);
  }, [viewStart, viewEnd, setView]);

  const scrollView = useCallback((delta: number) => {
    const range = viewEnd - viewStart;
    const shift = delta * range * 0.25;
    let ns = viewStart + shift;
    let ne = viewEnd + shift;
    if (ns < 0) { ne -= ns; ns = 0; }
    if (ne > 1) { ns -= (ne - 1); ne = 1; ns = Math.max(0, ns); }
    setView(ns, ne);
  }, [viewStart, viewEnd, setView]);

  const showAll = useCallback(() => setView(0, 1), [setView]);

  // ─── Selection ───────────────────────────────────────────────────
  const [selectionStart, setSelectionStart] = useState(-1);
  const [selectionEnd, setSelectionEnd] = useState(-1);
  const hasSelection = selectionStart >= 0 && selectionEnd > selectionStart;
  const selectionLength = hasSelection ? selectionEnd - selectionStart : 0;

  const setSelection = useCallback((start: number, end: number) => {
    setSelectionStart(start);
    setSelectionEnd(end);
  }, []);

  const clearSelection = useCallback(() => { setSelectionStart(-1); setSelectionEnd(-1); }, []);

  const selectAll = useCallback(() => {
    if (!audioBuffer) return;
    setSelection(0, audioBuffer.length);
  }, [audioBuffer, setSelection]);

  const zoomToSelection = useCallback(() => {
    if (!hasSelection || !audioBuffer) return;
    const total = audioBuffer.length;
    const padding = (selectionEnd - selectionStart) * 0.1;
    setView(
      Math.max(0, (selectionStart - padding) / total),
      Math.min(1, (selectionEnd + padding) / total),
    );
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, setView]);

  // ─── Drag ────────────────────────────────────────────────────────
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const dragTargetRef = useRef<DragTarget>(null);

  // ─── Clipboard ───────────────────────────────────────────────────
  const [clipboardBuffer, setClipboardBuffer] = useState<AudioBuffer | null>(null);

  // ─── Undo/Redo ───────────────────────────────────────────────────
  const undoManager = useRef(new SampleUndoManager(20));
  const [undoInfo, setUndoInfo] = useState({
    canUndo: false, canRedo: false,
    undoLabel: null as string | null, redoLabel: null as string | null,
    undoCount: 0, redoCount: 0,
  });
  const { canUndo, canRedo, undoLabel, redoLabel, undoCount, redoCount } = undoInfo;

  // Call this after any undo stack mutation to sync state
  const syncUndoState = useCallback(() => {
    const mgr = undoManager.current;
    const sizes = mgr.getStackSizes();
    setUndoInfo({
      canUndo: mgr.canUndo(),
      canRedo: mgr.canRedo(),
      undoLabel: mgr.getUndoLabel(),
      redoLabel: mgr.getRedoLabel(),
      undoCount: sizes.undo,
      redoCount: sizes.redo,
    });
  }, []);

  const paramsRef = useRef(instrumentParameters);
  useEffect(() => { paramsRef.current = instrumentParameters; }, [instrumentParameters]);

  const getCurrentUndoState = useCallback((): UndoState | null => {
    if (!audioBuffer) return null;
    const p = paramsRef.current || {};
    return {
      buffer: SampleUndoManager.cloneBuffer(audioBuffer),
      label: '',
      loopStart: (p.loopStart as number) ?? 0,
      loopEnd: (p.loopEnd as number) ?? 1,
      loopType: ((p.loopType as LoopType) || (p.loopEnabled ? 'forward' : 'off')),
    };
  }, [audioBuffer]);

  const pushUndo = useCallback((label: string) => {
    const state = getCurrentUndoState();
    if (state) {
      state.label = label;
      undoManager.current.pushState(state);
      syncUndoState();
    }
  }, [getCurrentUndoState, syncUndoState]);

  const applyUndoState = useCallback(async (state: UndoState) => {
    setAudioBuffer(state.buffer);
    onUpdateParams({
      loopStart: state.loopStart,
      loopEnd: state.loopEnd,
      loopType: state.loopType,
      loopEnabled: state.loopType !== 'off',
    });
    await onPersistBuffer(state.buffer, 'Undo/Redo');
    syncUndoState();
  }, [onPersistBuffer, onUpdateParams, syncUndoState]);

  const doUndo = useCallback(() => {
    const current = getCurrentUndoState();
    if (!current) return;
    current.label = 'current';
    const prev = undoManager.current.undo(current);
    if (prev) applyUndoState(prev);
  }, [getCurrentUndoState, applyUndoState]);

  const doRedo = useCallback(() => {
    const current = getCurrentUndoState();
    if (!current) return;
    current.label = 'current';
    const next = undoManager.current.redo(current);
    if (next) applyUndoState(next);
  }, [getCurrentUndoState, applyUndoState]);

  // ─── Display toggles ────────────────────────────────────────────
  const [showSpectrum, setShowSpectrum] = useState(false);
  const [showEnhancer, setShowEnhancer] = useState(false);
  const [showResampleModal, setShowResampleModal] = useState(false);
  const [showBeatSlicer, setShowBeatSlicer] = useState(false);

  // ─── Playback ────────────────────────────────────────────────────
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  // ─── Loading ─────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Params (derived from instrument parameters) ─────────────────
  const params = useMemo((): SampleEditorParams => {
    const p = instrumentParameters || {};
    return {
      startTime: (p.startTime as number) ?? 0,
      endTime: (p.endTime as number) ?? 1,
      loopEnabled: (p.loopEnabled as boolean) ?? false,
      loopStart: (p.loopStart as number) ?? 0,
      loopEnd: (p.loopEnd as number) ?? 1,
      loopType: (p.loopType as LoopType) ?? 'forward',
      baseNote: (p.baseNote as string) ?? 'C4',
      playbackRate: (p.playbackRate as number) ?? 1,
      reverse: (p.reverse as boolean) ?? false,
    };
  }, [instrumentParameters]);

  const updateParam = useCallback((key: string, value: string | number | boolean | null) => {
    onUpdateParams({ [key]: value });
  }, [onUpdateParams]);

  // ─── Destructive operations (with undo) ──────────────────────────

  const applyOperation = useCallback(async (
    label: string,
    operation: (buffer: AudioBuffer) => AudioBuffer,
  ): Promise<void> => {
    if (!audioBuffer) return;
    pushUndo(label);
    const result = operation(audioBuffer);
    setAudioBuffer(result);
    await onPersistBuffer(result, label);
    notify.success(label);
  }, [audioBuffer, pushUndo, onPersistBuffer]);

  const doCut = useCallback(async () => {
    if (!hasSelection || !audioBuffer) return;
    pushUndo('Cut');
    const { remaining, cut } = WaveformProcessor.cut(audioBuffer, selectionStart, selectionEnd);
    setClipboardBuffer(cut);
    setAudioBuffer(remaining);
    clearSelection();
    await onPersistBuffer(remaining, 'Cut');
    notify.success(`Cut ${selectionLength} samples`);
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, selectionLength, pushUndo, clearSelection, onPersistBuffer]);

  const doCopy = useCallback(() => {
    if (!hasSelection || !audioBuffer) return;
    const copied = WaveformProcessor.copy(audioBuffer, selectionStart, selectionEnd);
    setClipboardBuffer(copied);
    notify.success(`Copied ${selectionLength} samples`);
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, selectionLength]);

  const doPaste = useCallback(async () => {
    if (!clipboardBuffer || !audioBuffer) return;
    const pos = hasSelection ? selectionStart : audioBuffer.length;
    await applyOperation('Paste', buf => WaveformProcessor.paste(buf, pos, clipboardBuffer));
  }, [clipboardBuffer, audioBuffer, hasSelection, selectionStart, applyOperation]);

  const doCrop = useCallback(async () => {
    if (!hasSelection || !audioBuffer) return;
    await applyOperation('Crop', buf => WaveformProcessor.crop(buf, selectionStart, selectionEnd));
    clearSelection();
    showAll();
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, applyOperation, clearSelection, showAll]);

  const doDelete = useCallback(async () => {
    if (!hasSelection || !audioBuffer) return;
    await applyOperation('Delete', buf => WaveformProcessor.deleteRange(buf, selectionStart, selectionEnd));
    clearSelection();
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, applyOperation, clearSelection]);

  const doSilence = useCallback(async () => {
    if (!hasSelection || !audioBuffer) return;
    await applyOperation('Silence', buf => WaveformProcessor.silence(buf, selectionStart, selectionEnd));
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, applyOperation]);

  const doFadeIn = useCallback(async () => {
    if (!hasSelection || !audioBuffer) return;
    await applyOperation('Fade In', buf => WaveformProcessor.fadeIn(buf, selectionStart, selectionEnd));
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, applyOperation]);

  const doFadeOut = useCallback(async () => {
    if (!hasSelection || !audioBuffer) return;
    await applyOperation('Fade Out', buf => WaveformProcessor.fadeOut(buf, selectionStart, selectionEnd));
  }, [hasSelection, audioBuffer, selectionStart, selectionEnd, applyOperation]);

  const doVolumeUp = useCallback(async () => {
    if (!audioBuffer) return;
    if (hasSelection) {
      await applyOperation('Volume +3dB', buf => WaveformProcessor.adjustVolume(buf, selectionStart, selectionEnd, 1.4125));
    } else {
      await applyOperation('Volume +3dB', buf => WaveformProcessor.applyGain(buf, 1.4125));
    }
  }, [audioBuffer, hasSelection, selectionStart, selectionEnd, applyOperation]);

  const doVolumeDown = useCallback(async () => {
    if (!audioBuffer) return;
    if (hasSelection) {
      await applyOperation('Volume -3dB', buf => WaveformProcessor.adjustVolume(buf, selectionStart, selectionEnd, 0.7079));
    } else {
      await applyOperation('Volume -3dB', buf => WaveformProcessor.applyGain(buf, 0.7079));
    }
  }, [audioBuffer, hasSelection, selectionStart, selectionEnd, applyOperation]);

  const doReverse = useCallback(async () => {
    if (!audioBuffer) return;
    if (hasSelection) {
      await applyOperation('Reverse Selection', buf => WaveformProcessor.reverseRange(buf, selectionStart, selectionEnd));
    } else {
      await applyOperation('Reverse', buf => WaveformProcessor.reverse(buf));
    }
  }, [audioBuffer, hasSelection, selectionStart, selectionEnd, applyOperation]);

  const doNormalize = useCallback(async () => {
    if (!audioBuffer) return;
    if (hasSelection) {
      await applyOperation('Normalize Selection', buf => WaveformProcessor.normalizeRange(buf, selectionStart, selectionEnd));
    } else {
      await applyOperation('Normalize', buf => WaveformProcessor.normalize(buf));
    }
  }, [audioBuffer, hasSelection, selectionStart, selectionEnd, applyOperation]);

  const doDcRemoval = useCallback(async () => {
    if (!audioBuffer) return;
    if (hasSelection) {
      await applyOperation('DC Offset Removal', buf => WaveformProcessor.dcOffsetRemoval(buf, selectionStart, selectionEnd));
    } else {
      await applyOperation('DC Offset Removal', buf => WaveformProcessor.dcOffsetRemoval(buf));
    }
  }, [audioBuffer, hasSelection, selectionStart, selectionEnd, applyOperation]);

  const doExportWav = useCallback(async () => {
    if (!audioBuffer) return;
    try {
      const wavData = await WaveformProcessor.bufferToWav(audioBuffer);
      const blob = new Blob([wavData], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample.wav';
      a.click();
      URL.revokeObjectURL(url);
      notify.success('Sample exported as WAV');
    } catch {
      notify.error('Failed to export WAV');
    }
  }, [audioBuffer]);

  const doFindLoop = useCallback(() => {
    if (!audioBuffer) return;
    const { start, end } = WaveformProcessor.findBestLoopPoint(audioBuffer);
    const total = audioBuffer.length;
    onUpdateParams({
      loopStart: start / total,
      loopEnd: end / total,
      loopEnabled: true,
      loopType: 'forward',
    });
    notify.success('Auto-loop point found');
  }, [audioBuffer, onUpdateParams]);

  void instrumentId;

  return {
    audioBuffer, setAudioBuffer,
    viewStart, viewEnd, setView, zoomAtPosition, scrollView, showAll, zoomToSelection,
    selectionStart, selectionEnd, setSelection, clearSelection, selectAll, hasSelection, selectionLength,
    dragTarget, setDragTarget, dragTargetRef,
    clipboardBuffer,
    canUndo, canRedo, undoLabel, redoLabel, undoCount, redoCount,
    showSpectrum, setShowSpectrum,
    showEnhancer, setShowEnhancer,
    showResampleModal, setShowResampleModal,
    showBeatSlicer, setShowBeatSlicer,
    isPlaying, setIsPlaying,
    playbackPosition, setPlaybackPosition,
    isLoading, setIsLoading,
    error, setError,
    doCut, doCopy, doPaste, doCrop, doDelete, doSilence,
    doFadeIn, doFadeOut, doVolumeUp, doVolumeDown,
    doReverse, doNormalize, doDcRemoval,
    doUndo, doRedo, doExportWav, doFindLoop,
    params, updateParam,
  };
}
