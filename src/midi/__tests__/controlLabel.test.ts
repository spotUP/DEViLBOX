import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitLabelWords, wrapLabel, charsThatFit, describeControl } from '../controlLabel';

/**
 * The controller diagram printed raw targets under every control: encoders
 * with no truncation, buttons hard-cut at eight characters. The top encoder
 * row ran together into "delayPresetQuadratdelayPresetDotted..." and all
 * eight select buttons read `channel_` — identical, and silent about which
 * channel they are (2026-09-23, from a screenshot).
 */
describe('splitLabelWords', () => {
  it('breaks camelCase into words', () => {
    expect(splitLabelWords('delayPresetQuarter')).toEqual(['delay', 'Preset', 'Quarter']);
  });

  it('breaks the underscore targets that all looked alike', () => {
    expect(splitLabelWords('channel_mute_4')).toEqual(['channel', 'mute', '4']);
    expect(splitLabelWords('channel_mute_7')).toEqual(['channel', 'mute', '7']);
  });

  it('drops the namespace, which is noise on a dub diagram', () => {
    expect(splitLabelWords('dub.stereoDoubler')).toEqual(['stereo', 'Doubler']);
    expect(splitLabelWords('dj.crossfader')).toEqual(['crossfader']);
  });

  it('keeps digits attached to the word they belong to', () => {
    expect(splitLabelWords('delayPreset380')).toEqual(['delay', 'Preset380']);
  });
});

describe('wrapLabel', () => {
  it('keeps a short name on one line', () => {
    expect(wrapLabel('dub.ringMod', 18)).toEqual(['ring Mod']);
  });

  it('wraps a long name instead of running into its neighbour', () => {
    const lines = wrapLabel('dub.delayPresetQuarter', 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 12)).toBe(true);
  });

  it('keeps the channel number, which is the whole point of those eight buttons', () => {
    for (const n of [1, 4, 8]) {
      expect(wrapLabel(`channel_mute_${n}`, 10).join(' ')).toContain(String(n));
    }
  });

  it('never exceeds the line budget or the line count', () => {
    for (const t of ['dub.madProfPingPong', 'dub.transportTapeStop', 'channel_solo_8', 'x']) {
      const lines = wrapLabel(t, 9, 2);
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length, `${t}: "${l}"`).toBeLessThanOrEqual(9);
    }
  });

  it('says it truncated rather than reading as a different control', () => {
    const lines = wrapLabel('dub.transportTapeStop', 6, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('…')).toBe(true);
  });

  it('cuts a single word that cannot fit at all', () => {
    const lines = wrapLabel('supercalifragilistic', 8, 1);
    expect(lines[0]).toHaveLength(8);
    expect(lines[0].endsWith('…')).toBe(true);
  });

  it('is empty for an empty target', () => {
    expect(wrapLabel('', 10)).toEqual([]);
    expect(wrapLabel('x', 0)).toEqual([]);
  });
});

describe('charsThatFit', () => {
  it('grows with the space and shrinks with the font', () => {
    expect(charsThatFit(88, 8)).toBeGreaterThan(charsThatFit(44, 8));
    expect(charsThatFit(88, 12)).toBeLessThan(charsThatFit(88, 8));
  });

  it('never returns zero, so a label always gets one character', () => {
    expect(charsThatFit(1, 40)).toBe(1);
  });
});

describe('describeControl', () => {
  it('answers "which knob is this" — the question the diagram exists for', () => {
    expect(describeControl({ id: 'enc-top-1', target: 'dub.ringMod', type: 'cc', channel: 0, number: 10, pushNote: 0, layer: 'A' }))
      .toBe('dub.ringMod — CC10 on MIDI channel 1 · push note 0 · Layer A');
  });

  it('names the touch CC for a touch-sensitive fader', () => {
    expect(describeControl({ id: 'fader-1', target: 'dub.channelSend.ch0', type: 'cc', channel: 0, number: 1, touchCc: 101, layer: 'A' }))
      .toContain('touch CC101');
  });

  it('says plainly when nothing is assigned', () => {
    const d = describeControl({ id: 'btn-row3-2', type: 'note', channel: 0, number: 33, layer: 'B' });
    expect(d).toContain('unassigned');
    expect(d).toContain('note 33');
    expect(d).toContain('Layer B');
  });
});

/**
 * And the wiring: the diagram must use the shared label and say the address.
 */
describe('the controller diagram uses the wrapped label and the tooltip', () => {
  const VIEW = readFileSync(join(process.cwd(), 'src/components/midi/ControllerLayoutView.tsx'), 'utf-8');

  it('gives every control kind the shared label, not a raw substring cut', () => {
    expect((VIEW.match(/<ControlLabel /g) ?? []).length, 'encoder, button, fader, pad').toBe(4);
    expect(VIEW, 'the old eight-character cut is back').not.toContain(".substring(0, 8)");
  });

  it('wraps to the room between two controls', () => {
    expect(VIEW).toContain('wrapLabel(text, charsThatFit(CELL * 2, fontSize), 2)');
  });

  it('gives every control a tooltip with its address', () => {
    expect((VIEW.match(/<title>\{tooltip\}<\/title>/g) ?? []).length, 'one per control kind').toBe(4);
    expect(VIEW).toContain('tooltip: describeControl({');
    expect(VIEW).toContain('touchCc: control.midi.touchCc,');
    expect(VIEW).toContain('layer: control.layer,');
  });

  it('has room for the labels it now wraps', () => {
    const cell = VIEW.match(/^const CELL = (\d+);/m);
    expect(cell, 'CELL moved').not.toBeNull();
    expect(Number(cell![1]), 'cells were 32, too narrow for the names').toBeGreaterThanOrEqual(40);
  });
});

/**
 * "the dialog is too small there are scrollbars" (2026-09-23). The panel was
 * drawn at a fixed pixel size — 22 grid units at 44 px is 1000 px, wider than
 * the `xl` dialog's 896 px — so the diagram sat behind scrollbars instead of
 * fitting. It scales to the room it is given now, and the dialog is wider.
 */
describe('the controller diagram fits its dialog', () => {
  const VIEW = readFileSync(join(process.cwd(), 'src/components/midi/ControllerLayoutView.tsx'), 'utf-8');
  const MODAL = readFileSync(join(process.cwd(), 'src/components/midi/MIDIMapperModal.tsx'), 'utf-8');
  const SHELL = readFileSync(join(process.cwd(), 'src/components/ui/Modal.tsx'), 'utf-8');

  it('scales instead of forcing a pixel width', () => {
    const svg = VIEW.slice(VIEW.indexOf('    <svg'), VIEW.indexOf('{/* Background panel */}'));
    expect(svg, 'a fixed width is what overflowed').not.toMatch(/width=\{svgWidth\}/);
    expect(svg, 'a fixed height is what overflowed').not.toMatch(/height=\{svgHeight\}/);
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain('w-full h-auto');
  });

  it('is bounded vertically too, so a tall panel does not push the footer away', () => {
    expect(VIEW).toContain('max-h-[calc(90vh-15rem)]');
  });

  it('opens in a dialog wide enough for a diagram', () => {
    expect(MODAL).toContain('size="2xl"');
    expect(SHELL).toContain("'2xl': 'max-w-7xl w-full'");
    expect(SHELL).toContain("size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'fullscreen';");
  });
});
