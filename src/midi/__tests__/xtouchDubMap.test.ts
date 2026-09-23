import { describe, it, expect } from 'vitest';
import { DJ_CONTROLLER_PRESETS } from '../djControllerPresets';
import { getControllerLayout } from '../controllerLayouts';

/**
 * The X-Touch Compact's factory map, laid out the way the deck is played.
 *
 * What it replaced put trigger moves on encoder PUSHES and continuous knobs
 * on a duplicate master volume, scattered the eight toggles across three
 * different groups, and filled two whole button rows with mixer mute and solo
 * — so the moves a dub performance actually reaches for were nowhere near
 * each other. Layer B was unmapped entirely.
 *
 * The rule: a row of hardware carries a row of the deck. Toggles together,
 * because they latch and the LED then tells the truth; holds together;
 * one-shots together; each select button under the fader it acts on.
 */
const preset = DJ_CONTROLLER_PRESETS.find((p) => p.id === 'behringer-xtouch-compact')!;
const noteOf = (n: number) => preset.noteMappings?.find((m) => m.note === n && m.channel === 0);
const ccOf = (c: number) => preset.ccMappings?.find((m) => m.cc === c && m.channel === 0);
const paramOf = (n: number) => {
  const m = noteOf(n);
  return m && 'param' in m ? m.param : undefined;
};

describe('the toggles sit together on button row 1', () => {
  const expected = [
    'dub.stereoDoubler', 'dub.tapeWobble', 'dub.subHarmonic', 'dub.combSweep',
    'dub.eqSweep', 'dub.ringMod', 'dub.voltageStarve', 'dub.madProfPingPong',
  ];

  it('all eight, in deck order, on notes 16-23', () => {
    expect(Array.from({ length: 8 }, (_, i) => paramOf(16 + i))).toEqual(expected);
  });

  it('and nowhere else, so one press is one place', () => {
    for (const target of expected) {
      const hits = (preset.noteMappings ?? []).filter((m) => 'param' in m && m.param === target);
      expect(hits, `${target} is mapped ${hits.length} times`).toHaveLength(1);
    }
  });
});

describe('holds and one-shots have a row each', () => {
  it('row 2 is press-and-hold', () => {
    expect(Array.from({ length: 8 }, (_, i) => paramOf(24 + i))).toEqual([
      'dub.filterDrop', 'dub.masterDrop', 'dub.versionDrop', 'dub.riddimSection',
      'dub.dubSiren', 'dub.tubbyScream', 'dub.ghostReverb', 'dub.tapeStop',
    ]);
  });

  it('row 3 is one-shots', () => {
    expect(Array.from({ length: 8 }, (_, i) => paramOf(32 + i))).toEqual([
      'dub.echoThrow', 'dub.dubStab', 'dub.springSlam', 'dub.springKick',
      'dub.snareCrack', 'dub.sonarPing', 'dub.radioRiser', 'dub.subSwell',
    ]);
  });

  it('no button row carries mixer mute or solo any more — those moved to Layer B', () => {
    for (let n = 16; n <= 39; n++) {
      const m = noteOf(n);
      expect(m && 'action' in m, `note ${n} is an action`).toBeFalsy();
    }
  });
});

describe('each select button acts on the fader above it', () => {
  it('notes 40-47 mute the dub send of channels 1-8, in order', () => {
    for (let i = 0; i < 8; i++) expect(paramOf(40 + i)).toBe(`dub.channelMute.ch${i}`);
  });

  it('the button under MAIN arms recording', () => {
    expect(paramOf(48)).toBe('dub.armed');
  });

  it('the fader above it sends the same channel', () => {
    for (let i = 0; i < 8; i++) {
      expect(ccOf(1 + i)?.param).toBe(`dub.channelSend.ch${i}`);
      expect(paramOf(40 + i)).toBe(`dub.channelMute.ch${i}`);
    }
  });
});

describe('encoders carry continuous parameters, pushes carry momentary ones', () => {
  it('the top row is the bus tone and FX controls', () => {
    expect(Array.from({ length: 8 }, (_, i) => ccOf(10 + i)?.param)).toEqual([
      'dub.returnGain', 'dub.echoIntensity', 'dub.echoRateMs', 'dub.springWet',
      'dub.bassShelfGainDb', 'dub.midScoopGainDb', 'dub.stereoWidth', 'dub.hpfCutoff',
    ]);
  });

  it('no continuous control is wasted on a duplicate', () => {
    const params = (preset.ccMappings ?? []).map((m) => m.param);
    expect(new Set(params).size, 'a CC target is assigned twice').toBe(params.length);
  });

  it('the pushes are echo presets and one-shots, never a move you hold', () => {
    const held = ['dub.filterDrop', 'dub.masterDrop', 'dub.dubSiren', 'dub.tapeStop', 'dub.ghostReverb'];
    for (let n = 0; n <= 15; n++) {
      expect(held, `note ${n} is a hold on a momentary push`).not.toContain(paramOf(n));
    }
  });
});

describe('Layer B carries what Layer A had no room for', () => {
  it('the moves that did not fit', () => {
    expect([71, 72, 73, 74].map(paramOf)).toEqual([
      'dub.transportTapeStop', 'dub.skankEchoThrow', 'dub.skankFloatThrow', 'dub.channelThrow',
    ]);
  });

  it('mixer solo and mute, a row each', () => {
    for (let i = 0; i < 8; i++) {
      expect(noteOf(79 + i)).toMatchObject({ action: `channel_solo_${i + 1}` });
      expect(noteOf(87 + i)).toMatchObject({ action: `channel_mute_${i + 1}` });
    }
  });

  it('the second fader bank reaches channels 9-16, not the first eight again', () => {
    for (let i = 0; i < 8; i++) expect(ccOf(28 + i)?.param).toBe(`dub.channelSend.ch${8 + i}`);
  });

  it('leaves the disputed pedal addresses alone', () => {
    expect(noteOf(63)).toBeUndefined();
    expect(noteOf(64)).toBeUndefined();
  });
});

describe('every mapping lands on a control this device actually has', () => {
  const layout = getControllerLayout('behringer-xtouch-compact')!;
  const notes = new Set<number>();
  const ccs = new Set<number>();
  for (const c of layout.controls) {
    if (c.midi.number < 0) continue;
    if (c.midi.type === 'cc') ccs.add(c.midi.number);
    if (c.midi.type === 'note') notes.add(c.midi.number);
    if (c.midi.pushNote !== undefined) notes.add(c.midi.pushNote);
  }

  it('no note mapping addresses a button that does not exist', () => {
    for (const m of preset.noteMappings ?? []) {
      expect(notes.has(m.note), `note ${m.note} is on no control`).toBe(true);
    }
  });

  it('no CC mapping addresses a knob that does not exist', () => {
    for (const m of preset.ccMappings ?? []) {
      expect(ccs.has(m.cc), `CC${m.cc} is on no control`).toBe(true);
    }
  });

  it('no two mappings fight over the same address', () => {
    const seenNotes = new Set<number>();
    for (const m of preset.noteMappings ?? []) {
      expect(seenNotes.has(m.note), `note ${m.note} mapped twice`).toBe(false);
      seenNotes.add(m.note);
    }
    const seenCcs = new Set<number>();
    for (const m of preset.ccMappings ?? []) {
      expect(seenCcs.has(m.cc), `CC${m.cc} mapped twice`).toBe(false);
      seenCcs.add(m.cc);
    }
  });
});
