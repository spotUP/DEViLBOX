/**
 * snareCrack — fire a short noise burst into the dub bus. The bus catches
 * it in the echo / spring path so you hear a crack → tail of metallic
 * reverb → echoed repeats of the crack. Classic King Tubby accent for
 * punching holes in a groove.
 *
 * Global move (though in a future revision we might make it channel-scoped
 * so each tracker channel's dub tap gets its own characteristic noise
 * color). The default 40ms / 0.6 level reads as a "crack" rather than a
 * hat tick or a kick thump — tune via params for different flavors.
 */

import type { DubMove } from './_types';

export const snareCrack: DubMove = {
  id: 'snareCrack',
  kind: 'trigger',
  defaults: { durationMs: 40, level: 0.6 },

  execute({ bus, params }) {
    const durationMs = params.durationMs ?? this.defaults.durationMs;
    const level = params.level ?? this.defaults.level;
    bus.fireNoiseBurst(durationMs, level);
    return null;
  },
};
