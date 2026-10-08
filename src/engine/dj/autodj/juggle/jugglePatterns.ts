/**
 * The juggle pattern library (juggling plan sections 7-10, 14-20, 39): every
 * performance is a pattern with a grammar (SETUP, ESTABLISH, INTENSIFY, PEAK,
 * PAYOFF, RELEASE), explicit deck roles per step and actions in beats. The
 * executor places a pattern on an absolute master beat.
 *
 * Pure.
 */
import type { DJJuggleAction, DJJugglePattern, DJJugglePatternType, JuggleDeckRole, JugglePhase, MaterialWindow } from './juggleTypes';

export interface PatternParams {
  primary: 'A' | 'B';
  beatsPerBar: number;
  /** 0..1; shapes density, lengths and FX. */
  intensity: number;
  /** Phrase length of the primary track in bars. */
  phraseBars: number;
  /** Material windows chosen for call/response (optional). */
  material?: { call?: MaterialWindow; response?: MaterialWindow; fill?: MaterialWindow };
  /** Same track on both decks (doubles). */
  double?: { offsetBeats: number; primaryPosition: number };
  /** Confidence the planner computed for the context. */
  confidence: number;
  seed?: number;
}

const other = (d: 'A' | 'B'): 'A' | 'B' => (d === 'A' ? 'B' : 'A');

interface Builder {
  actions: DJJuggleAction[];
  roles: DJJugglePattern['roles'];
  phases: DJJugglePattern['phases'];
  seq: string[];
  beat: number;
}

function newBuilder(): Builder { return { actions: [], roles: [], phases: [], seq: [], beat: 0 }; }

function cutTo(b: Builder, deck: 'A' | 'B', at: number, phase: JugglePhase, reason: string, quant: DJJuggleAction['quantization'] = 'beat'): void {
  b.actions.push({ type: 'CutIn', deck, executeAtBeat: at, quantization: quant, phase, reason });
  b.roles.push({ beat: at, A: deck === 'A' ? 'VOICE' : 'SILENT', B: deck === 'B' ? 'VOICE' : 'SILENT' });
  b.seq.push(deck);
}

function layer(b: Builder, at: number, phase: JugglePhase, reason: string): void {
  b.actions.push({ type: 'HoldDeck', deck: 'BOTH', executeAtBeat: at, quantization: 'bar', phase, reason });
  b.roles.push({ beat: at, A: 'LAYER', B: 'LAYER' });
  b.seq.push('A+B');
}

function release(b: Builder, primary: 'A' | 'B', at: number, reason = 'release: the full groove returns'): void {
  b.actions.push({ type: 'ReleaseDeck', deck: primary, executeAtBeat: at, quantization: 'bar', phase: 'RELEASE', reason });
  b.actions.push({ type: 'ResetDeck', deck: other(primary), executeAtBeat: at, phase: 'RELEASE', reason: 'the other deck is reset for the next use' });
  b.roles.push({ beat: at, A: primary === 'A' ? 'PRIMARY' : 'SILENT', B: primary === 'B' ? 'PRIMARY' : 'SILENT' });
  b.seq.push(primary);
}

function phase(b: Builder, p: JugglePhase, start: number, end: number): void { b.phases.push({ phase: p, startBeat: start, endBeat: end }); }

/** Alternate decks every `unitBeats` for `rounds` rounds, starting with the primary. */
function trade(b: Builder, primary: 'A' | 'B', unitBeats: number, rounds: number, ph: JugglePhase, quant: DJJuggleAction['quantization']): void {
  for (let r = 0; r < rounds; r++) {
    cutTo(b, primary, b.beat, ph, `${unitBeats}-beat trade: ${primary} speaks`, quant);
    b.beat += unitBeats;
    cutTo(b, other(primary), b.beat, ph, `${unitBeats}-beat trade: ${other(primary)} answers`, quant);
    b.beat += unitBeats;
  }
}

function finish(type: DJJugglePatternType, p: PatternParams, b: Builder, opts: { energyProfile: DJJugglePattern['energyProfile']; reason: string; requiresDouble?: boolean; sourceDeck?: 'A' | 'B' | 'BOTH'; targetDeck?: 'A' | 'B' | 'BOTH' }): DJJugglePattern {
  const durationBars = Math.ceil(b.beat / p.beatsPerBar);
  return {
    id: `${type}-${p.seed ?? 0}`,
    type,
    durationBars,
    intensity: p.intensity,
    actions: b.actions,
    sourceDeck: opts.sourceDeck ?? p.primary,
    targetDeck: opts.targetDeck ?? other(p.primary),
    energyProfile: opts.energyProfile,
    confidence: p.confidence,
    reason: opts.reason,
    phases: b.phases,
    sequence: b.seq.join(' '),
    requiresDouble: opts.requiresDouble,
    roles: b.roles,
  };
}

// ── Library ─────────────────────────────────────────────────────────────────

export function phraseTrade(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const unit = Math.max(4, Math.min(8, p.phraseBars)) * p.beatsPerBar; // 4-8 bars each
  phase(b, 'SETUP', 0, 0);
  phase(b, 'ESTABLISH', 0, unit * 2);
  trade(b, p.primary, unit, 1, 'ESTABLISH', 'phrase');
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('phraseTrade', p, b, { energyProfile: 'FLAT', reason: `${unit / p.beatsPerBar}-bar phrases traded once, then the primary returns` });
}

export function tightPhraseTrade(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const unit = 2 * p.beatsPerBar;
  phase(b, 'ESTABLISH', 0, unit * 4);
  trade(b, p.primary, unit, 2, 'ESTABLISH', 'bar');
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('tightPhraseTrade', p, b, { energyProfile: 'FLAT', reason: '2-bar phrases traded twice' });
}

export function barTrade(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const unit = p.beatsPerBar;
  phase(b, 'INTENSIFY', 0, unit * 4);
  trade(b, p.primary, unit, 2, 'INTENSIFY', 'bar');
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('barTrade', p, b, { energyProfile: 'BUILD', reason: '1-bar trading' });
}

export function beatTrade(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  phase(b, 'PEAK', 0, p.beatsPerBar * 2);
  trade(b, p.primary, 1, p.beatsPerBar, 'PEAK', 'beat');
  phase(b, 'PAYOFF', b.beat, b.beat + p.beatsPerBar);
  layer(b, b.beat, 'PAYOFF', 'payoff: both decks together');
  b.beat += p.beatsPerBar;
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('beatTrade', p, b, { energyProfile: 'PEAK', reason: 'A B A B beat trading, a layered payoff, release' });
}

export function doubleBeat(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  phase(b, 'PEAK', 0, p.beatsPerBar * 2);
  trade(b, p.primary, 2, p.beatsPerBar / 2, 'PEAK', 'beat');
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('doubleBeat', p, b, { energyProfile: 'PEAK', reason: 'A A B B two-beat trading' });
}

export function callResponse(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const call = p.material?.call;
  const resp = p.material?.response;
  const unit = (call?.bars ?? 2) * p.beatsPerBar;
  const responder = other(p.primary);
  phase(b, 'ESTABLISH', 0, unit * 4);
  for (let r = 0; r < 2; r++) {
    if (call) b.actions.push({ type: 'JumpToBar', deck: p.primary, executeAtBeat: Math.max(0, b.beat - 0.01), targetPosition: call.startSec, phase: 'ESTABLISH', reason: `call material at ${call.startSec.toFixed(1)} s` });
    cutTo(b, p.primary, b.beat, 'ESTABLISH', `call: ${call ? call.primary : 'primary material'}`, 'bar');
    b.roles[b.roles.length - 1] = { beat: b.beat, A: p.primary === 'A' ? 'VOICE' : 'SILENT', B: p.primary === 'B' ? 'VOICE' : 'SILENT' };
    b.beat += unit;
    if (resp) b.actions.push({ type: 'JumpToBar', deck: responder, executeAtBeat: Math.max(0, b.beat - 0.01), targetPosition: resp.startSec, phase: 'ESTABLISH', reason: `response material at ${resp.startSec.toFixed(1)} s` });
    cutTo(b, responder, b.beat, 'ESTABLISH', `response: ${resp ? resp.primary : 'responder material'}`, 'bar');
    b.roles[b.roles.length - 1] = { beat: b.beat, A: responder === 'A' ? 'RESPONSE' : 'SILENT', B: responder === 'B' ? 'RESPONSE' : 'SILENT' };
    b.beat += unit;
  }
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('callResponse', p, b, { energyProfile: 'BUILD', reason: p.material?.call && p.material.response ? `${p.material.call.primary} answered by ${p.material.response.primary}` : 'call and response on phrase material' });
}

export function drumBassTrade(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const unit = p.beatsPerBar;
  const bassDeck = other(p.primary);
  phase(b, 'ESTABLISH', 0, unit * 4);
  for (let r = 0; r < 2; r++) {
    // Primary = drums (its low band cut), the other = bass; low end owned by one deck at a time.
    b.actions.push({ type: 'EQCut', deck: p.primary, executeAtBeat: b.beat, phase: 'ESTABLISH', reason: 'drums deck: low band cut, the bass deck owns the low end' });
    cutTo(b, p.primary, b.beat, 'ESTABLISH', 'drums', 'bar');
    b.roles[b.roles.length - 1] = { beat: b.beat, A: p.primary === 'A' ? 'FOUNDATION' : 'SILENT', B: p.primary === 'B' ? 'FOUNDATION' : 'SILENT' };
    b.beat += unit;
    cutTo(b, bassDeck, b.beat, 'ESTABLISH', 'bass', 'bar');
    b.roles[b.roles.length - 1] = { beat: b.beat, A: bassDeck === 'A' ? 'VOICE' : 'SILENT', B: bassDeck === 'B' ? 'VOICE' : 'SILENT' };
    b.beat += unit;
  }
  phase(b, 'PAYOFF', b.beat, b.beat + unit * 2);
  b.actions.push({ type: 'BassSwap', deck: bassDeck, executeAtBeat: b.beat, durationBeats: unit, phase: 'PAYOFF', reason: 'payoff: intentional hand-over, bass deck keeps the low end' });
  layer(b, b.beat, 'PAYOFF', 'drums and bass together');
  b.beat += unit * 2;
  phase(b, 'RELEASE', b.beat, b.beat);
  b.actions.push({ type: 'EQRestore', deck: p.primary, executeAtBeat: b.beat - 0.02, phase: 'RELEASE', reason: 'restore the drums deck low band' });
  release(b, p.primary, b.beat);
  return finish('drumBassTrade', p, b, { energyProfile: 'BUILD', reason: 'drums against bass, low end owned by one deck at a time, layered payoff' });
}

export function fillTrade(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const unit = p.beatsPerBar;
  const fillDeck = other(p.primary);
  const fill = p.material?.fill;
  phase(b, 'ESTABLISH', 0, unit * 6);
  // A groove, A groove, B fill, A groove, B fill, B fill, A+B drop.
  const steps: Array<'g' | 'f'> = ['g', 'g', 'f', 'g', 'f', 'f'];
  for (const s of steps) {
    if (s === 'g') { cutTo(b, p.primary, b.beat, 'ESTABLISH', 'groove', 'bar'); b.roles[b.roles.length - 1] = { beat: b.beat, A: p.primary === 'A' ? 'FOUNDATION' : 'SILENT', B: p.primary === 'B' ? 'FOUNDATION' : 'SILENT' }; }
    else {
      if (fill) b.actions.push({ type: 'JumpToBar', deck: fillDeck, executeAtBeat: Math.max(0, b.beat - 0.01), targetPosition: fill.startSec, phase: 'ESTABLISH', reason: `fill material at ${fill.startSec.toFixed(1)} s` });
      cutTo(b, fillDeck, b.beat, 'ESTABLISH', 'fill', 'bar');
      b.roles[b.roles.length - 1] = { beat: b.beat, A: fillDeck === 'A' ? 'FILL' : 'SILENT', B: fillDeck === 'B' ? 'FILL' : 'SILENT' };
    }
    b.beat += unit;
  }
  phase(b, 'PAYOFF', b.beat, b.beat + unit);
  layer(b, b.beat, 'PAYOFF', 'drop: both');
  b.beat += unit;
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('fillTrade', p, b, { energyProfile: 'BUILD', reason: fill ? `fills from ${fill.reason}` : 'groove against fills' });
}

export function loopTighten(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const bpb = p.beatsPerBar;
  const sizes = [4 * bpb, 2 * bpb, bpb, bpb / 2, bpb / 4].filter((s) => s >= 0.5);
  phase(b, 'INTENSIFY', 0, 0);
  b.actions.push({ type: 'StartLoop', deck: p.primary, executeAtBeat: 0, beats: sizes[0], quantization: 'bar', phase: 'INTENSIFY', reason: '4-bar loop' });
  b.roles.push({ beat: 0, A: p.primary === 'A' ? 'PRIMARY' : 'SILENT', B: p.primary === 'B' ? 'PRIMARY' : 'SILENT' });
  b.seq.push(`${p.primary}loop4`);
  b.beat += sizes[0];
  for (let i = 1; i < sizes.length; i++) {
    b.actions.push({ type: 'LoopResize', deck: p.primary, executeAtBeat: b.beat, beats: sizes[i], quantization: 'beat', phase: i < 3 ? 'INTENSIFY' : 'PEAK', reason: `tighten to ${sizes[i]} beats` });
    b.seq.push(`loop${sizes[i]}`);
    b.beat += Math.max(sizes[i] * 2, bpb);
  }
  phase(b, 'PEAK', sizes[0], b.beat);
  phase(b, 'RELEASE', b.beat, b.beat);
  b.actions.push({ type: 'ExitLoop', deck: p.primary, executeAtBeat: b.beat, quantization: 'bar', phase: 'RELEASE', reason: 'release the loop on the bar' });
  release(b, p.primary, b.beat, 'release: the track continues');
  return finish('loopTighten', p, b, { energyProfile: 'BUILD', reason: '4 -> 2 -> 1 -> 1/2 -> 1/4 bar loops, released on the bar', sourceDeck: p.primary, targetDeck: p.primary });
}

export function double(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const bpb = p.beatsPerBar;
  const offset = p.double?.offsetBeats ?? bpb;
  const target = (p.double?.primaryPosition ?? 0);
  phase(b, 'SETUP', 0, bpb);
  b.actions.push({ type: 'ResyncDeck', deck: other(p.primary), executeAtBeat: 0, targetPosition: target, beats: offset, quantization: 'bar', phase: 'SETUP', reason: `same track, offset ${offset} beats` });
  b.beat += bpb;
  phase(b, 'ESTABLISH', b.beat, b.beat + bpb * 4);
  trade(b, p.primary, bpb, 2, 'ESTABLISH', 'bar');
  phase(b, 'INTENSIFY', b.beat, b.beat + bpb * 2);
  trade(b, p.primary, 1, bpb, 'INTENSIFY', 'beat');
  phase(b, 'PAYOFF', b.beat, b.beat + bpb);
  layer(b, b.beat, 'PAYOFF', 'both copies together');
  b.beat += bpb;
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('double', p, b, { energyProfile: 'PEAK', reason: `offset double (${offset} beats): bar trading, beat trading, payoff`, requiresDouble: true });
}

export function transformer(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const bpb = p.beatsPerBar;
  // open / close on half beats (the smallest musical unit, section 2.2): the secondary is let through in short gates.
  const gate = 0.5;
  phase(b, 'PEAK', 0, bpb * 2);
  for (let beat = 0; beat < bpb * 2; beat += 1) {
    cutTo(b, other(p.primary), beat, 'PEAK', 'open', 'halfBeat');
    cutTo(b, p.primary, beat + gate, 'PEAK', 'close', 'halfBeat');
  }
  b.beat = bpb * 2;
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('transformer', p, b, { energyProfile: 'PEAK', reason: `transformer gates of ${gate} beat over two bars` });
}

export function dropAndReturn(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const bpb = p.beatsPerBar;
  const hitDeck = other(p.primary);
  phase(b, 'ESTABLISH', 0, bpb * 4);
  for (let r = 0; r < 2; r++) {
    cutTo(b, p.primary, b.beat, 'ESTABLISH', 'full', 'bar');
    b.beat += bpb;
    cutTo(b, hitDeck, b.beat, 'ESTABLISH', 'hit', 'beat');
    b.actions.push({ type: 'EchoThrow', deck: hitDeck, executeAtBeat: b.beat + 0.5, durationBeats: 1, strength: 0.6, phase: 'ESTABLISH', reason: 'the hit thrown into the echo' });
    b.beat += 1;
    cutTo(b, p.primary, b.beat, 'ESTABLISH', 'full', 'beat');
    b.beat += bpb - 1;
  }
  phase(b, 'PAYOFF', b.beat, b.beat + bpb);
  layer(b, b.beat, 'PAYOFF', 'A+B');
  b.beat += bpb;
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('dropAndReturn', p, b, { energyProfile: 'PEAK', reason: 'full / hit / full / hit, then both' });
}

export function escalatingJuggle(p: PatternParams): DJJugglePattern {
  const b = newBuilder();
  const bpb = p.beatsPerBar;
  const first = Math.max(4, Math.min(8, p.phraseBars));
  phase(b, 'SETUP', 0, 0);
  phase(b, 'ESTABLISH', 0, first * bpb * 2);
  trade(b, p.primary, first * bpb, 1, 'ESTABLISH', 'phrase');
  phase(b, 'INTENSIFY', b.beat, b.beat + (first / 2) * bpb * 2 + 2 * bpb * 2);
  trade(b, p.primary, (first / 2) * bpb, 1, 'INTENSIFY', 'bar');
  trade(b, p.primary, 2 * bpb, 1, 'INTENSIFY', 'bar');
  trade(b, p.primary, bpb, 1, 'INTENSIFY', 'bar');
  phase(b, 'PEAK', b.beat, b.beat + bpb * 2);
  trade(b, p.primary, 1, bpb, 'PEAK', 'beat');
  phase(b, 'PAYOFF', b.beat, b.beat + bpb * 2);
  layer(b, b.beat, 'PAYOFF', 'A+B full groove');
  b.beat += bpb * 2;
  phase(b, 'RELEASE', b.beat, b.beat);
  release(b, p.primary, b.beat);
  return finish('escalatingJuggle', p, b, { energyProfile: 'PEAK', reason: `${first} -> ${first / 2} -> 2 -> 1 bars -> beats -> payoff -> release` });
}

export const PATTERN_BUILDERS: Record<DJJugglePatternType, (p: PatternParams) => DJJugglePattern> = {
  phraseTrade, tightPhraseTrade, barTrade, beatTrade, doubleBeat, callResponse, drumBassTrade, fillTrade,
  loopTighten, double, transformer, dropAndReturn, escalatingJuggle,
};

/** The intensity a pattern type sits at on the ladder (juggling plan section 23). */
export const PATTERN_INTENSITY: Record<DJJugglePatternType, number> = {
  phraseTrade: 0.25, tightPhraseTrade: 0.4, callResponse: 0.45, fillTrade: 0.5, drumBassTrade: 0.5, barTrade: 0.7,
  double: 0.75, loopTighten: 0.75, dropAndReturn: 0.8, doubleBeat: 0.85, beatTrade: 0.85, transformer: 0.9, escalatingJuggle: 1.0,
};

/** Which modes may use which patterns (juggling plan section 44). */
export const MODE_PATTERNS: Record<Exclude<import('./juggleTypes').JuggleMode, 'OFF'>, DJJugglePatternType[]> = {
  SAFE: ['phraseTrade', 'tightPhraseTrade'],
  MUSICAL: ['phraseTrade', 'tightPhraseTrade', 'callResponse', 'fillTrade', 'double', 'drumBassTrade'],
  PERFORMER: ['phraseTrade', 'tightPhraseTrade', 'callResponse', 'fillTrade', 'double', 'drumBassTrade', 'barTrade', 'beatTrade', 'doubleBeat', 'loopTighten', 'transformer', 'dropAndReturn', 'escalatingJuggle'],
  AGGRESSIVE: ['tightPhraseTrade', 'callResponse', 'fillTrade', 'double', 'drumBassTrade', 'barTrade', 'beatTrade', 'doubleBeat', 'loopTighten', 'transformer', 'dropAndReturn', 'escalatingJuggle'],
  CHAOS: ['phraseTrade', 'tightPhraseTrade', 'callResponse', 'fillTrade', 'double', 'drumBassTrade', 'barTrade', 'beatTrade', 'doubleBeat', 'loopTighten', 'transformer', 'dropAndReturn', 'escalatingJuggle'],
};

export function rolesAt(pattern: DJJugglePattern, beat: number): { A: JuggleDeckRole; B: JuggleDeckRole } {
  let cur = pattern.roles[0] ?? { beat: 0, A: 'PRIMARY' as JuggleDeckRole, B: 'SILENT' as JuggleDeckRole };
  for (const r of pattern.roles) { if (r.beat <= beat) cur = r; else break; }
  return { A: cur.A, B: cur.B };
}

export function phaseAt(pattern: DJJugglePattern, beat: number): JugglePhase {
  let cur: JugglePhase = pattern.phases[0]?.phase ?? 'SETUP';
  for (const p of pattern.phases) { if (p.startBeat <= beat) cur = p.phase; }
  return cur;
}
