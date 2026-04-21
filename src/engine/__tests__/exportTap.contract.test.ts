/**
 * Contract tests for the export capture tap.
 *
 * WAV / MP3 exports tap the audio graph at `ToneEngine.exportTap` — the node
 * sitting after the safety limiter and before master volume. Anything that
 * reaches the speaker but doesn't flow through `exportTap` is silently
 * dropped from the exported file.
 *
 * The safety limiter prevents channel-summing overloads (16 channels at 0 dB
 * can peak at ±16.0 = +24 dBFS) from destroying exports and screen recordings.
 *
 * This class of regression cost us the dub bus (siren, spring reverb, echo,
 * all 15 dub moves): `DrumPadEngine.masterGain` was connected straight to
 * `ctx.destination`, so exports were missing the entire dub layer — audible
 * live, invisible in the rendered WAV.
 *
 * We guard the fix by statically inspecting the source files that wire the
 * routing. No audio, no WASM, no ToneEngine instantiation — just text
 * assertions on the connection points. Runs in <50 ms.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Export capture tap — routing contract', () => {
  describe('audioExport.ts', () => {
    const src = read('lib/export/audioExport.ts');

    it('taps live capture at `exportTap` (post safety-limiter, pre master volume)', () => {
      // Both the buffer and blob capture paths must read from exportTap.
      const tapCount = (src.match(/toneEngine\.exportTap|toneEngine\?\.exportTap/g) ?? []).length;
      expect(tapCount, 'exportTap must be referenced as the capture tap').toBeGreaterThanOrEqual(2);
    });

    it('does not tap master volume / masterChannel (would miss master-effects-muted exports)', () => {
      // masterChannel is post-capture — connecting to it would capture a
      // signal that already went through the export tap, or bypass user
      // master-volume changes during playback. Grep proactively.
      expect(src).not.toMatch(/\.masterChannel\)\s*\.connect|masterChannel\s*->\s*processor/);
    });
  });

  describe('ToneEngine safety limiter routing', () => {
    const src = read('engine/ToneEngine.ts');

    it('has a safetyLimiter (Tone.Compressor) in the master chain', () => {
      expect(src).toMatch(/safetyLimiter:\s*Tone\.Compressor/);
      expect(src).toMatch(/new Tone\.Compressor\(/);
    });

    it('routes blepInput → safetyLimiter → exportTap → masterChannel', () => {
      // The static tail after BLEP: safetyLimiter → exportTap → masterChannel
      expect(src).toMatch(/safetyLimiter\.connect\(this\.exportTap\)/);
      expect(src).toMatch(/exportTap\.connect\(this\.masterChannel\)/);
    });

    it('BLEP chain targets safetyLimiter (not masterChannel directly)', () => {
      // reconnectBlepChain must route BLEP output to safetyLimiter
      expect(src).toMatch(/blepManager\.connect\(this\.blepInput,\s*this\.safetyLimiter\)/);
    });
  });

  describe('Peak normalization in WAV encoder', () => {
    const src = read('lib/export/audioExport.ts');

    it('normalizes peaks above 1.0 to a ceiling below 0 dBFS', () => {
      // If peak > 1.0, scale the entire buffer so the loudest sample fits
      expect(src).toMatch(/peak\s*>\s*1\.0/);
      expect(src).toMatch(/CEILING\s*\/\s*peak/);
    });
  });

  describe('Furnace worklet multi-chip gain staging', () => {
    it('attenuates per-chip output by 1/chipCount to prevent summing overload', () => {
      const worklet = readFileSync(resolve(ROOT, '../public/FurnaceChips.worklet.js'), 'utf8');
      // Each chip must be scaled by chipGain (1/chipCount) before summing
      expect(worklet).toMatch(/chipGain\s*=.*1\.0\s*\/\s*chipCount/);
      // The summing loop must multiply by chipGain
      expect(worklet).toMatch(/lView\[i\]\s*\*\s*chipGain/);
      expect(worklet).toMatch(/rView\[i\]\s*\*\s*chipGain/);
    });
  });

  describe('DrumPadEngine routing', () => {
    const drumpad = read('engine/drumpad/DrumPadEngine.ts');
    const routing = read('hooks/drumpad/useMIDIPadRouting.ts');

    it('useMIDIPadRouting resolves the default destination via ToneEngine', () => {
      // The singleton factory must pass a ToneEngine-linked destination so
      // drum pads + dub bus land in the export tap. Detected by either the
      // helper fn or a direct `masterEffectsInput` reference.
      expect(routing).toMatch(/resolveDefaultOutputDestination|masterEffectsInput/);
    });

    it('DrumPadEngine constructor accepts an outputDestination override', () => {
      // Required so the caller (useMIDIPadRouting) can hand in ToneEngine's
      // input node at construction time.
      expect(drumpad).toMatch(/constructor\s*\([^)]*outputDestination\??:\s*AudioNode/);
    });

    it('detachDJMixer restores to ToneEngine master chain, not ctx.destination', () => {
      // After the DJ view unmounts, the drumpad must fall back to the export-
      // visible path — not ctx.destination (which would re-hide the dub bus).
      const detach = drumpad.match(/detachDJMixer\(\):\s*void\s*\{[\s\S]*?\n\s{2}\}/);
      expect(detach, 'detachDJMixer method should be findable').not.toBeNull();
      const body = detach?.[0] ?? '';
      expect(body).toMatch(/masterEffectsInput|getToneEngine/);
    });
  });

  describe('DubBus → master chain', () => {
    const drumpad = read('engine/drumpad/DrumPadEngine.ts');

    it('DubBus is constructed with DrumPadEngine.masterGain as its master sink', () => {
      // Invariant: dub bus output flows through masterGain, so if masterGain
      // is routed into ToneEngine's chain, dub output comes with it.
      expect(drumpad).toMatch(/new DubBus\([^)]*this\.masterGain[^)]*\)/);
    });
  });
});
