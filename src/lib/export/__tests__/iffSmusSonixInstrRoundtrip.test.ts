/**
 * Regression (Sonix P7): edited SonixSynth params must ROUND-TRIP to the native `.instr`.
 *
 * The `.smus` body carries no synth parameters — a re-import reads each synth voice's params
 * from its `.instr` binary companion (IffSmusParser → parseSonixSynthInstr). Before this fix
 * the IFF SMUS exporter emitted only the `.smus`, so editing a knob in SonixControls and
 * exporting silently lost every synth-param edit on re-import.
 *
 * This exercises the real export companion path:
 *   real `.instr` fixture → decode params → edit one field + one waveform sample →
 *   serialize back via the exporter's companion builder → re-decode the emitted `.instr` →
 *   assert the edit survived AND every unedited field/byte is preserved verbatim.
 *
 * Revert-check: make `buildSonixInstrCompanions` copy the original bytes instead of calling
 * `serializeSonixSynthInstr` (or make `serializeSonixSynthInstr` return `original.slice()`)
 * and the "edit survives" assertions fail — the edits are lost, exactly the bug being fixed.
 *
 * Fixtures: public/data/songs/sonix-smus/ACE II/Instruments/ (committed real Sonix files).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { InstrumentConfig } from '@typedefs/instrument';
import { parseSonixSynthInstr } from '@engine/sonix/sonixInstrument';
import { buildSonixInstrCompanions } from '../IffSmusExporter';

const DIR = join(process.cwd(), 'public/data/songs/sonix-smus/ACE II/Instruments');
const read = (name: string) => new Uint8Array(readFileSync(join(DIR, name)));

/** Build a SonixSynth instrument config carrying the given params under parameters.sonix. */
function synthInstr(id: number, name: string, params: ReturnType<typeof parseSonixSynthInstr>): InstrumentConfig {
  return {
    id,
    name,
    type: 'synth',
    synthType: 'SonixSynth',
    parameters: { sonixIndex: params!.index, sonix: params },
  } as unknown as InstrumentConfig;
}

describe('IFF SMUS export — Sonix .instr synth-param round-trip', () => {
  it('writes edited baseVol + waveform back into the .instr and preserves everything else', () => {
    const original = read('Ace2leed.instr');
    const parsed = parseSonixSynthInstr(original);
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    // Sanity: the fixture's known params (from the C oracle) — proves we edit real values.
    expect(parsed.baseVol).toBe(255);
    expect(parsed.envPitchScale).toBe(64);

    // Edit: change two independent kinds of field — a scalar and one waveform sample.
    const edited = {
      ...parsed,
      baseVol: 100,
      c4: 4095,
      wave: parsed.wave.slice(),
    };
    edited.wave[0] = 77;
    edited.wave[127] = -100;

    const aceSidecar = { path: 'sonix/Instruments/Ace2leed.instr', data: original.buffer.slice(0) };
    const montySidecar = { path: 'sonix/Instruments/Monty1.instr', data: read('Monty1.instr').buffer.slice(0) };

    // (a) An UNEDITED synth voice re-serializes byte-for-byte identical to the original —
    //     proves the serializer touches only the param fields and preserves every other byte
    //     (header, reserved, trailing) exactly. This is the strong preservation guarantee.
    const unedited = buildSonixInstrCompanions([aceSidecar], [synthInstr(1, 'Ace2leed', parsed)]);
    expect(unedited).toHaveLength(1);
    expect(Array.from(unedited[0].data)).toEqual(Array.from(original));

    // (b) The edited voice, alongside an un-edited neighbour that has no store entry.
    const companions = buildSonixInstrCompanions(
      [aceSidecar, montySidecar],
      [synthInstr(1, 'Ace2leed', edited)],
    );
    expect(companions.map((c) => c.name).sort()).toEqual([
      'Instruments/Ace2leed.instr',
      'Instruments/Monty1.instr',
    ]);

    const aceOut = companions.find((c) => c.name === 'Instruments/Ace2leed.instr')!.data;
    const montyOut = companions.find((c) => c.name === 'Instruments/Monty1.instr')!.data;
    expect(aceOut.length).toBe(original.length);

    // Re-decode the emitted .instr — the edits must survive a full round-trip.
    const reparsed = parseSonixSynthInstr(aceOut);
    expect(reparsed).not.toBeNull();
    if (!reparsed) return;
    expect(reparsed.baseVol).toBe(100);
    expect(reparsed.c4).toBe(4095);
    expect(reparsed.wave[0]).toBe(77);
    expect(reparsed.wave[127]).toBe(-100);

    // Unedited fields survive unchanged.
    expect(reparsed.envPitchScale).toBe(parsed.envPitchScale);
    expect(reparsed.filterBase).toBe(parsed.filterBase);
    expect(reparsed.envLoopMode).toBe(parsed.envLoopMode);
    expect(reparsed.egLevels).toEqual(parsed.egLevels);
    expect(reparsed.egRates).toEqual(parsed.egRates);
    expect(reparsed.wave.slice(1, 127)).toEqual(parsed.wave.slice(1, 127));

    // The un-edited Monty1.instr is copied byte-for-byte.
    expect(Array.from(montyOut)).toEqual(Array.from(read('Monty1.instr')));
  });

  it('leaves sample (.ss) sidecars byte-identical and emits nothing when there are no sidecars', () => {
    expect(buildSonixInstrCompanions(undefined, [])).toEqual([]);
    expect(buildSonixInstrCompanions([], [])).toEqual([]);

    const ss = read('hidrum1.ss');
    const out = buildSonixInstrCompanions(
      [{ path: 'sonix/Instruments/hidrum1.ss', data: ss.buffer.slice(0) }],
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Instruments/hidrum1.ss');
    expect(Array.from(out[0].data)).toEqual(Array.from(ss));
  });
});
