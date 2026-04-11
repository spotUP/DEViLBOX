/**
 * useSF2Engine.ts
 *
 * React hook that bridges the SF2 Zustand store with the SF2Engine.
 * Subscribes to store edits and translates them into C64 memory writes
 * for immediate audio feedback.
 *
 * Usage:
 *   const { engine, canEdit, sidRegs } = useSF2Engine();
 */

import { useEffect, useRef, useState } from 'react';
import { useSF2Store } from '@stores/useSF2Store';
import type { SF2Engine } from '@/engine/sf2/SF2Engine';
import type { SIDRegisterFrame } from '@/engine/sf2/SF2Engine';

// Lazy import to avoid circular deps — TrackerReplayer is a large module
let _getTrackerReplayer: (() => any) | null = null;
async function getTrackerReplayer(): Promise<any> {
  if (!_getTrackerReplayer) {
    const mod = await import('@/engine/TrackerReplayer');
    _getTrackerReplayer = mod.getTrackerReplayer;
  }
  return _getTrackerReplayer();
}

export interface SF2EngineState {
  engine: SF2Engine | null;
  canEdit: boolean;
  isPlaying: boolean;
  sidRegs: SIDRegisterFrame | null;
  driverName: string;
  driverVersion: string;
}

/**
 * Hook to access the SF2Engine from the TrackerReplayer.
 * Polls for SID register updates at ~20Hz when playing.
 */
export function useSF2Engine(): SF2EngineState {
  const [engine, setEngine] = useState<SF2Engine | null>(null);
  const [sidRegs, setSidRegs] = useState<SIDRegisterFrame | null>(null);
  const pollRef = useRef<number>(0);
  const loaded = useSF2Store((s) => s.loaded);

  // Acquire engine reference when SF2 is loaded
  useEffect(() => {
    if (!loaded) {
      setEngine(null);
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      try {
        const replayer = await getTrackerReplayer();
        const sf2 = replayer?.getSF2Engine?.() ?? null;
        if (!cancelled) setEngine(sf2);
      } catch {
        if (!cancelled) setEngine(null);
      }
    };

    acquire();
    // Re-check periodically in case engine initializes after store loads
    const interval = setInterval(acquire, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loaded]);

  // Poll SID registers at ~20Hz when engine is available and playing
  useEffect(() => {
    if (!engine?.isPlaying()) {
      setSidRegs(null);
      return;
    }

    const tick = () => {
      const frame = engine.flightRecorder.getLatest();
      setSidRegs(frame);
      pollRef.current = window.setTimeout(tick, 50); // 20Hz
    };
    tick();

    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [engine]);

  return {
    engine,
    canEdit: engine?.canEdit ?? false,
    isPlaying: engine?.isPlaying() ?? false,
    sidRegs,
    driverName: engine?.driverName ?? '',
    driverVersion: engine?.driverVersion ?? '',
  };
}

/**
 * Hook that subscribes to SF2 store edits and pushes them to the engine.
 * Call this once in the SF2 view component tree.
 */
export function useSF2LiveSync(): void {
  const engine = useRef<SF2Engine | null>(null);
  const loaded = useSF2Store((s) => s.loaded);

  // Acquire engine ref
  useEffect(() => {
    if (!loaded) {
      engine.current = null;
      return;
    }
    let cancelled = false;
    const acquire = async () => {
      try {
        const replayer = await getTrackerReplayer();
        const sf2 = replayer?.getSF2Engine?.() ?? null;
        if (!cancelled) engine.current = sf2;
      } catch { /* ignore */ }
    };
    acquire();
    const interval = setInterval(acquire, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [loaded]);

  // Subscribe to instrument byte edits → push to C64 memory
  useEffect(() => {
    return useSF2Store.subscribe(
      (state, prevState) => {
        if (!engine.current?.canEdit) return;
        const instruments = state.instruments;
        const prevInstruments = prevState.instruments;
        if (instruments === prevInstruments) return;
        // Find changed instrument and byte
        for (let i = 0; i < instruments.length; i++) {
          if (i >= prevInstruments.length) break;
          const curr = instruments[i];
          const prev = prevInstruments[i];
          if (curr === prev) continue;
          // Compare byte by byte
          for (let b = 0; b < curr.rawBytes.length; b++) {
            if (curr.rawBytes[b] !== prev.rawBytes[b]) {
              engine.current.writeInstrumentByte(i, b, curr.rawBytes[b]);
            }
          }
        }
      },
    );
  }, []);

  // Subscribe to order list edits → push to C64 memory
  useEffect(() => {
    return useSF2Store.subscribe(
      (state, prevState) => {
        if (!engine.current?.canEdit) return;
        const orderLists = state.orderLists;
        const prevOrderLists = prevState.orderLists;
        if (orderLists === prevOrderLists) return;
        for (let t = 0; t < orderLists.length; t++) {
          if (t >= prevOrderLists.length) break;
          const curr = orderLists[t];
          const prev = prevOrderLists[t];
          if (curr === prev) continue;
          for (let p = 0; p < curr.entries.length; p++) {
            if (p >= prev.entries.length) break;
            const ce = curr.entries[p];
            const pe = prev.entries[p];
            if (ce.seqIdx !== pe.seqIdx || ce.transpose !== pe.transpose) {
              engine.current.writeOrderEntry(t, p, ce);
            }
          }
        }
      },
    );
  }, []);

  // Subscribe to channel mute changes → push to SID engine
  useEffect(() => {
    return useSF2Store.subscribe(
      (state, prevState) => {
        if (!engine.current) return;
        if (state.channelMutes === prevState.channelMutes) return;
        let mask = 0;
        for (let i = 0; i < state.channelMutes.length; i++) {
          if (state.channelMutes[i]) mask |= (1 << i);
        }
        engine.current.setMuteMask(mask);
      },
    );
  }, []);

  // Subscribe to c64Memory changes (table edits) → push to C64 memory
  useEffect(() => {
    return useSF2Store.subscribe(
      (state, prevState) => {
        if (!engine.current?.canEdit) return;
        if (state.c64Memory === prevState.c64Memory) return;
        // Find changed table bytes and write them. Tables are the primary
        // consumer of c64Memory edits, so scan table address ranges.
        for (const td of state.tableDefs) {
          for (let c = 0; c < td.columnCount; c++) {
            for (let r = 0; r < td.rowCount; r++) {
              const addr = td.address + c * td.rowCount + r;
              if (addr < state.c64Memory.length && state.c64Memory[addr] !== prevState.c64Memory[addr]) {
                engine.current.writeTableByte(td.id, r, c, state.c64Memory[addr]);
              }
            }
          }
        }
      },
    );
  }, []);
}

/**
 * Hook to write a single sequence to C64 memory when it changes.
 * The sequence packing is done by the engine.
 */
export function useSF2SequenceSync(seqIdx: number): void {
  const engine = useRef<SF2Engine | null>(null);
  const loaded = useSF2Store((s) => s.loaded);

  useEffect(() => {
    if (!loaded) { engine.current = null; return; }
    let cancelled = false;
    const acquire = async () => {
      try {
        const replayer = await getTrackerReplayer();
        if (!cancelled) engine.current = replayer?.getSF2Engine?.() ?? null;
      } catch { /* ignore */ }
    };
    acquire();
    return () => { cancelled = true; };
  }, [loaded]);

  useEffect(() => {
    return useSF2Store.subscribe(
      (state, prevState) => {
        const seq = state.sequences.get(seqIdx);
        const prevSeq = prevState.sequences.get(seqIdx);
        if (!seq || seq === prevSeq || !engine.current?.canEdit) return;
        engine.current.writeSequence(seqIdx, seq);
      },
    );
  }, [seqIdx]);
}
