import { describe, it, expect } from 'vitest';
import { CONTROLLER_LAYOUTS, getControllerLayout } from '@/midi/controllerLayouts';
import { getPresetById } from '@/midi/djControllerPresets';
import {
  buildDeckBindings,
  buildDeckMoveIndex,
  classifyDeckTarget,
  deckControlLabel,
  isDeckInert,
  listDeckShapeOptions,
  resolveDeckShape,
  type ChannelOpRow,
  type DeckMove,
  type GlobalMoveRow,
} from '../deckShape';

/**
 * "the dub deck in devilbox should match my hw controller layoutwize"
 * (2026-09-23).
 *
 * The deck can be drawn as the controller's own physical panel, and then
 * every button, pad and fader has to PLAY the dub function the factory preset
 * put at that address. If this resolution is wrong, a performer presses the
 * button under their finger and something else happens — the worst possible
 * failure for a live surface, and one no amount of looking at the screen
 * would catch, because the screen would be wrong in the same way.
 *
 * So it is decided here, in a pure module, against the REAL X-Touch Compact
 * descriptor and the REAL factory preset. `DubDeckStrip` itself cannot be
 * mounted in a test — it pulls the live WebAudio stack in — which is exactly
 * why none of this decision is allowed to live inside it.
 */

// A stand-in for the deck's own tables. Small on purpose: what is under test
// is the mapping from a table row to an interaction, not the table.
const GLOBALS: GlobalMoveRow[] = [
  { label: 'Slam', title: 'Spring Slam', moveId: 'springSlam', color: 'accent-primary', kind: 'trigger', group: 'click' },
  { label: 'Drop', title: 'Master Drop', moveId: 'masterDrop', color: 'accent-primary', kind: 'hold', group: 'hold' },
  { label: 'Wide', title: 'Stereo Doubler', moveId: 'stereoDoubler', color: 'accent-primary', kind: 'hold', group: 'toggle' },
  { label: 'Ring', title: 'Ring Mod', moveId: 'ringMod', color: 'accent-primary', kind: 'hold', group: 'toggle' },
  { label: '1/4', title: 'Quarter note', moveId: 'delayPresetQuarter', color: 'accent-primary', kind: 'hold', group: 'rate' },
];
const OPS: ChannelOpRow[] = [
  { label: 'Mute', title: 'Channel mute', moveId: 'channelMute', color: 'accent-primary', kind: 'hold' },
  { label: 'Echo', title: 'Echo Throw', moveId: 'echoThrow', color: 'accent-primary', kind: 'trigger' },
];
const MOVES = buildDeckMoveIndex(GLOBALS, OPS);

const xtouch = () => getControllerLayout('behringer-xtouch-compact')!;
const xtouchBindings = (layer: 'A' | 'B' = 'A') => buildDeckBindings({
  layout: xtouch(),
  layer,
  preset: getPresetById('behringer-xtouch-compact'),
  overrides: {},
  moves: MOVES,
});

// ============================================================================

describe('the move index keeps the deck as the single source of truth', () => {
  it('takes the interaction from the ROW a global sits in, not from its kind', () => {
    // The rate presets are `kind: 'hold'` and are played as a radio group;
    // STOP! is `kind: 'hold'` and is played as a press-and-hold. The group is
    // the promise the deck makes about the button, so the group is what
    // carries over into the controller shape.
    expect(MOVES.get('delayPresetQuarter')?.interaction).toBe('rate');
    expect(MOVES.get('masterDrop')?.interaction).toBe('hold');
    expect(MOVES.get('stereoDoubler')?.interaction).toBe('toggle');
    expect(MOVES.get('springSlam')?.interaction).toBe('trigger');
  });

  it('takes a per-channel op straight from its kind', () => {
    expect(MOVES.get('channelMute')?.interaction).toBe('hold');
    expect(MOVES.get('echoThrow')?.interaction).toBe('trigger');
  });

  it('carries the deck\'s own label and description, so both shapes read alike', () => {
    expect(MOVES.get('stereoDoubler')).toMatchObject({ label: 'Wide', title: 'Stereo Doubler' });
  });
});

describe('a target path resolves the way the MIDI router reads it', () => {
  it('reads a channel send', () => {
    expect(classifyDeckTarget('dub.channelSend.ch5', MOVES))
      .toEqual({ kind: 'channelSend', target: 'dub.channelSend.ch5', channelId: 5 });
  });

  it('reads the recording arm', () => {
    expect(classifyDeckTarget('dub.armed', MOVES).kind).toBe('armed');
  });

  it('reads a global move and a per-channel move with the same grammar', () => {
    const global = classifyDeckTarget('dub.ringMod', MOVES);
    expect(global).toMatchObject({ kind: 'move' });
    expect(global.kind === 'move' && global.channelId).toBeUndefined();
    const scoped = classifyDeckTarget('dub.channelMute.ch3', MOVES);
    expect(scoped).toMatchObject({ kind: 'move', channelId: 3 });
  });

  it('calls a continuous bus parameter what it is rather than guessing a move', () => {
    expect(classifyDeckTarget('dub.returnGain', MOVES).kind).toBe('busParam');
    expect(classifyDeckTarget('dub.hpfCutoff', MOVES).kind).toBe('busParam');
  });

  it('marks a DJ parameter or a transport action as not the deck\'s to fire', () => {
    expect(classifyDeckTarget('dj.masterVolume', MOVES).kind).toBe('foreign');
    expect(classifyDeckTarget('play_a', MOVES).kind).toBe('foreign');
  });
});

describe('the X-Touch Compact panel plays the deck', () => {
  const bindings = xtouchBindings('A');

  it('puts the eight toggles on button row 1, in deck order', () => {
    expect(bindings['btn-row1-1'].press).toMatchObject({
      kind: 'move', target: 'dub.stereoDoubler',
    });
    expect(bindings['btn-row1-1'].press).toMatchObject({ move: { interaction: 'toggle' } });
    expect(bindings['btn-row1-6'].press).toMatchObject({ target: 'dub.ringMod' });
  });

  it('rides the channel dub sends on the eight faders', () => {
    for (let i = 0; i < 8; i++) {
      expect(bindings[`fader-${i + 1}`].turn, `fader ${i + 1}`)
        .toEqual({ kind: 'channelSend', target: `dub.channelSend.ch${i}`, channelId: i });
    }
  });

  it('puts each channel\'s dub mute on the select button under its own fader', () => {
    for (let i = 0; i < 8; i++) {
      expect(bindings[`select-${i + 1}`].press, `select ${i + 1}`)
        .toMatchObject({ kind: 'move', channelId: i, move: { moveId: 'channelMute' } });
    }
  });

  it('arms recording from the button under MAIN, where the hand already is', () => {
    expect(bindings['select-9'].press).toEqual({ kind: 'armed', target: 'dub.armed' });
  });

  it('gives an encoder BOTH halves — the mapper diagram only ever shows one', () => {
    // The top row turns the bus tone and pushes the echo-rate presets. Keeping
    // a single assignment per control, as the mapper store does, would drop
    // eight rate presets or eight tone parameters off the surface entirely.
    expect(bindings['enc-top-1'].turn).toMatchObject({ kind: 'busParam', target: 'dub.returnGain' });
    expect(bindings['enc-top-1'].press).toMatchObject({
      kind: 'move', target: 'dub.delayPresetQuarter', move: { interaction: 'rate' },
    });
  });

  it('addresses the second bank of channels on Layer B', () => {
    const layerB = xtouchBindings('B');
    expect(layerB['fader-1-b'].turn).toMatchObject({ kind: 'channelSend', channelId: 8 });
    expect(layerB['fader-8-b'].turn).toMatchObject({ kind: 'channelSend', channelId: 15 });
    // And Layer A's controls are not also present, or every position would
    // carry two controls stacked on each other.
    expect(layerB['fader-1']).toBeUndefined();
  });

  it('keeps the layer indicators on BOTH layers, so there is a way back', () => {
    expect(xtouchBindings('A')['layer-b']).toBeDefined();
    expect(xtouchBindings('B')['layer-a']).toBeDefined();
  });

  it('says out loud which controls the dub deck cannot drive', () => {
    // The transport row is DJ actions and MAIN is the DJ master volume. They
    // are real assignments — the hardware fires them — but not the dub deck's
    // to fire, and a button that looks live and does nothing is worse than
    // one that looks quiet.
    expect(isDeckInert(bindings['transport-play'])).toBe(true);
    expect(isDeckInert(bindings['fader-master'])).toBe(true);
    expect(isDeckInert(bindings['btn-row1-1'])).toBe(false);
    expect(isDeckInert(bindings['fader-1'])).toBe(false);
  });

  it('names a control after the move, and says which channel when it has one', () => {
    expect(deckControlLabel(bindings['btn-row1-1'])).toBe('Wide');
    expect(deckControlLabel(bindings['select-1'])).toBe('Mute 1');
    expect(deckControlLabel(bindings['select-8'])).toBe('Mute 8');
    expect(deckControlLabel(bindings['fader-3'])).toBe('Send 3');
    expect(deckControlLabel(bindings['select-9'])).toBe('Record Arm');
  });
});

describe('user overrides land on the half of the control that can send them', () => {
  const layout = xtouch();
  const preset = getPresetById('behringer-xtouch-compact');

  it('replaces a button\'s press', () => {
    const bindings = buildDeckBindings({
      layout, layer: 'A', preset, moves: MOVES,
      overrides: { 'btn-row1-1': { kind: 'dub', target: 'dub.ringMod' } },
    });
    expect(bindings['btn-row1-1'].press).toMatchObject({ target: 'dub.ringMod' });
  });

  it('replaces a fader\'s turn, not its press', () => {
    const bindings = buildDeckBindings({
      layout, layer: 'A', preset, moves: MOVES,
      overrides: { 'fader-1': { kind: 'dub', target: 'dub.channelSend.ch7' } },
    });
    expect(bindings['fader-1'].turn).toMatchObject({ channelId: 7 });
    expect(bindings['fader-1'].press).toBeUndefined();
  });

  it('sends an ACTION to the press even on an encoder — a knob cannot turn one', () => {
    const bindings = buildDeckBindings({
      layout, layer: 'A', preset, moves: MOVES,
      overrides: { 'enc-top-1': { kind: 'action', target: 'play_a' } },
    });
    expect(bindings['enc-top-1'].press).toEqual({ kind: 'foreign', target: 'play_a' });
    expect(bindings['enc-top-1'].turn).toMatchObject({ target: 'dub.returnGain' });
  });
});

describe('a controller with no factory preset still draws, and drives nothing', () => {
  it('binds every visible control to nothing rather than throwing', () => {
    const layout = getControllerLayout('ni-maschine-mk2')!;
    const bindings = buildDeckBindings({ layout, layer: 'A', preset: null, overrides: {}, moves: MOVES });
    expect(Object.keys(bindings).length).toBe(layout.controls.length);
    expect(Object.values(bindings).every(isDeckInert)).toBe(true);
  });
});

// ============================================================================

describe('which shape the deck draws in', () => {
  it('follows the connected controller when the choice is automatic', () => {
    const shape = resolveDeckShape('automatic', 'behringer-xtouch-compact', CONTROLLER_LAYOUTS);
    expect(shape).toMatchObject({ kind: 'controller' });
  });

  it('falls back to the generic deck with nothing connected — the default case', () => {
    expect(resolveDeckShape('automatic', null, CONTROLLER_LAYOUTS)).toEqual({ kind: 'generic' });
  });

  it('falls back when the connected controller has no physical descriptor', () => {
    // There are nine DJ presets and three layouts, so this is the common case,
    // and it must degrade to the deck that always works rather than to an
    // empty panel.
    expect(resolveDeckShape('automatic', 'pioneer-ddj-sb3', CONTROLLER_LAYOUTS))
      .toEqual({ kind: 'generic' });
  });

  it('obeys an explicit choice over the connected hardware, both ways round', () => {
    expect(resolveDeckShape('generic', 'behringer-xtouch-compact', CONTROLLER_LAYOUTS))
      .toEqual({ kind: 'generic' });
    expect(resolveDeckShape('behringer-xtouch-compact', null, CONTROLLER_LAYOUTS))
      .toMatchObject({ kind: 'controller' });
  });

  it('cannot be stranded by a persisted id we no longer ship', () => {
    expect(resolveDeckShape('behringer-xtouch-2099', null, CONTROLLER_LAYOUTS))
      .toEqual({ kind: 'generic' });
  });

  it('offers automatic first, then the generic deck, then every descriptor', () => {
    const options = listDeckShapeOptions(CONTROLLER_LAYOUTS);
    expect(options[0].id).toBe('automatic');
    expect(options[1].id).toBe('generic');
    expect(options.map(o => o.id)).toEqual(
      expect.arrayContaining([...CONTROLLER_LAYOUTS.keys()]),
    );
    expect(options.every(o => o.label.length > 0)).toBe(true);
  });
});

describe('the deck move type stays exhaustive', () => {
  it('has a label for every interaction a move can have', () => {
    // A fifth interaction added to the deck without a case here would draw a
    // blank control, so pin the four that exist.
    const interactions = new Set<DeckMove['interaction']>(['trigger', 'hold', 'toggle', 'rate']);
    for (const move of MOVES.values()) expect(interactions.has(move.interaction)).toBe(true);
  });
});
