/**
 * A DefleMask file whose zlib checksum failed decompresses a byte or two short,
 * and the shortfall lands in the sample block — the last thing in the file.
 * Furnace's loader used to refuse the whole song ("incomplete file") over it;
 * the patched loader keeps every sample that fits, clamps the one that runs
 * off the end, and reports the damage instead of hiding it.
 *
 * Drives the real FurnaceFileOps WASM through parseFurnaceFile, the entry point
 * every .dmf load takes. The build is web-only, so the script tag the loader
 * injects is answered here by evaluating the same file and handing the factory
 * the .wasm bytes directly.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const deflemask = path.join(root, 'public/data/songs/deflemask');

const notifyWarning = vi.fn();
vi.mock('@/stores/useNotificationStore', () => ({
  notify: { warning: (...a: unknown[]) => notifyWarning(...a), error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

function readSong(rel: string): ArrayBuffer {
  const b = fs.readFileSync(path.join(deflemask, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

beforeAll(() => {
  const js = fs.readFileSync(path.join(root, 'public/furnace-fileops/FurnaceFileOps.js'), 'utf8');
  const wasmBinary = fs.readFileSync(path.join(root, 'public/furnace-fileops/FurnaceFileOps.wasm'));
  const realAppend = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement && node.src.endsWith('/furnace-fileops/FurnaceFileOps.js')) {
      (0, eval)(js);
      const g = globalThis as unknown as { createFurnaceFileOps: (o?: object) => Promise<unknown> };
      const factory = g.createFurnaceFileOps;
      g.createFurnaceFileOps = (o = {}) => factory({ ...o, wasmBinary });
      queueMicrotask(() => node.onload?.(new Event('load')));
      return node;
    }
    return realAppend(node);
  });
});

// First load instantiates the WASM, which is slow on a busy machine.
describe('DefleMask file with a damaged sample block', { timeout: 60000 }, () => {
  it('loads Darude - Sandstorm.dmf instead of refusing it as an incomplete file', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    notifyWarning.mockClear();

    const song = await parseFurnaceFile(readSong('Darude - Sandstorm.dmf'), 'Darude - Sandstorm.dmf');

    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.instruments.length).toBeGreaterThan(0);
    // Samples 0 and 1 are short by one and two bytes; 1 is clamped, 2 and 3
    // are gone. The warning carries real numbers, not printf placeholders.
    expect(notifyWarning).toHaveBeenCalledTimes(1);
    const message = String(notifyWarning.mock.calls[0][0]);
    expect(message).toContain('Darude - Sandstorm.dmf');
    expect(message).toContain('kept 2 of the file\'s 4 samples');
    expect(message).not.toContain('%d');
  });

  it('loads a checksum-clean file that carries samples without any warning', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    notifyWarning.mockClear();

    const song = await parseFurnaceFile(readSong('220hertz/Andrew_haggles.dmf'), 'Andrew_haggles.dmf');

    expect(song.patterns.length).toBeGreaterThan(0);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it('still refuses a file whose damage reaches the patterns', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    notifyWarning.mockClear();

    await expect(
      parseFurnaceFile(readSong('KillaMaaki/FightToTheDeath.dmf'), 'FightToTheDeath.dmf'),
    ).rejects.toThrow('order at 5, 30 out of range! (216)');
  });
});
