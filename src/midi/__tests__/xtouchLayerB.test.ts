import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getControllerLayout,
  XTOUCH_LAYER_B_CC_OFFSET,
  XTOUCH_LAYER_B_NOTE_OFFSET,
  XTOUCH_LAYER_B_TOUCH_OFFSET,
} from '../controllerLayouts';
import type { ControlDescriptor } from '../controllerLayouts';

/**
 * The X-Touch Compact's LAYER switch is a hardware bank, not a software shift.
 *
 * Every control sends a different address on Layer B, so the same physical
 * knob is two assignable controls. The descriptor defined Layer A only, and
 * carried `layer-a` / `layer-b` as dead indicators with number -1 and -2 — so
 * half the controller could not be assigned in the mapping UI at all.
 *
 * Both factory diagrams, checked 2026-09-23:
 *   top encoders   A CC10-17 push 0-7     B CC37-44 push 55-62
 *   right encoders A CC18-25 push 8-15    B CC45-52 push 63-70
 *   button grid    A 16-23/24-31/32-39    B 71-78/79-86/87-94
 *   faders         A CC1-9  touch 101-109 B CC28-36 touch 111-119
 *   select row     A 40-48                B 95-103
 *   transport      A 49-54                B 104-109
 */
const layout = getControllerLayout('behringer-xtouch-compact')!;
const byId = (id: string): ControlDescriptor => {
  const c = layout.controls.find((x) => x.id === id);
  expect(c, `control ${id} missing`).toBeDefined();
  return c!;
};
const layerA = layout.controls.filter((c) => c.layer === 'A');
const layerB = layout.controls.filter((c) => c.layer === 'B');

describe('the X-Touch Compact descriptor has both hardware layers', () => {
  it('exists and tags every real control with a layer', () => {
    expect(layout).toBeDefined();
    const untagged = layout.controls.filter((c) => !c.layer && c.midi.number >= 0);
    expect(untagged.map((c) => c.id), 'real controls with no layer').toEqual([]);
  });

  it('gives Layer B one control for every addressable Layer A control', () => {
    expect(layerB).toHaveLength(layerA.filter((c) => c.midi.number >= 0).length);
    expect(layerB.length).toBeGreaterThan(40);
  });

  it('does not duplicate the layer indicators, which exist once for the device', () => {
    expect(layout.controls.filter((c) => c.id.startsWith('layer-'))).toHaveLength(2);
    expect(layout.controls.find((c) => c.id === 'layer-a-b')).toBeUndefined();
  });
});

describe('Layer B addresses match the factory diagram', () => {
  it('top encoders: CC10-17 push 0-7 becomes CC37-44 push 55-62', () => {
    expect(byId('enc-top-1').midi).toMatchObject({ type: 'cc', number: 10, pushNote: 0 });
    expect(byId('enc-top-1-b').midi).toMatchObject({ type: 'cc', number: 37, pushNote: 55 });
    expect(byId('enc-top-8-b').midi).toMatchObject({ number: 44, pushNote: 62 });
  });

  it('right encoders: CC18-25 push 8-15 becomes CC45-52 push 63-70', () => {
    expect(byId('enc-right-1-b').midi).toMatchObject({ number: 45, pushNote: 63 });
    expect(byId('enc-right-8-b').midi).toMatchObject({ number: 52, pushNote: 70 });
  });

  it('button grid: rows at 16/24/32 become 71/79/87', () => {
    expect(byId('btn-row1-1-b').midi.number).toBe(71);
    expect(byId('btn-row1-8-b').midi.number).toBe(78);
    expect(byId('btn-row2-1-b').midi.number).toBe(79);
    expect(byId('btn-row2-8-b').midi.number).toBe(86);
    expect(byId('btn-row3-1-b').midi.number).toBe(87);
    expect(byId('btn-row3-8-b').midi.number).toBe(94);
  });

  it('faders: CC1-9 touch 101-109 becomes CC28-36 touch 111-119', () => {
    expect(byId('fader-1').midi).toMatchObject({ number: 1, touchCc: 101 });
    expect(byId('fader-1-b').midi).toMatchObject({ number: 28, touchCc: 111 });
    expect(byId('fader-master').midi).toMatchObject({ number: 9, touchCc: 109 });
    expect(byId('fader-master-b').midi).toMatchObject({ number: 36, touchCc: 119 });
  });

  it('select row: 40-48 becomes 95-103', () => {
    expect(byId('select-1-b').midi.number).toBe(95);
    expect(byId('select-9-b').midi.number).toBe(103);
  });

  it('transport: 49-54 becomes 104-109', () => {
    expect(byId('transport-rew-b').midi.number).toBe(104);
    expect(byId('transport-play-b').midi.number).toBe(109);
  });

  it('uses the one set of offsets throughout — CC +27, note +55, touch +10', () => {
    expect([XTOUCH_LAYER_B_CC_OFFSET, XTOUCH_LAYER_B_NOTE_OFFSET, XTOUCH_LAYER_B_TOUCH_OFFSET])
      .toEqual([27, 55, 10]);
    for (const b of layerB) {
      const a = layerA.find((x) => `${x.id}-b` === b.id)!;
      const offset = b.midi.type === 'cc' ? XTOUCH_LAYER_B_CC_OFFSET : XTOUCH_LAYER_B_NOTE_OFFSET;
      expect(b.midi.number, b.id).toBe(a.midi.number + offset);
    }
  });
});

describe('no two controls share an address within a layer', () => {
  for (const [name, set] of [['A', layerA], ['B', layerB]] as const) {
    it(`Layer ${name} addresses are unique`, () => {
      const seen = new Map<string, string>();
      for (const c of set) {
        if (c.midi.number < 0) continue;
        for (const [kind, num] of [
          [c.midi.type, c.midi.number],
          ...(c.midi.pushNote !== undefined ? [['note', c.midi.pushNote] as const] : []),
          ...(c.midi.touchCc !== undefined ? [['cc', c.midi.touchCc] as const] : []),
        ] as ReadonlyArray<readonly [string, number]>) {
          const key = `${kind}:${c.midi.channel}:${num}`;
          expect(seen.has(key), `${c.id} collides with ${seen.get(key)} on ${key}`).toBe(false);
          seen.set(key, c.id);
        }
      }
    });
  }

  /**
   * The factory note says CC63 and CC64 on Layer B are the foot switch and
   * expression pedal jacks, which collides with reading notes 63/64 as the
   * push buttons of right encoders 9 and 10. Unresolved until the owner
   * presses a pedal and we watch what actually arrives — so nothing may be
   * assigned there by default, or it would silently steal two encoder pushes.
   */
  it('leaves the disputed pedal addresses documented rather than guessed', () => {
    const pushes = layerB.filter((c) => c.midi.pushNote === 63 || c.midi.pushNote === 64);
    expect(pushes.map((c) => c.id)).toEqual(['enc-right-1-b', 'enc-right-2-b']);
  });
});

/**
 * And the UI: adding a second layer to the descriptor puts two controls on
 * every physical position, so a renderer that draws them all stacks them.
 * The view draws one layer and the mapper offers the switch.
 */
describe('the mapping UI can reach both layers', () => {
  const VIEW = readFileSync(join(process.cwd(), 'src/components/midi/ControllerLayoutView.tsx'), 'utf-8');
  const MODAL = readFileSync(join(process.cwd(), 'src/components/midi/MIDIMapperModal.tsx'), 'utf-8');

  it('the view draws one layer at a time, defaulting to A', () => {
    expect(VIEW).toContain("layer?: 'A' | 'B';");
    expect(VIEW).toContain("layer = 'A',");
    expect(VIEW).toContain('layout.controls.filter(c => !c.layer || c.layer === layer)');
  });

  it('a control with no layer is always drawn, for single-layer devices', () => {
    expect(VIEW).toContain('!c.layer ||');
  });

  it('group backgrounds follow the visible layer, not every control', () => {
    expect(VIEW).toContain('renderGroupBackgrounds(visible)');
    expect(VIEW).not.toContain('renderGroupBackgrounds(layout)');
  });

  it('the mapper offers the switch, and only for a device that has one', () => {
    expect(MODAL).toContain("useState<'A' | 'B'>('A')");
    expect(MODAL).toContain("layout?.controls.some((c) => c.layer === 'B')");
    expect(MODAL).toContain('{hasLayerB && (');
    expect(MODAL).toContain('layer={activeLayer}');
  });
});
