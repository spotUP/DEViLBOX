/**
 * Act 1 on a Generate (R2f): the TS bank is built locally with every stage observed (no audio goes over the wire),
 * and the events go through the factory seam. The build runs at full speed; the panel paces the presentation.
 */
import { createEmitter } from '@/engine/uprough/r2Events';
import { buildBank } from '@/engine/uprough/songRender';
import type { HipHopStyle } from '@/engine/uprough/drumBank';
import { factoryOnEvent } from './useFactoryStore';

export const FACTORY_RATE = 22050;

export function runActOne(style: HipHopStyle, seed: number, rate = FACTORY_RATE): void {
  const em = createEmitter(factoryOnEvent)!;
  em.emit({ type: 'start', mode: 'render', rate, style, seed, sections: [] });
  buildBank(em, style, rate, seed);
}
