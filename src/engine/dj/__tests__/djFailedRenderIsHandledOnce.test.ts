/**
 * A render that fails reaches its caller once, handled: no unhandled rejection,
 * the deck leaves 'rendering', and the user is told.
 *
 * Bug (owner 2026-10-12, Arcade_Memories_3SID from the HVSC browser): the
 * render timed out ("Task timeout after 180s") and the console showed an
 * [unhandledrejection] besides the browser's own handled error. The pipeline
 * cleared its in-flight entry with promise.finally(...), and the promise that
 * .finally() returns re-threw the failure with nobody listening. The deck
 * stayed 'rendering' and nothing told the user.
 *
 * Drives DJPipeline.loadOrEnqueue (the HVSC browser's call) with a render
 * worker that answers renderError.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';

const notified = vi.hoisted(() => ({ errors: [] as string[] }));
vi.mock('@/stores/useNotificationStore', async (orig) => ({
  ...(await orig<typeof import('@/stores/useNotificationStore')>()),
  notify: { error: (m: string) => { notified.errors.push(m); }, success: () => {}, warning: () => {}, info: () => {} },
}));

import { getDJPipeline } from '../DJPipeline';
import { useDJStore } from '@/stores/useDJStore';

class FailingRenderWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(msg: { type: string; id?: string }) {
    if (msg.type === 'render') setTimeout(() => this.onmessage?.({ data: { type: 'renderError', id: msg.id, error: 'Task timeout after 180s' } }), 0);
  }
  terminate() {}
}

describe('a failed render is handled once', () => {
  afterEach(() => { vi.unstubAllGlobals(); notified.errors = []; });

  it('loadOrEnqueue rejects to its caller; no unhandled rejection; the deck leaves rendering; the user gets an error', async () => {
    vi.stubGlobal('Worker', FailingRenderWorker);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      useDJStore.getState().setDeckState('A', { fileName: 'hvsc:Arcade_Memories_3SID.sid', analysisState: 'rendering' });
      const bytes = new Uint8Array([0x50, 0x53, 0x49, 0x44, 1, 2, 3, 4]).buffer; // unique bytes, no cache entry
      await expect(getDJPipeline().loadOrEnqueue(bytes, 'Arcade_Memories_3SID.sid', 'A', 'high')).rejects.toThrow('Task timeout');
      // Let every derived promise settle and report.
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).toEqual([]);
      expect(useDJStore.getState().decks.A.analysisState).toBe('none');
      expect(notified.errors).toHaveLength(1);
      expect(notified.errors[0]).toContain('Arcade_Memories_3SID.sid');
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
