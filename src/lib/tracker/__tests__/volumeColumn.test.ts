import { describe, it, expect } from 'vitest';
import { decodeVolumeColumn, usesRawVolumeColumn, VOLUME_COLUMN_MAX } from '../volumeColumn';

/**
 * A song going silent at the same row on every play.
 *
 * Measured 2026-09-22 on jennipha.ahx. Channel 1 of pattern 0 row 0x2E carries
 * an ordinary AHX volume of 16. `AutomationPlayer` read every format's volume
 * column with the XM convention, where 0x10 means "set volume 0", and passed
 * the resulting 0 to `HivelySynth.set('volume', …)` — which is the output gain
 * of the WHOLE SONG, not of that channel. The transport kept running and the
 * replayer kept rendering at full level; only the last node before the mixer
 * was at zero, so every upstream meter looked healthy.
 */

describe('an AHX volume column', () => {
  it('reads 16 as a mid-level volume, not as XM "set volume 0"', () => {
    // The exact cell that silenced the song.
    expect(decodeVolumeColumn(16, 'hively')).toBeCloseTo(16 / VOLUME_COLUMN_MAX, 6);
    expect(decodeVolumeColumn(16, 'hively')).not.toBe(0);
  });

  it('reads the full range as a plain 0-64 level', () => {
    expect(decodeVolumeColumn(64, 'hively')).toBe(1);
    expect(decodeVolumeColumn(32, 'hively')).toBeCloseTo(0.5, 6);
    expect(decodeVolumeColumn(3, 'hively')).toBeCloseTo(3 / 64, 6);
  });

  it('treats an empty column as no instruction rather than silence', () => {
    // These formats leave the column at 0 on every cell that says nothing.
    // Reading that as "be silent" would mute the channel on almost every row.
    expect(decodeVolumeColumn(0, 'hively')).toBeNull();
    expect(decodeVolumeColumn(null, 'hively')).toBeNull();
    expect(decodeVolumeColumn(undefined, 'hively')).toBeNull();
  });

  it('clamps a value above the range rather than exceeding unity', () => {
    expect(decodeVolumeColumn(200, 'hively')).toBe(1);
  });
});

describe('an XM volume column', () => {
  it('still applies the 0x10 offset', () => {
    expect(decodeVolumeColumn(0x10, 'xm')).toBe(0);
    expect(decodeVolumeColumn(0x50, 'xm')).toBe(1);
    expect(decodeVolumeColumn(0x30, 'xm')).toBeCloseTo(0.5, 6);
  });

  it('ignores the range that carries no volume data', () => {
    expect(decodeVolumeColumn(0x00, 'xm')).toBeNull();
    expect(decodeVolumeColumn(0x0f, 'xm')).toBeNull();
  });

  it('ignores volume-column EFFECTS, which are commands and not levels', () => {
    // 0x60+ is slide/vibrato/panning. Reading one as a level is how a fine
    // volume slide down would arrive as "set volume to something arbitrary".
    expect(decodeVolumeColumn(0x60, 'xm')).toBeNull();
    expect(decodeVolumeColumn(0xc4, 'xm')).toBeNull();
  });

  it('is the default for an unknown editor mode', () => {
    expect(decodeVolumeColumn(0x10, null)).toBe(0);
    expect(decodeVolumeColumn(16, undefined)).toBe(0);
  });
});

describe('which formats use which convention', () => {
  it('names the native-replayer modes as raw', () => {
    expect(usesRawVolumeColumn('hively')).toBe(true);
    expect(usesRawVolumeColumn('uade')).toBe(true);
  });

  it('leaves the XM family alone', () => {
    expect(usesRawVolumeColumn('xm')).toBe(false);
    expect(usesRawVolumeColumn('tracker')).toBe(false);
    expect(usesRawVolumeColumn(null)).toBe(false);
  });
});
