// Runs tools/editability-census.ts rows inside the vitest happy-dom env (Tone/DOM-bound exporters fail under bare tsx).
// Opt-in: does nothing unless CENSUS_ONLY is set (comma list of path substrings). Records into test-data/editability-census.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';

// OpenMPTSoundlib.ts injects /openmpt/OpenMPTSoundlib.js through a <script> tag; load the same glue + wasm from public/ in Node.
function shimOpenMptScriptTag(): void {
  const dir = path.resolve(__dirname, '../../../../public/openmpt');
  const realCreate = document.createElement.bind(document);
  document.createElement = ((tag: string) => (tag === 'script' ? ({} as HTMLScriptElement) : realCreate(tag))) as typeof document.createElement;
  document.head.appendChild = ((s: HTMLScriptElement) => {
    // eslint-disable-next-line no-new-func
    new Function(`${readFileSync(path.join(dir, 'OpenMPTSoundlib.js'), 'utf8')}\n;globalThis.createOpenMPTSoundlib = createOpenMPTSoundlib;`)();
    const g = globalThis as unknown as { createOpenMPTSoundlib: (o: object) => unknown };
    const factory = g.createOpenMPTSoundlib;
    g.createOpenMPTSoundlib = (o) => factory({ ...o, wasmBinary: readFileSync(path.join(dir, 'OpenMPTSoundlib.wasm')) });
    queueMicrotask(() => s.onload?.(new Event('load')));
    return s;
  }) as typeof document.head.appendChild;
}

it.runIf(!!process.env.CENSUS_ONLY)('census rows', async () => {
  shimOpenMptScriptTag();
  const { main } = await import('../../../../tools/editability-census');
  await main();
}, 1_800_000);
