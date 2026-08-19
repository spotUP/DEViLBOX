/**
 * uadeAudioDeviceRobustness.test.ts — the fake audio.device must survive bad input.
 *
 * audiodevice.c turns module-supplied 68k values into host pointers and array indices:
 * io_Unit becomes an index into _write_msg_list[4] / audio_channel[4], ioa_Data becomes
 * a host pointer, ioa_Length bounds a loop, and the reply chain is walked link by link.
 * Before the boundary was validated, a unit with no channel bit yielded -1 and reached
 * `_write_msg_list[-1]` as a write, an unvalidated address was dereferenced through
 * get_real_address(), and a cyclic reply list spun forever on the render thread.
 *
 * A truncated MaxTrax file drives that code through the real, shipped wasm: the score
 * still opens the fake device and issues CMD_WRITE / ADCMD_PERVOL, but the data it points
 * at is gone. The requirement is a clean failure or clean silence — never a trap, never a
 * hang, and never a corrupted engine for the next load.
 *
 * SCOPE: this is a crash guard at the product's entry point, NOT the decider for the
 * bounds fixes — it was measured to pass against the pre-fix audiodevice.c too, because
 * a truncated file does not happen to produce a channel-less io_Unit. The deciding test
 * is audiodeviceSafety.test.ts, whose six sanitizer cases all fail on the pre-fix source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderFileToSamples } from '../../../../tools/uade-audit/uadeRenderCore';

const ROOT = process.cwd();
const MXTX_PATH = join(ROOT, 'public/data/songs/maxtrax/antmusic.mxtx');
const SAMPLE_RATE = 44100;

/** Fractions of the file to keep — header only, through the score, into the sample bank. */
const TRUNCATIONS = [0.05, 0.25, 0.5, 0.75, 0.95];

describe('fake audio.device — malformed input', () => {
  it('fails cleanly or renders silence for truncated MaxTrax files, never crashing', async () => {
    const full = new Uint8Array(readFileSync(MXTX_PATH));

    for (const fraction of TRUNCATIONS) {
      const truncated = full.slice(0, Math.floor(full.length * fraction));

      // Either outcome is acceptable: UADE rejects the file (throws on ret != 0), or it
      // loads and renders. What must not happen is a wasm trap, an OOB write corrupting
      // the heap, or an unbounded loop inside the reply-list walk.
      let rendered = false;
      try {
        const r = await renderFileToSamples(truncated, 'antmusic.mxtx', {
          sampleRate: SAMPLE_RATE,
          seconds: 2,
        });
        rendered = true;
        expect(r.samples.length).toBe(r.frames * 2);
        // Whatever it produced must be finite — NaN/Infinity here means the DMA pointers
        // were taken from unvalidated memory.
        for (let i = 0; i < r.samples.length; i += 997) {
          expect(Number.isFinite(r.samples[i])).toBe(true);
        }
      } catch (err) {
        // A rejected load is a clean failure, and that is what we want to see.
        expect(String(err)).toMatch(/uade_wasm_load failed|unsupported|Not a /i);
      }
      expect(typeof rendered).toBe('boolean');
    }
  }, 120_000);

  it('still renders the intact file after the malformed ones (engine not left corrupted)', async () => {
    const full = new Uint8Array(readFileSync(MXTX_PATH));
    const r = await renderFileToSamples(full, 'antmusic.mxtx', {
      sampleRate: SAMPLE_RATE,
      seconds: 3,
    });

    expect(r.frames).toBeGreaterThan(SAMPLE_RATE * 2);
    let nz = 0;
    for (let f = 0; f < r.frames; f++) if (Math.abs(r.samples[f * 2]) > 1e-4) nz++;
    expect(nz / r.frames).toBeGreaterThan(0.1);
  }, 120_000);
});
