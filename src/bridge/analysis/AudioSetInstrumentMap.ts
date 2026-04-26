/**
 * Maps AudioSet class label strings → InstrumentType → ChannelRole.
 *
 * CED outputs logits for 527 AudioSet classes. The id2label mapping is fetched
 * from the model's config.json at worker init time, then each label string is
 * matched here via keyword rules. String-matching is more robust than
 * hardcoding class indices (which can shift between model versions).
 */
import type { ChannelRole } from './MusicAnalysis';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Coarse instrument type derived from AudioSet label. */
export type InstrumentType =
  | 'kick' | 'snare' | 'hihat' | 'cymbal' | 'drum' | 'percussion'
  | 'bass' | 'guitar' | 'piano' | 'keyboard' | 'organ' | 'synthesizer'
  | 'sampler' | 'pad' | 'strings' | 'brass' | 'wind' | 'voice'
  | 'unknown';

export interface InstrumentTypeResult {
  instrumentId: number;
  instrumentType: InstrumentType;
  /** Raw top-5 AudioSet predictions. */
  topLabels: Array<{ label: string; score: number }>;
  confidence: number;
}

// ── AudioSet label → InstrumentType ──────────────────────────────────────────

/** Map an AudioSet label string to our InstrumentType.
 *  Most-specific rules checked first to avoid false matches. */
export function audioSetLabelToInstrumentType(label: string): InstrumentType {
  const l = label.toLowerCase();

  // ── Percussion (specific first) ───────────────────────────────────────────
  if (l.includes('bass drum') || l === 'kick drum' || l.includes('kick drum')) return 'kick';
  if (l.includes('snare')) return 'snare';
  if (l.includes('hi-hat') || l.includes('hi hat') || l === 'hihat') return 'hihat';
  if (l.includes('cymbal') || l.includes('crash') || l.includes('ride cymbal')) return 'cymbal';
  if (l.includes('drum machine') || l.includes('drum kit') || l.includes('drum loop')) return 'drum';
  if (
    l.includes('drum') || l.includes('percussion') || l.includes('tabla') ||
    l.includes('bongo') || l.includes('conga') || l.includes('djembe') ||
    l.includes('tambourine') || l.includes('cowbell') || l.includes('wood block') ||
    l.includes('marimba') || l.includes('xylophone') || l.includes('vibraphone') ||
    l.includes('timpani') || l.includes('steel pan') || l.includes('clapping')
  ) return 'percussion';

  // ── Bass ─────────────────────────────────────────────────────────────────
  if (l.includes('bass guitar') || l.includes('electric bass') || l === 'bass') return 'bass';

  // ── Synthesizer family ────────────────────────────────────────────────────
  if (l.includes('synthesizer') || l.includes('synth')) return 'synthesizer';
  if (l.includes('sampler')) return 'sampler';
  if (l.includes('hammond') || l.includes('electronic organ') || l.includes('organ')) return 'organ';
  if (
    l.includes('electric piano') || l.includes('rhodes') ||
    l.includes('clavinet') || l.includes('harpsichord')
  ) return 'keyboard';
  if (l.includes('piano')) return 'piano';
  if (l.includes('keyboard') || l.includes('keytar')) return 'keyboard';

  // ── Guitar ────────────────────────────────────────────────────────────────
  if (l.includes('electric guitar')) return 'guitar';
  if (
    l.includes('guitar') || l.includes('banjo') || l.includes('mandolin') ||
    l.includes('ukulele') || l.includes('sitar') || l.includes('lute')
  ) return 'guitar';

  // ── Strings ───────────────────────────────────────────────────────────────
  if (
    l.includes('violin') || l.includes('fiddle') || l.includes('cello') ||
    l.includes('viola') || l.includes('double bass') || l.includes('string section') ||
    l.includes('bowed string') || l.includes('harp')
  ) return 'strings';

  // ── Brass / Wind ─────────────────────────────────────────────────────────
  if (
    l.includes('trumpet') || l.includes('trombone') || l.includes('french horn') ||
    l.includes('tuba') || l.includes('brass') || l.includes('bugle')
  ) return 'brass';
  if (
    l.includes('flute') || l.includes('clarinet') || l.includes('saxophone') ||
    l.includes('oboe') || l.includes('bassoon') || l.includes('recorder') ||
    l.includes('bagpipe') || l.includes('harmonica') || l.includes('accordion')
  ) return 'wind';

  // ── Voice ─────────────────────────────────────────────────────────────────
  if (
    l.includes('voice') || l.includes('singing') || l.includes('vocal') ||
    l.includes('choir') || l.includes('chant') || l.includes('opera') ||
    l.includes('beatbox') || l.includes('whistling')
  ) return 'voice';

  return 'unknown';
}

// ── InstrumentType → ChannelRole ─────────────────────────────────────────────

/** Map CED instrument type to an AutoDub ChannelRole.
 *  Returns null for 'unknown' (no opinion — let existing classifier decide). */
export function instrumentTypeToRole(type: InstrumentType): ChannelRole | null {
  switch (type) {
    case 'kick':
    case 'snare':
    case 'hihat':
    case 'cymbal':
    case 'drum':
    case 'percussion':
      return 'percussion';
    case 'bass':
      return 'bass';
    case 'pad':
      return 'pad';
    // Everything melodic defaults to 'lead' — note-range analysis in ChannelNaming
    // will later promote to 'chord'/'skank'/'arpeggio' as appropriate.
    case 'guitar':
    case 'piano':
    case 'keyboard':
    case 'organ':
    case 'synthesizer':
    case 'sampler':
    case 'strings':
    case 'brass':
    case 'wind':
    case 'voice':
      return 'lead';
    case 'unknown':
      return null;
  }
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Short display label for the instrument list UI tag. */
export function instrumentTypeLabel(type: InstrumentType): string {
  const labels: Record<InstrumentType, string> = {
    kick: 'KICK', snare: 'SNARE', hihat: 'HAT', cymbal: 'CYM',
    drum: 'DRUM', percussion: 'PERC', bass: 'BASS', guitar: 'GTR',
    piano: 'PIANO', keyboard: 'KEYS', organ: 'ORG', synthesizer: 'SYNTH',
    sampler: 'SMPL', pad: 'PAD', strings: 'STR', brass: 'BRASS',
    wind: 'WIND', voice: 'VOX', unknown: '?',
  };
  return labels[type] ?? '?';
}

/** Tailwind text-color class for each instrument type. */
export function instrumentTypeColor(type: InstrumentType): string {
  switch (type) {
    case 'kick': case 'snare': case 'hihat': case 'cymbal':
    case 'drum': case 'percussion':
      return 'text-accent-warning';
    case 'bass':
      return 'text-accent-primary';
    case 'synthesizer': case 'sampler': case 'keyboard': case 'organ':
      return 'text-accent-secondary';
    case 'guitar': case 'piano':
      return 'text-accent-highlight';
    case 'pad':
      return 'text-accent-success';
    default:
      return 'text-text-muted';
  }
}
