/**
 * The Furnace dispatch's command log, collected in the browser.
 *
 * `furnace_dispatch_cmd` logs every command that reaches a chip — the song
 * sequencer's and those a FurnaceDispatchSynth sends on its own — and the
 * worklet posts the entries up while playback runs. The headless renderer
 * (`tools/furnace-audit/render-devilbox.ts --cmdlog`) writes the same log for
 * the same WASM, and `compare-cmds.ts` lock-steps either against Furnace.
 * The headless run has no synth objects, so this is the only view of what the
 * browser actually sends a chip.
 *
 * `{ action: 'start' }` clears and starts collecting; `{ action: 'read' }`
 * returns the entries in the renderer's tab-separated format.
 */
import { FurnaceDispatchEngine } from '../../engine/furnace-dispatch/FurnaceDispatchEngine';

interface Entry { tick: number; cmd: number; channel: number; value1: number; value2: number }

let entries: Entry[] = [];
let unsubscribe: (() => void) | null = null;

export function furnaceCmdLog(params: Record<string, unknown>): Record<string, unknown> {
  const engine = FurnaceDispatchEngine.getInstance();
  if (params.action === 'start') {
    unsubscribe?.();
    entries = [];
    engine.enableCmdLog(true);
    unsubscribe = engine.onCmdLog((batch) => { entries.push(...batch); });
    return { ok: true, collecting: true };
  }
  const lines = [`# tick cmd chan val1 val2 ret (${entries.length} entries)`];
  for (const e of entries) lines.push(`${e.tick}\t${e.cmd}\t${e.channel}\t${e.value1}\t${e.value2}\t0`);
  return { ok: true, count: entries.length, text: lines.join('\n') };
}
