/**
 * Owner rule (2026-10-07): an instrument without a name exports with an empty
 * name field. No exporter writes a fabricated "Sample 3" / "Instrument 7" into
 * a saved file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseMODFile, parseMOD } from '@lib/import/formats/MODParser';
import { exportSongToMOD } from '../modExport';

const MICRO15 = resolve(__dirname, '../../../__tests__/fixtures/micro15-goto80.mod');

describe('an unnamed instrument exports with an empty name', { timeout: 30_000 }, () => {
  it('MOD: every sample header name is empty when the song names no instrument', async () => {
    const b = readFileSync(MICRO15);
    const song = await parseMODFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, 'micro15.mod');
    for (const inst of song.instruments) inst.name = '';
    const out = new Uint8Array(await (await exportSongToMOD(song)).blob.arrayBuffer());
    const parsed = await parseMOD(out.buffer.slice(0) as ArrayBuffer, 'test.mod');
    expect(parsed.header.samples.map((s) => s.name.trim())).toEqual(new Array(31).fill(''));
  });

  it('no exporter falls back to a generated instrument or sample name', () => {
    const dir = resolve(__dirname, '..');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      readFileSync(join(dir, f), 'utf8').split('\n').forEach((line, i) => {
        if (/warn|console\.|throw |Error\(/.test(line)) return;
        if (/(\|\||\?\?)\s*`[A-Za-z ]*(Sample|Instrument|Synth|Inst) ?\$\{/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
