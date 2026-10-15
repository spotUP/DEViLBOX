import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import * as helm from '../parsers/helm';
import * as vital from '../parsers/vital';
import * as amsynth from '../parsers/amsynth';
import * as geonkick from '../parsers/geonkick';
import * as synthv1 from '../parsers/synthv1';
import * as calf from '../parsers/calfMono';
import * as setbfree from '../parsers/setBfree';
import * as tunefish from '../parsers/tunefish';
import * as zyn from '../parsers/zynaddsubfx';
import * as monique from '../parsers/monique';
import { TUNEFISH_PARAMS } from '../tables/tunefishParams';
import { bytes } from './helpers';

const samples: Record<string, { file: string; data: Uint8Array }> = {
  helm: { file: 'a.helm', data: bytes('{"patch_name":"x","settings":{"cutoff":60}}') },
  vital: { file: 'a.vital', data: bytes('{"preset_name":"x","settings":{"volume":1}}') },
  amsynth: { file: 'a.bank', data: bytes('amSynth\n<preset> <name> x\n<parameter> amp_attack 0.1\nEOF\n') },
  geonkick: { file: 'a.gkick', data: bytes('{"kick":{"name":"x"},"osc0":{"enabled":true}}') },
  synthv1: { file: 'a.synthv1', data: bytes('<!DOCTYPE synthv1>\n<preset name="x"><params><param name="DCO1_SHAPE1">1</param></params></preset>') },
  calf: { file: 'presets.xml', data: bytes('<presets>\n<preset plugin="monosynth" name="x"><param name="cutoff" value="1000"/></preset></presets>') },
  setbfree: { file: 'a.pgm', data: bytes('1 { name="x", drawbars="888 0000 000" }\n') },
  tunefish: { file: 'program0.txt', data: bytes(`x\n${TUNEFISH_PARAMS.map((p) => `${p[0]};0.5`).join('\n')}\n`) },
  zyn: { file: 'a.xiz', data: new Uint8Array(gzipSync(Buffer.from('<ZynAddSubFX-data><INSTRUMENT/></ZynAddSubFX-data>'.padEnd(60, ' ')))) },
  monique: { file: 'a.mlprog', data: bytes('<?xml version="1.0"?>\n<PROJECT-1.0 SD_2_volume="1"/>') },
};
const sniffers: Record<string, (b: Uint8Array, f: string) => boolean> = {
  helm: helm.sniff, vital: vital.sniff, amsynth: amsynth.sniff, geonkick: geonkick.sniff, synthv1: synthv1.sniff,
  calf: calf.sniff, setbfree: setbfree.sniff, tunefish: tunefish.sniff, zyn: zyn.sniff, monique: monique.sniff,
};

describe('sniff exclusivity across all parsers', () => {
  for (const [owner, sample] of Object.entries(samples)) {
    it(`${owner} sample is claimed by exactly its own parser`, () => {
      const claimed = Object.entries(sniffers).filter(([, s]) => s(sample.data, sample.file)).map(([n]) => n);
      expect(claimed).toEqual([owner]);
    });
  }

  it('no sniffer throws or claims empty, tiny or binary input', () => {
    for (const data of [new Uint8Array(0), new Uint8Array([0]), new Uint8Array(512).fill(255), new Uint8Array(100).map((_, i) => i)]) {
      for (const [name, s] of Object.entries(sniffers)) expect(s(data, 'x.bin'), name).toBe(false);
    }
  });
});
