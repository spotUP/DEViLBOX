/**
 * Waveform Studio export: one wave as the bytes and text a chip driver or C build consumes.
 * The wave is first fitted to the chip target (length snapped, levels requantised) by the
 * studio's own applyChipTarget, so every format carries what the chip would play.
 */
import { packWave } from '@lib/export/gb/hugeSong';
import { snapLength, type ChipTarget } from './chipTargets';
import { applyChipTarget } from './waveformOps';

/** The wave as the chip stores it: target length, levels 0..target.maxValue. */
export function fitWaveToChip(data: number[], max: number, target: ChipTarget): number[] {
  return applyChipTarget(data, max, snapLength(target, data.length), target.maxValue).data;
}

/** Levels as the chip reads them: signed chips (SCC) centre on half range, 128 -> 0. */
function chipValues(levels: number[], target: ChipTarget): number[] {
  const mid = (target.maxValue + 1) / 2;
  return target.signed ? levels.map((v) => v - mid) : levels;
}

/**
 * Raw dump in the chip's memory layout. Game Boy wave RAM: two samples per byte, high nibble
 * first (hUGEDriver's packing). N163 and WonderSwan: two samples per byte, low nibble first.
 * Signed chips: two's complement bytes. Others: one byte per sample.
 */
export function waveToRawBytes(data: number[], max: number, target: ChipTarget): Uint8Array {
  const levels = fitWaveToChip(data, max, target);
  if (target.id === 'gameboy') return Uint8Array.from(packWave(levels, false));
  if (target.id === 'n163' || target.id === 'wonderswan') {
    const out = new Uint8Array(Math.ceil(levels.length / 2));
    levels.forEach((v, i) => { out[i >> 1] |= (v & 15) << ((i & 1) * 4); });
    return out;
  }
  return Uint8Array.from(chipValues(levels, target).map((v) => v & 0xff));
}

/** C identifier from a wave name: letters, digits, underscores; never starts with a digit. */
export function waveIdentifier(name: string): string {
  const id = name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'wave';
  return /^[0-9]/.test(id) ? `wave_${id}` : id;
}

/** C header with the fitted levels (signed chips as signed char) and the length as a define. */
export function waveToCHeader(name: string, data: number[], max: number, target: ChipTarget): string {
  const id = waveIdentifier(name);
  const guard = `${id.toUpperCase()}_H`;
  const values = chipValues(fitWaveToChip(data, max, target), target);
  const rows: string[] = [];
  for (let i = 0; i < values.length; i += 16) rows.push(`  ${values.slice(i, i + 16).join(', ')}`);
  return [
    `/* ${target.name}: ${values.length} samples, levels ${target.signed ? `${-((target.maxValue + 1) / 2)}..${(target.maxValue - 1) / 2}` : `0..${target.maxValue}`} */`,
    `#ifndef ${guard}`,
    `#define ${guard}`,
    '',
    `#define ${id.toUpperCase()}_LEN ${values.length}`,
    '',
    `static const ${target.signed ? 'signed' : 'unsigned'} char ${id}[${id.toUpperCase()}_LEN] = {`,
    rows.join(',\n'),
    '};',
    '',
    `#endif /* ${guard} */`,
    '',
  ].join('\n');
}

/** One cycle as -1..1 floats for a .wav (silence level 0). */
export function waveToUnitSamples(data: number[], max: number, target: ChipTarget): Float32Array<ArrayBuffer> {
  const levels = fitWaveToChip(data, max, target);
  return Float32Array.from(levels, (v) => (v / target.maxValue) * 2 - 1);
}
