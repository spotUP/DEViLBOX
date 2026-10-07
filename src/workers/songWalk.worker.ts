/**
 * Import-time walk worker: the walks an import runs to draw a grid (the TFMX
 * decoder for Hippel, the Music Assembler player, the Future Player reader)
 * run here instead of on the main thread. The walking code is the importer's
 * own (songWalkClient.runWalk).
 *
 *   Main -> Worker: { type: 'walk', id, request: WalkRequest }
 *   Worker -> Main: { type: 'walked', id, result } | { type: 'walkError', id, error }
 */
import { runWalkPacked, type WalkRequest } from '@lib/import/formats/songWalkClient';

interface WalkMessage { type: 'walk'; id: number; request: WalkRequest }

let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<WalkMessage>) => {
  const msg = e.data;
  if (msg.type !== 'walk') return;
  queue = queue.then(async () => {
    try {
      const { result, transfer } = await runWalkPacked(msg.request);
      (self as unknown as Worker).postMessage({ type: 'walked', id: msg.id, result }, transfer);
    } catch (err) {
      (self as unknown as Worker).postMessage({ type: 'walkError', id: msg.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
};
