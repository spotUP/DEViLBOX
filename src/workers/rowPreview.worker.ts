/**
 * Row-preview worker: renders a grid row with a private instance of a whole-song engine's player, off the audio thread.
 * The logic is rowPreviewHost.ts; this file only wires it to postMessage. Plan: thoughts/shared/plans/2026-10-14-engine-row-preview.md
 */
import { createRowPreviewHost } from '@/engine/rowPreview/rowPreviewHost';
import { ROW_PREVIEW_ADAPTERS } from '@/engine/rowPreview/adapters';
import type { RowPreviewIn } from '@/engine/rowPreview/rowPreviewProtocol';

const host = createRowPreviewHost(ROW_PREVIEW_ADAPTERS);
const scope = self as unknown as Worker;
scope.onmessage = (e: MessageEvent<RowPreviewIn>) => {
  host.handle(e.data, (out, transfer) => scope.postMessage(out, transfer ?? []));
};
