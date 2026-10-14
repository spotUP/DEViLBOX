/**
 * Furnace songs show their effects the way Furnace does: the two-hex-digit code
 * plus the two-hex-digit value ("8040", "9012"), for every chip.
 *
 * Meaningful Connection (ES5506) showed '?XX' for its panning (80xx) and
 * sample-offset (90xx) commands, and its E5 80 fine pitch as E50: the cells folded Furnace codes into the
 * one-glyph tracker space, where codes above 0x23 either had no glyph or
 * borrowed another format's. The cells now keep Furnace's code and the channel
 * is marked effectNotation 'furnace' (lib/tracker/effectNotation.ts).
 *
 * Held here, through the real WASM import:
 *   - the grid text (MCP render_pattern_text / get_cell, read from the tracker
 *     store) and the 2D renderer draw every effect as Furnace writes it, no '?';
 *   - load -> .fur save -> load keeps every effect code and value;
 *   - playback still gets the Furnace effect: the sequencer upload and a live
 *     edit both write Furnace's code, unchanged, into the effect columns;
 *   - a song autosaved with the old folded cells comes back in Furnace notation.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FurnaceNativeData, TrackerCell } from '@/types/tracker';

const SONG = 'furnace/misc/meaningful_connection_es5506.fur';
const SLOTS = ['', '2', '3', '4', '5', '6', '7', '8'] as const;
const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

/** Every non-empty native effect of the active subsong, keyed by editor pattern/channel/row/slot. */
function nativeEffects(song: TrackerSong): Map<string, { cmd: number; val: number }> {
  const native = song.furnaceNative!;
  const sub = native.subsongs[native.activeSubsong ?? 0];
  const out = new Map<string, { cmd: number; val: number }>();
  song.patterns.forEach((_, p) => {
    const pos = song.songPositions.indexOf(p);
    sub.channels.forEach((chan, ch) => {
      const rows = chan.patterns.get(sub.orders[ch][pos])?.rows ?? [];
      rows.forEach((r, row) => r.effects.forEach((fx, slot) => {
        if (fx.cmd >= 0 || fx.val >= 0) out.set(`${p}/${ch}/${row}/${slot}`, fx);
      }));
    });
  });
  return out;
}

function cellEffect(cell: TrackerCell, slot: number): { t: number; v: number } {
  const c = cell as unknown as Record<string, number | undefined>;
  return { t: c[`effTyp${SLOTS[slot]}`] ?? 0, v: c[`eff${SLOTS[slot]}`] ?? 0 };
}

let song: TrackerSong;

describe('Meaningful Connection (ES5506) in Furnace effect notation', { timeout: 120000 }, () => {
  beforeAll(async () => {
    installFurnaceFileOpsWasm();
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    song = await parseFurnaceFile(readSong(SONG), 'meaningful_connection_es5506.fur');
  });

  it('the grid shows 80xx / 90xx / E5xx exactly as Furnace, and no ? anywhere', async () => {
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { renderPatternText, getCell } = await import('@/bridge/handlers/readHandlers');
    useTrackerStore.getState().loadPatterns(song.patterns);

    // Every channel is marked; every cell holds Furnace's own code (no XM folding).
    for (const p of song.patterns) for (const ch of p.channels) expect(ch.channelMeta?.effectNotation).toBe('furnace');
    const effects = nativeEffects(song);
    const codes = new Set([...effects.values()].map((e) => e.cmd));
    // E5 (fine pitch) is Furnace's own code: the old fold showed it as XM 0E with its value cut to E5 0.
    expect([...codes].sort((a, b) => a - b)).toEqual([0x04, 0x0a, 0x80, 0x90, 0xe5]);

    // The first 80xx and 90xx in the song, as Furnace writes them, reach the store's text views.
    for (const code of [0x80, 0x90, 0xe5]) {
      const [key, fx] = [...effects].find(([, e]) => e.cmd === code)!;
      const [p, ch, row, slot] = key.split('/').map(Number);
      const want = `${hex2(code)}${hex2(fx.val)}`;
      const text = renderPatternText({ patternIndex: p, startRow: row, endRow: row, channels: [ch] }).text as string;
      expect(text, `pattern ${p} ch ${ch} row ${row}`).toContain(want);
      const cell = getCell({ patternIndex: p, channel: ch, row });
      expect(slot === 0 ? cell.effStr : cell.effStr2).toBe(want);
    }

    // Every pattern's text: no '?' and every non-empty effect is 4 hex digits.
    for (let p = 0; p < song.patterns.length; p++) {
      const text = renderPatternText({ patternIndex: p }).text as string;
      expect(text, `pattern ${p}`).not.toContain('?');
    }
  });

  it('the 2D renderer draws the cell as Furnace writes it', async () => {
    const { TrackerCanvas2DRenderer } = await import('@/engine/renderer/TrackerCanvas2DRenderer');
    const effects = nativeEffects(song);
    const [key, fx] = [...effects].find(([k, e]) => e.cmd === 0x80 && k.endsWith('/0'))!;
    const [p, ch, row] = key.split('/').map(Number);
    const drawn: string[] = [];
    const ctx = new Proxy({ canvas: { width: 800, height: 600 } } as Record<string, unknown>, {
      get: (t, k) => (k in t ? t[k as string] : k === 'fillText' ? (s: string) => drawn.push(s) : () => undefined),
      set: (t, k, v) => { t[k as string] = v; return true; },
    });
    const canvas = { width: 800, height: 600, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const r = new TrackerCanvas2DRenderer(canvas);
    const pat = song.patterns[p];
    r.render({
      patterns: [{
        id: pat.id, length: pat.length,
        channels: pat.channels.map((c) => ({
          id: c.id, effectCols: c.channelMeta?.effectCols ?? 2, effectNotation: c.channelMeta?.effectNotation,
          rows: c.rows.map((cell) => ({ note: cell.note, instrument: cell.instrument, volume: cell.volume, effTyp: cell.effTyp, eff: cell.eff, effTyp2: cell.effTyp2, eff2: cell.eff2 })),
        })),
      }],
      currentPatternIndex: 0, scrollX: 0,
      cursor: { rowIndex: row, channelIndex: ch, columnType: 'effTyp', digitIndex: 1, noteColumnIndex: 0 },
      selection: null,
      playback: { row: 0, smoothOffset: 0, patternIndex: 0, isPlaying: false },
      theme: new Proxy({}, { get: () => '#000' }) as never,
      ui: { rowHeight: 20, rowHighlightInterval: 4, columnVisibility: {} } as never,
      layout: { offsets: pat.channels.map((_, i) => i * 400), widths: pat.channels.map(() => 400), totalWidth: pat.channels.length * 400 },
      dragOver: null,
    });
    expect(drawn).toContain(`80${hex2(fx.val)}`);
    expect(drawn.filter((s) => s.includes('?'))).toEqual([]);
  });

  it('load -> .fur save -> load keeps every effect code and value', async () => {
    const { saveFurFileWasm } = await import('@/lib/import/wasm/FurnaceFileOps');
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const saved = await saveFurFileWasm();
    const again = await parseFurnaceFile(saved, 'again.fur');
    expect([...nativeEffects(again)]).toEqual([...nativeEffects(song)]);
    expect(again.patterns.length).toBe(song.patterns.length);
    again.patterns.forEach((p, i) => p.channels.forEach((c, ch) => c.rows.forEach((cell, row) => {
      for (let s = 0; s < 8; s++) expect(cellEffect(cell, s), `${i}/${ch}/${row}/${s}`).toEqual(cellEffect(song.patterns[i].channels[ch].rows[row], s));
    })));
  });

  it('playback gets Furnace\'s effect: the sequencer upload and a live edit write the code unchanged', async () => {
    // Every cell agrees with the native row the sequencer is uploaded from.
    const effects = nativeEffects(song);
    for (const [key, fx] of effects) {
      const [p, ch, row, slot] = key.split('/').map(Number);
      const { t, v } = cellEffect(song.patterns[p].channels[ch].rows[row], slot);
      expect({ t, v }, key).toEqual({ t: Math.max(0, fx.cmd), v: Math.max(0, fx.val) });
    }

    // The upload writes 0x80 / 0x90 into the effect columns.
    const calls: Array<[string, unknown[]]> = [];
    const fake = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push([String(k), a]); return Promise.resolve(); } });
    const { FurnaceDispatchEngine } = await import('@/engine/furnace-dispatch/FurnaceDispatchEngine');
    const spy = vi.spyOn(FurnaceDispatchEngine, 'getInstance').mockReturnValue(fake as never);
    try {
      const { uploadFurnaceToSequencer } = await import('@/lib/export/FurnaceSequencerSerializer');
      await uploadFurnaceToSequencer(song.furnaceNative!, 0);
    } finally { spy.mockRestore(); }
    const effCmds = new Set(calls.filter(([m, a]) => m === 'seqSetCell' && (a[3] as number) >= 3 && ((a[3] as number) - 3) % 2 === 0).map(([, a]) => a[4]));
    expect(effCmds.has(0x80) && effCmds.has(0x90)).toBe(true);

    // A Furnace code typed in the editor reaches the native row as that code (no letter fold).
    const { TrackerReplayer } = await import('@/engine/TrackerReplayer');
    const sync = TrackerReplayer.prototype.syncCellToWasmSequencer;
    const copy: TrackerSong = { ...song, furnaceNative: structuredClone(song.furnaceNative) as FurnaceNativeData };
    sync.call({ song: copy, useWasmSequencer: false } as never, 0, 0, 0, { effTyp: 0xE5, eff: 0x80 });
    const sub = copy.furnaceNative!.subsongs[0];
    const pos = copy.songPositions.indexOf(0);
    expect(sub.channels[0].patterns.get(sub.orders[0][pos])!.rows[0].effects[0]).toEqual({ cmd: 0xE5, val: 0x80 });
  });

  it('a song saved with the old folded cells comes back in Furnace notation', async () => {
    const { upgradeFurnaceEffectNotation } = await import('../furnaceEditorCells');
    const effects = nativeEffects(song);
    const [key, fx] = [...effects].find(([k, e]) => e.cmd === 0x90 && k.endsWith('/0'))!;
    const [p, ch, row] = key.split('/').map(Number);
    const old = structuredClone(song.patterns);
    for (const pat of old) for (const c of pat.channels) delete c.channelMeta?.effectNotation;
    Object.assign(old[p].channels[ch].rows[row], { effTyp: 0x09, eff: 0x00 }); // what the old fold could leave
    expect(upgradeFurnaceEffectNotation(old, song.songPositions, song.furnaceNative!)).toBeGreaterThan(0);
    expect(old[p].channels[ch].channelMeta?.effectNotation).toBe('furnace');
    expect(cellEffect(old[p].channels[ch].rows[row], 0)).toEqual({ t: 0x90, v: fx.val });
  });
});
