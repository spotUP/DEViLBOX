/**
 * Contract tests for the export capture tap.
 *
 * WAV / MP3 exports tap the audio graph at `ToneEngine.blepInput`. Anything
 * that reaches the speaker but doesn't flow through `blepInput` is silently
 * dropped from the exported file.
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

    it('taps live capture at `blepInput` (post master FX, pre master volume)', () => {
      // Both the buffer and blob capture paths must read from blepInput.
      const tapCount = (src.match(/toneEngine\.blepInput|toneEngine\?\.blepInput/g) ?? []).length;
      expect(tapCount, 'blepInput must be referenced as the capture tap').toBeGreaterThan(0);
    });

    it('does not tap master volume / masterChannel (would miss master-effects-muted exports)', () => {
      // masterChannel is post-capture — connecting to it would capture a
      // signal that already went through the export tap, or bypass user
      // master-volume changes during playback. Grep proactively.
      expect(src).not.toMatch(/\.masterChannel\)\s*\.connect|masterChannel\s*->\s*processor/);
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
