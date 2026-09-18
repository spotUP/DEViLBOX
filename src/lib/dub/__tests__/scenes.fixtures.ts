/**
 * Gate N3 — musical regression scenes.
 *
 * Seven songs the performer has to cope with, described as event sources and
 * channel profiles rather than as audio. They exist so a change to the
 * performer can be judged against material it was not tuned on: a decision
 * layer that only behaves on a four-channel roots riddim has not been tested,
 * it has been demonstrated.
 *
 * Each scene names what makes it awkward.
 */

import { buildMusicalChannelProfile, type MusicalChannelProfile } from '../musicalChannelProfile';
import type { SimulationProject } from '../simulator';

type Overrides = Parameters<typeof buildMusicalChannelProfile>[1];
type Derived = Partial<Pick<MusicalChannelProfile, 'importance' | 'density' | 'audibility' | 'repetition'>>;

function profile(channel: number, overrides: Overrides, derived: Derived = {}): MusicalChannelProfile {
  return {
    ...buildMusicalChannelProfile({ channel }, overrides),
    importance: derived.importance ?? 0.5,
    density: derived.density ?? 0.4,
    audibility: derived.audibility ?? 0.8,
    repetition: derived.repetition ?? 0.7,
  };
}

/** Onsets at the given offsets of every bar. */
function everyBar(offsets: number[], rowsPerBar: number, barCount: number, strength?: number) {
  const out: { row: number; strength?: number }[] = [];
  for (let bar = 0; bar < barCount; bar++) {
    for (const o of offsets) out.push({ row: bar * rowsPerBar + o, strength });
  }
  return out;
}

export interface Scene {
  name: string;
  /** What makes this one awkward for the performer. */
  challenge: string;
  project: SimulationProject;
}

export const SCENES: readonly Scene[] = [
  {
    name: 'A — sparse roots riddim',
    challenge: 'Very little happens. The performer must not fill every gap it finds.',
    project: {
      bpm: 72, ticksPerRow: 6,
      sources: [
        { channel: 0, onsets: everyBar([0], 16, 64) },
        { channel: 1, onsets: everyBar([8], 16, 64) },
        { channel: 2, onsets: everyBar([0, 12], 16, 64) },
      ],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }, { importance: 0.8, density: 0.1 })],
        [1, profile(1, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }, { importance: 0.6, density: 0.1 })],
        [2, profile(2, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }, { importance: 0.95, density: 0.15 })],
      ]),
    },
  },
  {
    name: 'B — dense digital dancehall',
    challenge: 'Onsets everywhere. Anything that reacts per event will spam.',
    project: {
      bpm: 160, ticksPerRow: 3,
      sources: [
        { channel: 0, onsets: everyBar([0, 4, 8, 12, 16, 20, 24, 28], 32, 64) },
        { channel: 1, onsets: everyBar([8, 24], 32, 64) },
        { channel: 2, onsets: everyBar([0, 6, 12, 18, 24, 30], 32, 64) },
        { channel: 3, onsets: everyBar([2, 10, 18, 26], 32, 64) },
        { channel: 4, onsets: everyBar([14], 32, 64) },
      ],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }, { importance: 0.85, density: 0.9 })],
        [1, profile(1, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }, { importance: 0.7, density: 0.4 })],
        [2, profile(2, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }, { importance: 0.9, density: 0.8 })],
        [3, profile(3, { instrumentFamily: 'synth', musicalFunction: 'harmony' }, { importance: 0.5, density: 0.6 })],
        [4, profile(4, { instrumentFamily: 'fx', musicalFunction: 'texture' }, { importance: 0.2, density: 0.2 })],
      ]),
    },
  },
  {
    name: 'C — vocal and horn',
    challenge: 'Two voices that phrase and then leave gaps. Call and response, or talking over them.',
    project: {
      bpm: 92, ticksPerRow: 6,
      sources: [
        { channel: 0, onsets: everyBar([0, 8], 16, 64) },
        { channel: 1, onsets: everyBar([4, 12], 16, 64) },
        { channel: 2, onsets: everyBar([0, 6], 16, 64) },
        // A four-note phrase then three bars of silence, repeating.
        { channel: 3, onsets: Array.from({ length: 16 }, (_, i) => [0, 2, 4, 7].map(o => ({ row: i * 64 + o }))).flat() },
        { channel: 4, onsets: Array.from({ length: 16 }, (_, i) => [32, 35, 38].map(o => ({ row: i * 64 + o }))).flat() },
      ],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }, { importance: 0.75 })],
        [1, profile(1, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }, { importance: 0.6 })],
        [2, profile(2, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }, { importance: 0.9 })],
        [3, profile(3, { instrumentFamily: 'vocal', musicalFunction: 'voice' }, { importance: 0.8, audibility: 0.9 })],
        [4, profile(4, { instrumentFamily: 'horn', musicalFunction: 'melody' }, { importance: 0.6, audibility: 0.8 })],
      ]),
    },
  },
  {
    name: 'D — four-channel tracker module',
    challenge: 'The ordinary case, and the one with fewest channels to spare.',
    project: {
      bpm: 125, ticksPerRow: 6,
      sources: [
        { channel: 0, onsets: everyBar([0, 8], 16, 64) },
        { channel: 1, onsets: everyBar([4, 12], 16, 64) },
        { channel: 2, onsets: everyBar([2, 10], 16, 64) },
        { channel: 3, onsets: everyBar([6, 14], 16, 64) },
      ],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }, { importance: 0.8 })],
        [1, profile(1, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }, { importance: 0.6 })],
        [2, profile(2, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }, { importance: 0.9 })],
        [3, profile(3, { instrumentFamily: 'guitar', musicalFunction: 'harmony', rhythmicRole: 'offbeat' }, { importance: 0.4 })],
      ]),
    },
  },
  {
    name: 'E — long-form dub',
    challenge: 'Nothing changes for a long time. A performer with no memory repeats itself.',
    project: {
      bpm: 68, ticksPerRow: 6,
      sources: [
        { channel: 0, onsets: everyBar([0, 8], 16, 128) },
        { channel: 1, onsets: everyBar([12], 16, 128) },
        { channel: 2, onsets: everyBar([0, 3, 8, 11], 16, 128) },
      ],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }, { importance: 0.8, repetition: 0.95 })],
        [1, profile(1, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }, { importance: 0.5, repetition: 0.95 })],
        [2, profile(2, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }, { importance: 0.95, repetition: 0.95 })],
      ]),
    },
  },
  {
    name: 'F — unusual metre (7/8)',
    challenge: 'Bars are not four beats and phrases do not divide by four.',
    project: {
      bpm: 110, ticksPerRow: 6,
      clockSettings: { meter: { beatsPerBar: 7, beatUnit: 8 }, phraseBars: 8 },
      sources: [
        { channel: 0, onsets: everyBar([0, 6], 14, 64) },
        { channel: 1, onsets: everyBar([4, 10], 14, 64) },
        { channel: 2, onsets: everyBar([0, 8], 14, 64) },
      ],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove', rhythmicRole: 'downbeat' }, { importance: 0.8 })],
        [1, profile(1, { instrumentFamily: 'drums', rhythmicRole: 'backbeat' }, { importance: 0.6 })],
        [2, profile(2, { instrumentFamily: 'bass', musicalFunction: 'foundation', register: 'sub' }, { importance: 0.9 })],
      ]),
    },
  },
  {
    name: 'G — sparse arrangement, one channel',
    challenge: 'There is nothing to drop and nothing to answer.',
    project: {
      bpm: 100, ticksPerRow: 6,
      sources: [{ channel: 0, onsets: everyBar([0, 8], 16, 64) }],
      channelProfiles: new Map([
        [0, profile(0, { instrumentFamily: 'drums', musicalFunction: 'groove' }, { importance: 0.9 })],
      ]),
    },
  },
];
