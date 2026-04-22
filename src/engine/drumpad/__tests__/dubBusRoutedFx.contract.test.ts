/**
 * Contract test: DJ FX echo/reverb/flanger pads must route through the
 * DubBus (SpaceEcho + Aelapse spring reverb WASM) — NOT create standalone
 * Web Audio delay/convolver nodes.
 *
 * Regression guard for the 2026-04-22 fix that replaced 5 naive effects
 * (createDubEcho, createTapeEcho, createPingPong, createReverbWash,
 * createFlanger) with DubBus-routed versions using engageDubBusFx().
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../DjFxActions.ts'),
  'utf-8',
);

/** Extract the body of a named factory function (e.g. createDubEcho). */
function extractFactory(name: string): string {
  const re = new RegExp(`function ${name}\\(\\)[^{]*\\{`);
  const m = re.exec(SRC);
  if (!m) throw new Error(`Factory ${name} not found`);
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (depth > 0 && i < SRC.length) {
    if (SRC[i] === '{') depth++;
    if (SRC[i] === '}') depth--;
    i++;
  }
  return SRC.slice(start, i);
}

const DUB_BUS_ROUTED = [
  'createDubEcho',
  'createTapeEcho',
  'createPingPong',
  'createReverbWash',
  'createFlanger',
] as const;

describe('DJ FX pads route through DubBus (not naive Web Audio)', () => {
  for (const factory of DUB_BUS_ROUTED) {
    describe(factory, () => {
      const body = extractFactory(factory);

      it('calls engageDubBusFx in engage()', () => {
        expect(body).toContain('engageDubBusFx');
      });

      it('calls disengageDubBusFx in disengage()', () => {
        expect(body).toContain('disengageDubBusFx');
      });

      it('does NOT create raw Web Audio delay nodes', () => {
        expect(body).not.toContain('ctx.createDelay');
        expect(body).not.toContain('createDelay(');
      });

      it('does NOT create raw Web Audio convolver nodes', () => {
        expect(body).not.toContain('ctx.createConvolver');
        expect(body).not.toContain('createConvolver(');
      });

      it('does NOT tap the master output node directly', () => {
        expect(body).not.toContain('getMasterOutputNode');
      });
    });
  }
});
