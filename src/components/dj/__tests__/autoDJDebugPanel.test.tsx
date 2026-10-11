/**
 * Plan section 44 reachability: the Auto DJ debug view renders the telemetry
 * the session controller publishes to the DJ store - current track, next
 * track, transition plan, confidence/risk and the two "why" explanations -
 * with full English labels and the design-system token classes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { DJAutoDJDebugPanel } from '../DJAutoDJDebugPanel';
import { useDJStore } from '@/stores/useDJStore';
import { buildTelemetry } from '@/engine/dj/autodj/telemetry';
import { buildPerformanceContext } from '@/engine/dj/autodj/performanceContext';
import { getStyle } from '@/engine/dj/autodj/styleProfiles';
import { DJSessionMemory } from '@/engine/dj/autodj/sessionMemory';
import { corpusAnalysis } from '@/engine/dj/autodj/testing/corpus';
import { planTransition } from '@/engine/dj/autodj/transitionPlanner';
import { getDecisionLog } from '@/engine/dj/autodj/decisionLog';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Auto DJ debug view', () => {
  afterEach(() => cleanup());

  it('shows the published telemetry: current, next, transition, confidence, risk and both explanations', () => {
    const outgoing = corpusAnalysis('steady');
    const incoming = corpusAnalysis('longIntro');
    const memory = new DJSessionMemory();
    const style = getStyle('Club');
    const plan = planTransition({ outgoing, incoming, outgoingDeck: 'A', incomingDeck: 'B', outgoingPosition: 20, style, creativeRisk: 0.4, memory: memory.snapshot(), userBars: 8, withFilter: true, smartCuts: false, setPhase: 'BUILDING', targetEnergy: 0.7, seed: 1 });
    const log = getDecisionLog();
    log.clear();
    log.record('SELECT_NEXT_TRACK', ['compatible key (same)', '+3 BPM', 'energy rise matches set trajectory'], { selectedTrack: 'long intro', rejectedAlternatives: [{ track: 'clashKey', reason: 'highVocalConflict' }] });
    log.record('PLAN_TRANSITION', plan.reasons, { selectedTrack: plan.style, rejectedAlternatives: plan.rejected.slice(0, 2).map((r) => ({ track: r.style, reason: r.reason })) });
    const ctx = buildPerformanceContext({ currentDeck: 'A', incomingDeck: 'B', currentTrack: outgoing, incomingTrack: incoming, currentPosition: 20, timeRemainingSec: 42, setPhase: 'BUILDING', targetEnergy: 0.7, memory: memory.snapshot(), candidates: [], transition: plan, style, creativeRisk: 0.4 });
    const telemetry = buildTelemetry({ context: ctx, currentName: 'steady', nextName: 'long intro', plan, lastTrackDecision: log.last('SELECT_NEXT_TRACK'), lastTransitionDecision: log.last('PLAN_TRANSITION'), lastQuality: null, sessionOrder: [{ index: 1, name: 'long intro' }, { index: 4, name: 'drops' }] });
    useDJStore.getState().setAutoDJTelemetry(telemetry);

    const { getByText, getByTestId } = render(<DJAutoDJDebugPanel />);
    const root = getByTestId('autodj-debug');
    const text = root.textContent ?? '';
    for (const label of ['Current Track', 'Next Track', 'Transition', 'Confidence and Risk', 'Why This Track?', 'Why This Transition?', 'Session Order', 'Key Confidence', 'Set Phase', 'Current Bar', 'Current Phrase', 'Mix-In Point', 'Mix-Out Point', 'Tempo Plan', 'Key Plan', 'Bass Plan', 'EQ Plan', 'Filter Plan', 'Risk Overall']) {
      expect(text, label).toContain(label);
    }
    expect(text).toContain('steady');
    expect(text).toContain('long intro');
    expect(text).toContain('BUILDING');
    expect(text).toContain(plan.style);
    expect(text).toContain(`${plan.durationBars} bars`);
    expect(text).toContain('+ compatible key (same)');
    expect(text).toContain('- clashKey: highVocalConflict');
    expect(text).toContain('2. long intro');
    expect(getByText('Auto DJ Debug')).toBeTruthy();
    // No emojis, no raw colour classes: token classes only.
    const src = readFileSync(resolve(process.cwd(), 'src/components/dj/DJAutoDJDebugPanel.tsx'), 'utf8');
    expect(/\p{Extended_Pictographic}/u.test(src)).toBe(false);
    expect(src).not.toMatch(/text-(red|green|blue|amber|violet|cyan|rose|emerald)-\d{3}/);
  }, 60_000);

  it('JUG-PG-M: the Beat Juggling section shows mode, pattern, phase, intensity, per-deck material and roles, next actions, reason and safety', () => {
    useDJStore.getState().setAutoDJTelemetry(null);
    useDJStore.getState().setAutoDJJuggleTelemetry({
      mode: 'PERFORMER', active: true, pattern: 'beatTrade', sequence: 'A B A B A+B A', phase: 'PEAK', intensity: 0.85, activeDeck: 'A',
      deckA: { material: ['FULL_GROOVE'], confidence: 0.9, role: 'VOICE' }, deckB: { material: ['DRUM_FILL'], confidence: 0.8, role: 'RESPONSE' },
      nextActions: [{ deck: 'B', type: 'CutIn', beat: 41 }], reason: 'beatTrade (A B A B) at 0.85 intensity: strong beat confidence', confidence: 0.9, safety: 'clear',
      budget: { juggledFraction: 0.1, secondsSinceLastJuggle: 120, cooldownSec: 90 }, lastQuality: null, history: [{ type: 'phraseTrade', bars: 16, score: 0.8 }],
      standalone: { trigger: 'build', source: 'double', phase: 'running', deck: 'B' },
    });
    const { getByTestId } = render(<DJAutoDJDebugPanel telemetry={null} />);
    const text = getByTestId('autodj-juggle').textContent ?? '';
    for (const label of ['Juggle Mode', 'Juggle Active', 'Pattern', 'Pattern Phase', 'Intensity', 'Active Deck', 'Deck A', 'Deck B', 'Next Actions', 'Confidence', 'Safety', 'Stand-alone', 'Budget']) {
      expect(text, label).toContain(label);
    }
    expect(text).toContain('PERFORMER');
    expect(text).toContain('beatTrade (A B A B A+B A)');
    expect(text).toContain('PEAK');
    expect(text).toContain('VOICE - FULL_GROOVE');
    expect(text).toContain('RESPONSE - DRUM_FILL');
    expect(text).toContain('CutIn B @ 41.0');
    expect(text).toContain('strong beat confidence');
    expect(text).toContain('10 % juggled, cooldown 90 s');
    expect(text).toContain('double on B (build), running');
    useDJStore.getState().setAutoDJJuggleTelemetry(null);
  });

  it('without telemetry it says so in full words', () => {
    useDJStore.getState().setAutoDJTelemetry(null);
    const { getByTestId } = render(<DJAutoDJDebugPanel />);
    expect(getByTestId('autodj-debug-empty').textContent).toContain('no telemetry yet');
  });
});
