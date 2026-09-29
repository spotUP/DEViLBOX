/**
 * The labelled classifier corpus: which songs, how they load headless, and
 * how the classifier's roles map onto the categories the owner labels.
 *
 * Plan: thoughts/shared/plans/2026-09-29-channel-classifier.md (P0). The owner
 * labels every channel by ear (drums / bass / lead / harmony / fx-vocal, with
 * arpeggio and skank as sub-labels); channelClassifierScore.test.ts scores
 * the classifier against those labels.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ChannelRole } from '../MusicAnalysis';

/** What the owner labels a channel. 'silent' = no notes; not scored. */
export type ChannelLabel = 'drums' | 'bass' | 'lead' | 'harmony' | 'fx-vocal' | 'silent';
export type ChannelSubLabel = 'arpeggio' | 'skank';

/**
 * A channel's role. `label` is its role for most of the song. A channel that
 * changes role - a lead that becomes a pad, effects that become drums - lists
 * `sections` (song-order positions, inclusive) where it differs. `note` is
 * free text for a mixed role ("bass and snare").
 */
export interface LabelledSection { from: number; to: number; label: ChannelLabel; sub?: ChannelSubLabel }
export interface LabelledChannel { label: ChannelLabel; sub?: ChannelSubLabel; sections?: LabelledSection[]; note?: string }
export interface LabelledSong {
  song: string;
  channels: LabelledChannel[];
  /** 'draft' = the classifier's own verdict, not yet checked; 'owner' = labelled by ear. */
  labelledBy: 'draft' | 'owner';
  date: string;
}

/** The corpus (owner-approved draft, 2026-09-29). Paths from the repo root. */
export const CORPUS: readonly string[] = [
  // MOD
  'src/__tests__/fixtures/micro15-goto80.mod',
  'public/data/songs/mod/world class dub.mod',
  'public/data/songs/mod/break the box.mod',
  'public/data/songs/formats/a sleep so deep.mod',
  'public/data/songs/amigaklang/Virgill-redrum redrum.mod',
  'public/data/songs/amigaklang/JosSs-Cream.mod',
  'public/data/songs/amigaklang/Virgill-80s architecture.mod',
  'src/__tests__/fixtures/classifier-corpus/space_debris-captain.mod',
  'public/data/songs/octalyser/follow me to hell.mod',
  // XM
  'public/data/songs/xm/flo boarding - level 1.xm',
  'src/__tests__/fixtures/classifier-corpus/airwolf-jogeir liljedahl.xm',
  'src/__tests__/fixtures/classifier-corpus/cold summer nights-jogeir liljedahl.xm',
  'src/__tests__/fixtures/classifier-corpus/1 for me-jogeir liljedahl.xm',
  'src/__tests__/fixtures/classifier-corpus/banana boat ii-jogeir liljedahl.xm',
  // S3M
  'public/data/songs/s3m/andante.s3m',
  'public/data/songs/formats/nightmare on acid.s3m',
  'src/__tests__/fixtures/classifier-corpus/a touch of spring-purple motion.s3m',
  'src/__tests__/fixtures/classifier-corpus/alien incident - entity-purple motion.s3m',
  // IT
  'public/data/songs/it/absm chain mod.it',
  'src/__tests__/fixtures/classifier-corpus/bookworm-skaven.it',
  'src/__tests__/fixtures/classifier-corpus/martian lovesong-necros.it',
  'src/__tests__/fixtures/classifier-corpus/dirty walk-necros.it',
  // AHX / HVL
  'public/data/songs/ahx/amanda.ahx',
  'public/data/songs/formats/aces_high.ahx',
  'public/data/songs/formats/hexplosion.hvl',
  'public/data/songs/hivelytracker/waiting for a message.hvl',
  // Other Amiga
  'public/data/songs/bp-soundmon-2/nicktune1.bp',
];

export const REPO_ROOT = resolve(__dirname, '../../../..');

/** A corpus song, parsed the way the app parses it (parseModuleToSong). */
export async function loadCorpusSong(path: string) {
  const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
  const bytes = readFileSync(resolve(REPO_ROOT, path));
  return parseModuleToSong(new File([bytes], path.split('/').pop()!));
}

/** The classifier's role, in the labelling vocabulary. */
export function roleToLabel(role: ChannelRole): LabelledChannel {
  switch (role) {
    case 'percussion': return { label: 'drums' };
    case 'bass': return { label: 'bass' };
    case 'lead': return { label: 'lead' };
    case 'arpeggio': return { label: 'lead', sub: 'arpeggio' };
    case 'chord':
    case 'pad': return { label: 'harmony' };
    case 'skank': return { label: 'harmony', sub: 'skank' };
    case 'fx': return { label: 'fx-vocal' };
    case 'empty': return { label: 'silent' };
  }
}
