// src/hooks/views/usePianoRoll.ts
/**
 * usePianoRoll — Shared logic hook for PianoRoll (DOM/Canvas2D) and
 * PixiPianoRollView (Pixi/WebGL).
 *
 * Both views call this hook and keep only their renderer-specific markup.
 *
 * Shared:
 *  - QWERTY_NOTE_MAP constant (exported)
 *  - followPlayback state
 *  - isRecording state + midiNoteStartRef
 *  - handleToggleRecord callback
 *  - MIDI recording useEffect (MIDIManager subscribe/unsubscribe)
 *  - noteVersion counter + handleNotesChanged
 *  - getEffectiveNoteLength + noteLengthRef
 *
 * NOT shared (kept in each view):
 *  - Keyboard shortcuts — DOM uses usePianoRollKeyboard (router-based),
 *    Pixi uses its own inline useEffect with window.addEventListener
 *  - Auto-scroll implementation (different approach per view)
 *  - Rendering, layout, canvas/pixi refs
 *  - DOM: containerRef/Height, Tone.js note preview, scale notes, drag state
 *  - Pixi: workbench window dimensions, chord detection, piano key handlers
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePianoRollStore } from '@stores/usePianoRollStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores';
import { getMIDIManager } from '@/midi/MIDIManager';
import type { MIDIMessage } from '@/midi/types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** QWERTY keyboard → semitone offset from base octave (C4 = MIDI 60) */
export const QWERTY_NOTE_MAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * usePianoRoll — shared non-rendering logic for the piano roll views.
 */
export function usePianoRoll() {
  // ── Follow-playback toggle ─────────────────────────────────────────────────
  const [followPlayback, setFollowPlayback] = useState(true);

  // ── MIDI recording ─────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const midiNoteStartRef = useRef<Map<number, number>>(new Map());

  const handleToggleRecord = useCallback(() => {
    setIsRecording(prev => !prev);
  }, []);

  const isPlaying = useTransportStore(s => s.isPlaying);
  const currentRow = useTransportStore(s => s.currentRow);

  useEffect(() => {
    if (!isRecording) {
      midiNoteStartRef.current.clear();
      return;
    }

    const manager = getMIDIManager();

    const handleMIDIMessage = (msg: MIDIMessage) => {
      if (!msg.data || msg.data.length < 2) return;
      const [status, note = 0, velocity = 0] = msg.data;
      const messageType = (status >> 4) & 0x0f;

      const pianoStore = usePianoRollStore.getState();
      const insertRow = isPlaying ? currentRow : Math.floor(pianoStore.view.scrollX);
      const chIdx = pianoStore.view.channelIndex;

      if (messageType === 0x09 && velocity > 0) {
        // Note-on: record start row and write note cell immediately
        midiNoteStartRef.current.set(note, insertRow);
        const ts = useTrackerStore.getState();
        const pat = ts.patterns[ts.currentPatternIndex];
        if (!pat) return;
        const xmNote = note + 1;
        const volumeValue = Math.round((velocity / 127) * 64);
        const vol = 0x10 + volumeValue;
        ts.setCell(chIdx, insertRow, { note: xmNote, volume: vol });
      } else if (messageType === 0x08 || (messageType === 0x09 && velocity === 0)) {
        // Note-off: write note-off marker at end row
        const startRow = midiNoteStartRef.current.get(note);
        if (startRow === undefined) return;
        midiNoteStartRef.current.delete(note);

        const nowRow = isPlaying ? currentRow : Math.floor(usePianoRollStore.getState().view.scrollX);
        const duration = Math.max(1, nowRow - startRow);
        const ts = useTrackerStore.getState();
        const pat = ts.patterns[ts.currentPatternIndex];
        if (!pat) return;
        const endRow = startRow + duration;
        if (endRow < pat.length) {
          ts.setCell(chIdx, endRow, { note: 97 }); // 97 = note-off
        }
      }
    };

    manager.addMessageHandler(handleMIDIMessage);
    return () => {
      manager.removeMessageHandler(handleMIDIMessage);
      midiNoteStartRef.current.clear();
    };
  }, [isRecording, isPlaying, currentRow]);

  // ── Note version counter ───────────────────────────────────────────────────
  const [noteVersion, setNoteVersion] = useState(0);
  const handleNotesChanged = useCallback(() => setNoteVersion(v => v + 1), []);

  // ── Effective note length ──────────────────────────────────────────────────
  const view = usePianoRollStore(s => s.view);

  const getEffectiveNoteLength = useCallback(() => {
    const v = usePianoRollStore.getState().view;
    if (v.noteLengthPreset > 0) return v.noteLengthPreset;
    return v.snapToGrid ? Math.max(1, Math.floor(4 / v.gridDivision)) : 1;
  }, []);

  const noteLengthRef = useRef(getEffectiveNoteLength());
  useEffect(() => {
    noteLengthRef.current = getEffectiveNoteLength();
  }, [getEffectiveNoteLength, view.noteLengthPreset, view.snapToGrid, view.gridDivision]);

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    // Follow-playback
    followPlayback,
    setFollowPlayback,
    // MIDI recording
    isRecording,
    handleToggleRecord,
    midiNoteStartRef,
    // Note version
    noteVersion,
    handleNotesChanged,
    // Effective note length
    getEffectiveNoteLength,
    noteLengthRef,
  };
}
