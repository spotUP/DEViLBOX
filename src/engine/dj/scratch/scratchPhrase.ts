/**
 * A user's spoken-phrase WAV dropped on Deck C (R5, owner decision 2026-10-13): the demo's `--wav` path
 * (three_deck.render_from_params `deck_c_wav` -> scratch_dj.cues_from_wav -> scratch_routine.load_wav_cues). The WAV
 * is auto-cued the demo's way (`loadWavCues`: S950, onsets, each word anchored on its vowel) and each cue becomes a
 * scratch record of its own; Deck C's cue roles are the demo's mapping HOME = ROCK, SECONDARY = FUNKY,
 * ACCENT = BEAT, FX = BEAT (a word the take lacks falls back to ROCK). The three-deck routine then scratches them.
 */

import { loadWavCues, type WavCue } from './scratchBankAnalysis';
import type { CueRole, ScratchRecord } from './scratchCatalogue';
import type { ScratchGestureId } from './scratchTypes';

/** `cues_from_wav`'s default mapping. */
export const PHRASE_ROLE_WORDS: Readonly<Record<CueRole, string>> = { HOME: 'ROCK', SECONDARY: 'FUNKY', ACCENT: 'BEAT', FX: 'BEAT' };

/** The phrase Deck C scratches: its name and the record id per cue role. */
export interface ScratchPhrase { name: string; roles: Readonly<Record<CueRole, string>> }

/** Reachability sentinel. */
export const scratchPhraseStats = { loads: 0 };

const RATE = 22050;
const GESTURES: readonly ScratchGestureId[] = ['baby', 'forwardStab', 'backwardStab', 'chirp', 'transformer4', 'transformer8', 'tearForward', 'flare1', 'flare2', 'scribble', 'orbit', 'crab', 'chirpDouble', 'cut', 'hydroplane', 'drop'];

export const phraseRecordId = (name: string, word: string): string => `PHRASE:${name}:${word}`;

/** A cue of the phrase as a scratch record: the cue's own audio, its vowel anchor and safe range. */
function cueRecord(name: string, word: string, cue: WavCue): ScratchRecord {
  const sec = (i: number) => i / RATE;
  const id = phraseRecordId(name, word);
  const vowel = sec(cue.anchor);
  const safe = [sec(cue.safe[0]), sec(cue.safe[1])] as const;
  const safeForward = [sec(cue.safeForward[0]), sec(cue.safeForward[1])] as const;
  const safeReverse = [sec(cue.safeReverse[0]), sec(cue.safeReverse[1])] as const;
  return {
    id, canonicalName: id, literalPhrase: `${name} (${word})`, file: '', sourceFile: '', url: '',
    demoCue: { anchor: cue.anchor, safe: cue.safe },
    category: 'SHORT_EXCLAMATION', referenceRoles: [], roles: ['THEME', 'FEATURE', 'ACCENT', 'FILL', 'ANSWER'], styles: [],
    recommendedGestures: [...cue.preferred], gestures: GESTURES,
    anchors: { attack: sec(cue.sub.attack), vowel, tail: sec(cue.sub.ending) },
    safe, safeForward, safeReverse, wordSlices: [], clean: true, preScratched: false, durationSec: cue.sig.length / RATE,
    voicedAmount: 1, noiseAmount: 0, onsetRate: 0, transientCount: 1, centroidHz: 0,
    anchor: { position: vowel, safe, safeForward, safeReverse },
  };
}

/** What the loader needs of the pool. */
export interface PhraseHost { registerTransientRecord(record: ScratchRecord, pcm: Float64Array): void; forgetTransientRecords(prefix: string): void }

/**
 * Auto-cue a phrase WAV the demo's way and register its cues as Deck C's records; returns the phrase (its roles)
 * for the Auto Scratch setting. Throws on a WAV the demo's reader cannot read (24-bit).
 */
export function loadScratchPhrase(host: PhraseHost, bytes: ArrayBuffer, fileName: string): ScratchPhrase {
  const name = fileName.replace(/\.[^.]+$/, '');
  const cues = loadWavCues(bytes, RATE);
  host.forgetTransientRecords('PHRASE:');
  const roles = {} as Record<CueRole, string>;
  const registered = new Set<string>();
  for (const role of ['HOME', 'SECONDARY', 'ACCENT', 'FX'] as const) {
    const word = cues[PHRASE_ROLE_WORDS[role]] ? PHRASE_ROLE_WORDS[role] : 'ROCK';
    const id = phraseRecordId(name, word);
    if (!registered.has(id)) { host.registerTransientRecord(cueRecord(name, word, cues[word]!), cues[word]!.sig); registered.add(id); }
    roles[role] = id;
  }
  scratchPhraseStats.loads++;
  return { name, roles };
}
