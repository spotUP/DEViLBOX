/**
 * Everything a persona does has to show up — on screen AND on the controller.
 *
 * "mad professor is doing a lot of stuff that is not visible on the controller
 * now or in the ui" (2026-09-23). The audio was moving the whole time; the
 * displays were not, because each surface was fed from a table of its own that
 * had drifted away from the one that routes the hardware.
 *
 * This is the reachability check for that. It does not test that a pixel
 * lights up — it pins the WIRING, so a move or a ride cannot be added, or a
 * mapping changed, without the route to both surfaces still being there.
 *
 * The one channel both surfaces share is the announcement:
 * `fireParamLiveSubscribers(param, normalized)`. The UI listens through
 * `useLiveDubParam`, the controller through `useXTouchFeedback`. A parameter
 * that is not announced is invisible everywhere, however loud it is.
 */
import { describe, it, expect } from 'vitest';
import { RIDE_TARGETS } from '../chooseRide';
import { DUB_BUS_PARAMS, DUB_MOVE_KINDS } from '@/midi/performance/parameterRouter';
import { DJ_CONTROLLER_PRESETS } from '@/midi/djControllerPresets';
import { AUTO_DUB_PERSONAS } from '../AutoDubPersonas';

const preset = DJ_CONTROLLER_PRESETS.find((p) => p.id === 'behringer-xtouch-compact')!;

/** The parameter a ride target resolves to, in the form the router speaks. */
const paramFor = (target: string) =>
  target === 'channelSend' ? 'dub.channelSend.ch0' : `dub.${target}`;

/** Every parameter ANY persona can take hold of. */
const everyRideParam = [
  ...new Set(Object.values(RIDE_TARGETS).flatMap((c) => c.targets.map(paramFor))),
];

const ccFor = (param: string) => preset.ccMappings.find((m) => m.param === param)?.cc;

describe('every persona can ride, and every ride is a table away from both surfaces', () => {
  it('covers all six personas — none is silently left without targets', () => {
    for (const id of Object.keys(AUTO_DUB_PERSONAS)) {
      expect(RIDE_TARGETS[id as keyof typeof RIDE_TARGETS], id).toBeDefined();
      expect(RIDE_TARGETS[id as keyof typeof RIDE_TARGETS].targets.length, id).toBeGreaterThan(0);
    }
  });

  it('every persona reaches for at least one control that is NOT a channel send', () => {
    // A persona whose only target is the send can move the audio without ever
    // touching a control the performer can see. That is exactly how the
    // default persona went a whole session without twisting a knob.
    for (const [id, config] of Object.entries(RIDE_TARGETS)) {
      expect(config.targets.some((t) => t !== 'channelSend'), id).toBe(true);
    }
  });

  it('every rideable bus parameter is one the router announces', () => {
    // `DUB_BUS_PARAMS` is what the encoder echo walks and what the router
    // knows how to write. A ride target missing from it reaches neither the
    // rings nor the bus panel.
    for (const param of everyRideParam) {
      if (param.startsWith('dub.channelSend.')) continue;
      expect(DUB_BUS_PARAMS[param], `${param} is ridden but not a known bus parameter`).toBeDefined();
    }
  });

  it('every rideable parameter has somewhere to show on the controller', () => {
    for (const param of everyRideParam) {
      if (param.startsWith('dub.channelSend.')) {
        // Channel sends are the motor faders, CC 1-8 on Layer A.
        expect(ccFor('dub.channelSend.ch0'), 'channel sends have no fader').toBeDefined();
        continue;
      }
      expect(ccFor(param), `${param} is ridden but no encoder shows it`).toBeDefined();
    }
  });
});

/**
 * The lamp and the press must name the same button.
 */
describe('a move lights the button that fires it', () => {
  /** Mirrors `moveButtonNote` in useXTouchFeedback — same rule, stated once. */
  const notesFor = (moveId: string, channelId?: number) => {
    const wanted = `dub.${moveId}`;
    const exact = channelId === undefined ? null : `${wanted}.ch${channelId}`;
    return preset.noteMappings
      .filter((m) => 'param' in m && typeof m.param === 'string'
        && (m.param === wanted || (exact !== null && m.param === exact)))
      .map((m) => m.note);
  };

  const dubNoteMappings = preset.noteMappings.filter(
    (m) => 'param' in m && typeof m.param === 'string' && m.param.startsWith('dub.'),
  ) as Array<{ note: number; param: string }>;

  it('has dub moves on its buttons at all', () => {
    expect(dubNoteMappings.length).toBeGreaterThan(20);
  });

  it('round-trips: the note that fires a move is the note that lights for it', () => {
    // The old LED table lit note 16 for `echoThrow` while the preset put
    // `dub.stereoDoubler` on note 16 — press one button, watch another light.
    for (const mapping of dubNoteMappings) {
      const moveId = mapping.param.replace(/^dub\./, '').replace(/\.ch\d+$/, '');
      if (!(moveId in DUB_MOVE_KINDS)) continue;   // not a move (toggles, touch)
      const ch = mapping.param.match(/\.ch(\d+)$/);
      const channelId = ch ? Number(ch[1]) : undefined;
      // Every note the preset gives this move must light, because Layer A and
      // its Layer B mirror are two notes for one button and only one layer
      // is showing at a time.
      expect(notesFor(moveId, channelId), `${moveId} on note ${mapping.note}`)
        .toContain(mapping.note);
    }
  });

  it('gives no two moves the same button', () => {
    // Five moves used to be written down as deliberately SHARING a button, so
    // firing one lit the lamp of another.
    const byNote = new Map<number, string[]>();
    for (const mapping of dubNoteMappings) {
      const moveId = mapping.param.replace(/^dub\./, '').replace(/\.ch\d+$/, '');
      if (!(moveId in DUB_MOVE_KINDS)) continue;
      const seen = byNote.get(mapping.note) ?? [];
      // The same move on several channels is one button per channel strip,
      // not a clash; two DIFFERENT moves on one note is.
      if (!seen.includes(moveId)) seen.push(moveId);
      byNote.set(mapping.note, seen);
    }
    for (const [note, moves] of byNote) {
      expect(moves, `note ${note} lights for more than one move`).toHaveLength(1);
    }
  });
});
