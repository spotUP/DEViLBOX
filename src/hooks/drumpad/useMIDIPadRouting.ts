/**
 * useMIDIPadRouting — Global MIDI pad → DrumPad routing hook.
 *
 * Maps MIDI notes 36-43 (MPK Mini pads 1-8) to the first 8 pads of the
 * current drum pad bank. Active when the view is DJ or VJ (DrumPad view
 * has its own richer handler inside PadGrid).
 *
 * Creates its own DrumPadEngine instance so pads play even when no pad
 * panel/grid component is mounted.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getMIDIManager } from '../../midi/MIDIManager';
import type { MIDIMessage } from '../../midi/types';
import { useDrumPadStore } from '../../stores/useDrumPadStore';
import { useInstrumentStore } from '../../stores/useInstrumentStore';
import { useUIStore } from '../../stores/useUIStore';
import { DrumPadEngine } from '../../engine/drumpad/DrumPadEngine';
import { getToneEngine } from '../../engine/ToneEngine';
import { getAudioContext } from '../../audio/AudioContextSingleton';
import { PAD_INSTRUMENT_BASE } from '../../types/drumpad';

const MIDI_PAD_LO = 36;
const MIDI_PAD_HI = 43;

export function useMIDIPadRouting() {
  const engineRef = useRef<DrumPadEngine | null>(null);
  const heldPadsRef = useRef<Set<number>>(new Set());

  // Init / dispose engine
  useEffect(() => {
    const ctx = getAudioContext();
    engineRef.current = new DrumPadEngine(ctx);

    // Load persisted samples from IndexedDB
    useDrumPadStore.getState().loadFromIndexedDB(ctx);

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      heldPadsRef.current.clear();
    };
  }, []);

  // Sync master level
  const currentProgram = useDrumPadStore(s => s.programs.get(s.currentProgramId));
  useEffect(() => {
    if (engineRef.current && currentProgram) {
      engineRef.current.setMasterLevel(currentProgram.masterLevel);
      engineRef.current.setMuteGroups(currentProgram.pads);
    }
  }, [currentProgram]);

  const currentBank = useDrumPadStore(s => s.currentBank);

  // Trigger a pad (sample + synth)
  const triggerPad = useCallback((padId: number, velocity: number) => {
    if (!currentProgram || !engineRef.current) return;
    const pad = currentProgram.pads.find(p => p.id === padId);
    if (!pad) return;

    if (pad.sample) {
      engineRef.current.triggerPad(pad, velocity);
    }

    // Also trigger synth if configured
    if (pad.synthConfig || pad.instrumentId != null) {
      try {
        const engine = getToneEngine();
        const note = pad.instrumentNote || 'C3';
        const normalizedVel = velocity / 127;

        let instId: number;
        let config: any;
        if (pad.synthConfig) {
          instId = PAD_INSTRUMENT_BASE + pad.id;
          config = { ...pad.synthConfig, id: instId };
        } else {
          instId = pad.instrumentId!;
          config = useInstrumentStore.getState().getInstrument(instId);
          if (!config) return;
        }
        engine.triggerNoteAttack(instId, note, 0, normalizedVel, config);

        // Auto-release for oneshot
        if (pad.playMode === 'oneshot') {
          const releaseMs = Math.max(pad.decay, 100);
          setTimeout(() => {
            try { engine.triggerNoteRelease(instId, note, 0, config); } catch { /* ignore */ }
          }, releaseMs);
        }
      } catch { /* ignore synth errors */ }
    }

    if (pad.playMode === 'sustain') {
      heldPadsRef.current.add(padId);
    }
  }, [currentProgram]);

  // Release a pad
  const releasePad = useCallback((padId: number) => {
    if (!heldPadsRef.current.has(padId)) return;
    heldPadsRef.current.delete(padId);

    if (!currentProgram || !engineRef.current) return;
    const pad = currentProgram.pads.find(p => p.id === padId);
    if (!pad || pad.playMode !== 'sustain') return;

    engineRef.current.stopPad(padId, pad.release / 1000);

    if (pad.synthConfig || pad.instrumentId != null) {
      try {
        let instId: number;
        let config: any;
        if (pad.synthConfig) {
          instId = PAD_INSTRUMENT_BASE + pad.id;
          config = { ...pad.synthConfig, id: instId };
        } else {
          instId = pad.instrumentId!;
          config = useInstrumentStore.getState().getInstrument(instId);
        }
        if (config) {
          const note = pad.instrumentNote || 'C3';
          getToneEngine().triggerNoteRelease(instId, note, 0, config);
        }
      } catch { /* ignore */ }
    }
  }, [currentProgram]);

  // Register MIDI handler — only active in DJ and VJ views
  useEffect(() => {
    const manager = getMIDIManager();
    const bankOffset = { A: 0, B: 16, C: 32, D: 48 }[currentBank];

    const handler = (message: MIDIMessage) => {
      // Only handle pad notes in DJ / VJ views
      const view = useUIStore.getState().activeView;
      if (view !== 'dj' && view !== 'vj') return;
      if (message.note === undefined || message.note < MIDI_PAD_LO || message.note > MIDI_PAD_HI) return;

      const padIndex = message.note - MIDI_PAD_LO; // 0-7
      const padId = bankOffset + padIndex + 1;      // 1-based

      if (message.type === 'noteOn' && message.velocity) {
        triggerPad(padId, message.velocity);
      } else if (message.type === 'noteOff' || (message.type === 'noteOn' && message.velocity === 0)) {
        releasePad(padId);
      }
    };

    manager.addMessageHandler(handler);
    return () => manager.removeMessageHandler(handler);
  }, [currentBank, triggerPad, releasePad]);
}
