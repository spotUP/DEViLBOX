/**
 * Regression: Jochen Hippel CoSo was an encode-pattern stub — its variable
 * encoder re-derived a CoSo byte stream from the EDITABLE display grid
 * (xmNoteToCoSo + a synthesised info byte), which does not reproduce the real
 * variable-length pattern block (matchPct 0.0000: not one block matched).
 *
 * A CoSo pattern is a per-channel command byte stream (note = note+info[+infoPrev],
 * -1 = end, -2/-3 = repeat), not a fixed grid, so the only faithful byte-exact
 * inverse is a whole-block carrier encoder. The parser now decodes each block
 * into carrier-bearing cells (cutoff=len, period=b0, pan=b1, resonance=b2) exposed
 * on `layout.blockRows`, and `hippelCoSoEncoder.encodePattern` concatenates the
 * carriers to reproduce every block verbatim. The display grid stays carrier-less
 * and editable (edits export via buildCoSoFile, a separate path).
 *
 * On revert (grid re-encode / no blockRows) the encoder emits a synthesised stream
 * that differs from the source, so no block matches and this test fails.
 *
 * Fixture: public/data/songs/formats/prehistoric_tale.hipc (real module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHippelCoSoFile } from '../HippelCoSoParser';
import { exportAsHippelCoSo } from '@lib/export/HippelCoSoExporter';
import type { TrackerSong } from '@engine/TrackerReplayer';
import type { HippelCoSoConfig } from '@/types/instrument';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIXTURE = join(process.cwd(), 'public/data/songs/formats/prehistoric_tale.hipc');

describe('Hippel CoSo pattern codec', () => {
  it('the variable encoder reproduces every pattern block byte-for-byte', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const song = await parseHippelCoSoFile(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      'prehistoric_tale.hipc',
    );
    expect(song, 'parse succeeds').toBeTruthy();

    const layout = (song as unknown as { uadeVariableLayout?: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout, 'variable layout present').toBeTruthy();
    if (!layout) throw new Error('no variable layout');
    expect(layout.formatId).toBe('hippelCoSo');

    const { filePatternAddrs, filePatternSizes, blockRows, encoder } = layout;
    expect(filePatternAddrs.length, 'has file-pattern blocks').toBeGreaterThan(0);
    // Byte-exact carriers live on blockRows (the CoSo block is a command stream
    // that straddles the display grid), NOT in the editable display cells.
    expect(blockRows, 'layout exposes per-block carrier rows').toBeTruthy();
    if (!blockRows) throw new Error('no blockRows');
    expect(blockRows.length, 'one carrier-row set per file-pattern').toBe(filePatternAddrs.length);

    let checked = 0;
    let sawCommands = false; // a block with real command bytes (not empty)
    for (let fp = 0; fp < filePatternAddrs.length; fp++) {
      const addr = filePatternAddrs[fp];
      const size = filePatternSizes[fp];
      if (size <= 0 || addr < 0 || addr + size > raw.length) continue;

      const orig = raw.subarray(addr, addr + size);
      if (size > 1) sawCommands = true;
      const re = encoder.encodePattern(blockRows[fp], 0);
      expect([...re], `block fp${fp} @${addr} size ${size}`).toEqual([...orig]);
      checked++;
    }

    expect(checked, 'at least one block round-tripped').toBeGreaterThan(0);
    expect(sawCommands, 'fixture exercises multi-byte command blocks').toBe(true);
  });
});

describe('Hippel CoSo export', () => {
  // The from-scratch serializer wrote 0 sample headers and 0 PCM bytes (and no
  // TFMX block), so every sample-playing instrument went silent after export and
  // the New Song template had nothing to sound a typed note with. Export is the
  // loaded module with the grid edits written in, so the sample bank survives.
  it('keeps sample data on export', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const src = await parseHippelCoSoFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'prehistoric_tale.hipc');
    const srcHc = (src.instruments[0] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso;
    const srcBank = srcHc.sampleBank ?? [];
    expect(srcBank.length, 'fixture has a sample bank').toBeGreaterThan(0);

    const out = new Uint8Array(await (await exportAsHippelCoSo(src as TrackerSong)).data.arrayBuffer());
    const re = await parseHippelCoSoFile(out.buffer.slice(0) as ArrayBuffer, 'prehistoric_tale.hipc');
    const reHc = (re.instruments[0] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso;
    expect(reHc.sampleBank ?? []).toEqual(srcBank);

    const pcmOf = (s: TrackerSong) => s.instruments.map((i) => ((i as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso.samples ?? []).map((x) => x.pcm));
    const srcPcm = pcmOf(src as TrackerSong);
    expect(srcPcm.flat(2).length, 'fixture instruments play sample bytes').toBeGreaterThan(0);
    expect(pcmOf(re as TrackerSong)).toEqual(srcPcm);
  }, 30000);

  it('keeps sample data when the notes are cleared (from-scratch writer)', async () => {
    const raw = new Uint8Array(readFileSync(FIXTURE));
    const src = await parseHippelCoSoFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), 'prehistoric_tale.hipc');
    const srcBank = (src.instruments[0] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso.sampleBank ?? [];
    for (const p of src.patterns) for (const ch of p.channels) for (const row of ch.rows) { row.note = 0; row.instrument = 0; }

    const out = new Uint8Array(await (await exportAsHippelCoSo(src as TrackerSong)).data.arrayBuffer());
    expect(String.fromCharCode(...out.subarray(0x20, 0x24)), 'decoder needs TFMX at +0x20').toBe('TFMX');
    const re = await parseHippelCoSoFile(out.buffer.slice(0) as ArrayBuffer, 'cleared.hipc');
    const notes = re.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((r) => r.note > 0).length;
    expect(notes).toBe(0);
    expect((re.instruments[0] as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso.sampleBank ?? []).toEqual(srcBank);
    const pcmBytes = re.instruments.flatMap((i) => ((i as unknown as { hippelCoso: HippelCoSoConfig }).hippelCoso.samples ?? []).map((x) => x.pcm.length));
    expect(pcmBytes.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  }, 30000);
});
