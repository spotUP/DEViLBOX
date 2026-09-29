/**
 * One setting, one control on screen.
 *
 * Owner, 2026-09-30: "we have a return gain knob and an fx wet slider, when i
 * turn the knob the slider moves", "echo intensity knob and feedback slider
 * also seem to be linked?" - the live row drew returnGain and echoIntensity
 * as sliders under other names while the controller deck's encoders turned
 * the same settings. The live row now hides a slider the deck covers, and
 * names its sliders as the knobs are named.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { busParamsOnDeck } from '../deckShape';

describe('live row vs controller deck', () => {
  it('lists the bus settings the deck turns', () => {
    const on = busParamsOnDeck({
      k1: { turn: { kind: 'busParam', target: 'dub.returnGain' } },
      k2: { turn: { kind: 'busParam', target: 'dub.echoIntensity' } },
      b1: { press: { kind: 'armed', target: 'dub.armed' } },
    } as never);
    expect([...on].sort()).toEqual(['dub.echoIntensity', 'dub.returnGain']);
  });

  it('the live row hides those sliders while the deck is on screen, under the knobs\' names', () => {
    const strip = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf8');
    expect(strip).toContain("showLiveRowSlider('dub.returnGain')");
    expect(strip).toContain("showLiveRowSlider('dub.echoIntensity')");
    expect(strip).toContain("DUB_BUS_PARAMS['dub.returnGain'].label");
    expect(strip).not.toContain('>FX WET<');
    expect(strip).not.toContain('>FEEDBACK<');
  });
});
