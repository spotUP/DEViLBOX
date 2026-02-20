/**
 * SongSyncLayer — Zustand subscribe → WebRTC patch broadcast.
 *
 * Uses Immer's reference equality to efficiently detect changes:
 * if patterns[i] reference is the same as before, nothing changed in that pattern.
 *
 * The `applyingRemote` flag prevents circular broadcasts:
 * remote patch → store update → subscribe fires → would re-broadcast → blocked.
 */

import { useTrackerStore, useInstrumentStore, useTransportStore, useAudioStore, useProjectStore } from '@stores';
import type { CollaborationClient } from './CollaborationClient';
import type { DataChannelMsg, SavedProject } from './types';
import type { Pattern } from '@typedefs';

let applyingRemote = false;
let unsubscribeTracker: (() => void) | null = null;
let unsubscribeTransport: (() => void) | null = null;

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

export function snapshotProject(): SavedProject {
  const { patterns, patternOrder } = useTrackerStore.getState();
  const { instruments } = useInstrumentStore.getState();
  const { bpm } = useTransportStore.getState();
  const { masterEffects } = useAudioStore.getState();
  const { metadata } = useProjectStore.getState();

  return {
    patterns: structuredClone(patterns) as Pattern[],
    instruments: structuredClone(instruments),
    bpm,
    masterEffects: structuredClone(masterEffects),
    metadata: metadata ? structuredClone(metadata) as { name: string; author: string; description: string } : undefined,
    patternOrder: structuredClone(patternOrder),
  };
}

// ─── Apply remote patches ─────────────────────────────────────────────────────

export function applyRemotePatch(msg: DataChannelMsg): void {
  applyingRemote = true;
  try {
    const store = useTrackerStore.getState();

    if (msg.type === 'full_sync') {
      const { loadPatterns, setPatternOrder } = store;
      const { loadInstruments } = useInstrumentStore.getState();
      const { setBPM } = useTransportStore.getState();
      const { setMasterEffects } = useAudioStore.getState();

      loadPatterns(msg.project.patterns);
      if (msg.project.patternOrder) setPatternOrder(msg.project.patternOrder);
      if (msg.project.instruments) loadInstruments(msg.project.instruments as never);
      if (msg.project.bpm) setBPM(msg.project.bpm);
      if (msg.project.masterEffects) setMasterEffects(msg.project.masterEffects as never);

    } else if (msg.type === 'cell') {
      // Apply single-cell patch: clone the target pattern, update the cell, replace
      const { patterns, replacePattern } = store;
      const pat = patterns[msg.pi];
      if (!pat) return;
      const ch = pat.channels[msg.ci];
      if (!ch) return;
      if (msg.ri < 0 || msg.ri >= ch.rows.length) return;

      const updated: Pattern = {
        ...pat,
        channels: pat.channels.map((c, ci) => {
          if (ci !== msg.ci) return c;
          const rows = [...c.rows];
          rows[msg.ri] = { ...rows[msg.ri], ...msg.cell };
          return { ...c, rows };
        }),
      };
      replacePattern(msg.pi, updated);

    } else if (msg.type === 'patch_batch') {
      // Group ops by pattern for efficiency
      const { patterns, replacePattern } = store;
      const byPattern = new Map<number, typeof msg.ops>();
      for (const op of msg.ops) {
        if (!byPattern.has(op.pi)) byPattern.set(op.pi, []);
        byPattern.get(op.pi)!.push(op);
      }
      for (const [pi, ops] of byPattern) {
        const pat = patterns[pi];
        if (!pat) continue;
        const channels = pat.channels.map((c, ci) => {
          const cellOps = ops.filter((o) => o.ci === ci);
          if (cellOps.length === 0) return c;
          const rows = [...c.rows];
          for (const op of cellOps) {
            if (op.ri >= 0 && op.ri < rows.length) {
              rows[op.ri] = { ...rows[op.ri], ...op.cell };
            }
          }
          return { ...c, rows };
        });
        replacePattern(pi, { ...pat, channels });
      }

    } else if (msg.type === 'full_pattern') {
      store.replacePattern(msg.pi, msg.pattern);

    } else if (msg.type === 'bpm') {
      useTransportStore.getState().setBPM(msg.value);
    }
    // peer_view and peer_cursor are handled by useCollaborationStore directly
  } finally {
    applyingRemote = false;
  }
}

// ─── Subscribe to local changes and broadcast ─────────────────────────────────

export function startSongSync(client: CollaborationClient): void {
  // Subscribe to tracker store — detect pattern changes via Immer ref equality
  unsubscribeTracker = useTrackerStore.subscribe((state, prev) => {
    if (applyingRemote) return;

    for (let pi = 0; pi < state.patterns.length; pi++) {
      if (state.patterns[pi] === prev.patterns[pi]) continue;

      const pat = state.patterns[pi];
      const prevPat = prev.patterns[pi];

      if (!prevPat) {
        // New pattern added
        client.send({ type: 'pattern_add', pattern: pat });
        continue;
      }

      // Detect cell-level changes (Immer gives us row reference equality)
      const ops: Array<{ pi: number; ci: number; ri: number; cell: typeof pat.channels[0]['rows'][0] }> = [];
      for (let ci = 0; ci < pat.channels.length; ci++) {
        if (pat.channels[ci] === prevPat.channels[ci]) continue;
        const ch = pat.channels[ci];
        const prevCh = prevPat.channels[ci];
        for (let ri = 0; ri < ch.rows.length; ri++) {
          if (ch.rows[ri] !== prevCh?.rows[ri]) {
            ops.push({ pi, ci, ri, cell: ch.rows[ri] });
          }
        }
      }

      if (ops.length === 0) {
        // Non-cell change (length, name) — send full pattern
        client.send({ type: 'full_pattern', pi, pattern: pat });
      } else if (ops.length === 1) {
        const { pi: p, ci, ri, cell } = ops[0];
        client.send({ type: 'cell', pi: p, ci, ri, cell });
      } else {
        client.send({ type: 'patch_batch', ops });
      }
    }

    // Detect deleted patterns
    if (state.patterns.length < prev.patterns.length) {
      for (let pi = state.patterns.length; pi < prev.patterns.length; pi++) {
        client.send({ type: 'pattern_delete', pi });
      }
    }
  });

  // Subscribe to transport store — sync BPM changes
  unsubscribeTransport = useTransportStore.subscribe((state, prev) => {
    if (applyingRemote) return;
    if (state.bpm !== prev.bpm) {
      client.send({ type: 'bpm', value: state.bpm });
    }
  });
}

export function stopSongSync(): void {
  unsubscribeTracker?.();
  unsubscribeTransport?.();
  unsubscribeTracker = null;
  unsubscribeTransport = null;
}
