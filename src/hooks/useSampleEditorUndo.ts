/**
 * useSampleEditorUndo - Undo/redo state management for the sample editor.
 *
 * Wraps SampleUndoManager with React state, providing pushUndo / doUndo / doRedo
 * callbacks and reactive stack-size indicators.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { SampleUndoManager } from '../lib/audio/SampleUndoManager';
import type { UndoState } from '../lib/audio/SampleUndoManager';
import type { LoopType } from './useSampleEditorState';

// ─── Types ─────────────────────────────────────────────────────────────

export interface UseSampleEditorUndoOptions {
  audioBuffer: AudioBuffer | null;
  instrumentParameters: Record<string, unknown> | undefined;
  setAudioBuffer: (buf: AudioBuffer | null) => void;
  onPersistBuffer: (buffer: AudioBuffer, label: string) => Promise<void>;
  onUpdateParams: (updates: Record<string, unknown>) => void;
}

export interface UseSampleEditorUndoReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undoCount: number;
  redoCount: number;
  pushUndo: (label: string) => void;
  doUndo: () => void;
  doRedo: () => void;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useSampleEditorUndo(opts: UseSampleEditorUndoOptions): UseSampleEditorUndoReturn {
  const { audioBuffer, instrumentParameters, setAudioBuffer, onPersistBuffer, onUpdateParams } = opts;

  const undoManager = useRef(new SampleUndoManager(20));
  const [undoInfo, setUndoInfo] = useState({
    canUndo: false, canRedo: false,
    undoLabel: null as string | null, redoLabel: null as string | null,
    undoCount: 0, redoCount: 0,
  });

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
  }, [setAudioBuffer, onPersistBuffer, onUpdateParams, syncUndoState]);

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

  return {
    ...undoInfo,
    pushUndo,
    doUndo,
    doRedo,
  };
}
