// Regression: SaveS3M seeks forward past the written header; libc++ stringbuf refused, so everything after the header was dropped (256 B files).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

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

it('S3M save writes the patterns, not just the header', async () => {
  shimOpenMptScriptTag();
  const osl = await import('@lib/import/wasm/OpenMPTSoundlib');
  expect(await osl.createNewModule(3, 4, 2)).toBeTruthy();
  try {
    await osl.setOrderPattern(0, 0);
    await osl.setPatternCell(0, 0, 0, { note: 49, instrument: 1, volcmd: 0, vol: 0, command: 0, param: 0 });
    const out = await osl.saveModule('s3m');
    // Pattern 0's parapointer must lie inside the file, with its packed data after it.
    const bytes = new Uint8Array(out!);
    const v = new DataView(bytes.buffer);
    const ordNum = v.getUint16(0x20, true), insNum = v.getUint16(0x22, true);
    const lastPat = v.getUint16(0x60 + ordNum + insNum * 2, true) * 16; // pattern 0 holds the cell
    expect(lastPat).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(lastPat);
  } finally {
    await osl.destroyModule();
  }
});
