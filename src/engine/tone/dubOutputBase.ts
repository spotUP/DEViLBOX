/** First worklet output index dedicated to per-channel dub sends (the 4-slot engines). */
export const DUB_OUTPUT_BASE = 5;

/**
 * Engines whose isolation pool is bigger than the default 4 slots put their
 * dub outputs after it. They register their node's first dub output here so
 * the dub wiring does not assume DUB_OUTPUT_BASE. A leaf module so engines
 * can import it without pulling in the effect chain.
 */
const dubOutputBases = new WeakMap<AudioNode, number>();
export function registerDubOutputBase(node: AudioNode, base: number): void {
  dubOutputBases.set(node, base);
}
export function dubOutputBaseOf(node: AudioNode): number {
  return dubOutputBases.get(node) ?? DUB_OUTPUT_BASE;
}
