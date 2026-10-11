/**
 * Auto DJ debug / telemetry view (plan sections 44, 45): current track, next
 * track, the planned transition, confidence and risk, and the explanations
 * ("why this track", "why this transition") from the decision log. Reads the
 * telemetry snapshot the session controller publishes to the DJ store - the
 * single source the MCP's dj_auto_dj_explain tool returns too.
 */
import React from 'react';
import { useDJStore } from '@/stores/useDJStore';
import type { AutoDJTelemetry } from '@/engine/dj/autodj/telemetry';

const fmt = (v: number | null | undefined, digits = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(digits));
const secs = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) || v < 0 ? '-' : `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-2">
    <span className="text-text-muted">{label}</span>
    <span className="text-text-primary text-right truncate">{value}</span>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="border border-dark-borderLight rounded p-2 bg-dark-bgTertiary">
    <div className="text-[9px] font-mono uppercase tracking-wider text-accent-primary mb-1">{title}</div>
    <div className="space-y-0.5">{children}</div>
  </div>
);

export const DJAutoDJDebugPanel: React.FC<{ telemetry?: AutoDJTelemetry | null }> = ({ telemetry }) => {
  const fromStore = useDJStore((s) => s.autoDJTelemetry);
  const t = telemetry ?? fromStore;
  if (!t) {
    return (
      <div className="text-[10px] font-mono space-y-2">
        <div className="text-text-muted p-2" data-testid="autodj-debug-empty">
          Auto DJ Debug: no telemetry yet. Enable Auto DJ to see the plan.
        </div>
        <JuggleSection />
      </div>
    );
  }
  const tr = t.transition;
  return (
    <div className="text-[10px] font-mono space-y-2" data-testid="autodj-debug">
      <div className="flex items-center justify-between">
        <span className="text-text-primary font-bold uppercase tracking-wider">Auto DJ Debug</span>
        <span className="text-text-muted">Style {t.style} - Creative Risk {fmt(t.creativeRisk)} - Transitions {t.transitionCount}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Section title="Current Track">
          <Row label="Name" value={t.current.name ?? '-'} />
          <Row label="BPM" value={fmt(t.current.bpm, 1)} />
          <Row label="Key" value={t.current.key ?? 'Unknown'} />
          <Row label="Key Confidence" value={fmt(t.current.keyConfidence)} />
          <Row label="Energy" value={fmt(t.current.energy)} />
          <Row label="Set Phase" value={t.current.setPhase} />
          <Row label="Current Bar" value={String(t.current.bar)} />
          <Row label="Current Phrase" value={t.current.phrase === null ? '-' : String(t.current.phrase)} />
          <Row label="Section" value={t.current.section ?? '-'} />
          <Row label="Position" value={`${secs(t.current.positionSec)} (${secs(t.current.remainingSec)} left)`} />
        </Section>
        <Section title="Next Track">
          {t.next ? (
            <>
              <Row label="Name" value={t.next.name ?? '-'} />
              <Row label="BPM" value={fmt(t.next.bpm, 1)} />
              <Row label="Key" value={t.next.key ?? 'Unknown'} />
              <Row label="Energy" value={fmt(t.next.energy)} />
              <Row label="Mix-In Point" value={secs(t.next.mixInSec)} />
              <Row label="Mix-Out Point" value={secs(t.next.mixOutSec)} />
            </>
          ) : (
            <div className="text-text-muted">No next track prepared yet</div>
          )}
        </Section>
        <Section title="Transition">
          {tr ? (
            <>
              <Row label="Type" value={tr.type} />
              <Row label="Length" value={`${tr.lengthBars} bars`} />
              <Row label="Tempo Plan" value={tr.tempoPlan} />
              <Row label="Key Plan" value={tr.keyPlan} />
              <Row label="Bass Plan" value={tr.bassPlan} />
              <Row label="EQ Plan" value={tr.eqPlan} />
              <Row label="Filter Plan" value={tr.filterPlan} />
              <Row label="Effects" value={tr.effects.length ? tr.effects.join('; ') : 'none'} />
              <Row label="Loop" value={tr.loop ?? 'none'} />
              <Row label="Cue Jump" value={tr.cueJump ?? 'none'} />
              <Row label="Fallback" value={tr.fallback} />
            </>
          ) : (
            <div className="text-text-muted">No transition planned yet</div>
          )}
        </Section>
        <Section title="Confidence and Risk">
          <Row label="Confidence" value={fmt(tr ? tr.confidence : t.confidence)} />
          {tr && (
            <>
              <Row label="Risk Overall" value={fmt(tr.risk.overall)} />
              <Row label="Harmonic" value={fmt(tr.risk.harmonic)} />
              <Row label="Tempo" value={fmt(tr.risk.tempo)} />
              <Row label="Phrase" value={fmt(tr.risk.phrase)} />
              <Row label="Bass" value={fmt(tr.risk.bass)} />
              <Row label="Vocal" value={fmt(tr.risk.vocal)} />
              <Row label="Loudness" value={fmt(tr.risk.loudness)} />
              <Row label="Technical" value={fmt(tr.risk.technical)} />
            </>
          )}
          {t.lastQuality && <Row label="Last Quality" value={fmt(t.lastQuality.overall)} />}
        </Section>
        <Section title="Why This Track?">
          {t.whyThisTrack.length ? t.whyThisTrack.map((line, i) => <div key={i} className="text-text-secondary">{line}</div>) : <div className="text-text-muted">No track decision yet</div>}
        </Section>
        <Section title="Why This Transition?">
          {t.whyThisTransition.length ? t.whyThisTransition.map((line, i) => <div key={i} className="text-text-secondary">{line}</div>) : <div className="text-text-muted">No transition decision yet</div>}
        </Section>
      </div>
      <Section title="Session Order">
        <div className="text-text-secondary">{t.sessionOrder.length ? t.sessionOrder.map((o) => `${o.index + 1}. ${o.name}`).join('  >  ') : 'No session order yet'}</div>
      </Section>
      <JuggleSection />
    </div>
  );
};

/** Juggling plan section 45: mode, pattern, phase, intensity, per-deck material and roles, next actions, reason, safety. */
const JuggleSection: React.FC = () => {
  const j = useDJStore((s) => s.autoDJJuggleTelemetry);
  if (!j) {
    return (
      <Section title="Beat Juggling">
        <div className="text-text-muted" data-testid="autodj-juggle-empty">Auto Juggle has not run yet.</div>
      </Section>
    );
  }
  return (
    <Section title="Beat Juggling">
      <div data-testid="autodj-juggle">
        <Row label="Juggle Mode" value={j.mode} />
        <Row label="Juggle Active" value={j.active ? 'yes' : 'no'} />
        <Row label="Pattern" value={j.pattern ? `${j.pattern} (${j.sequence ?? ''})` : '-'} />
        <Row label="Pattern Phase" value={j.phase ?? '-'} />
        <Row label="Intensity" value={fmt(j.intensity)} />
        <Row label="Active Deck" value={j.activeDeck} />
        <Row label="Deck A" value={`${j.deckA.role} - ${j.deckA.material.join(', ') || '-'} (${fmt(j.deckA.confidence)})`} />
        <Row label="Deck B" value={`${j.deckB.role} - ${j.deckB.material.join(', ') || '-'} (${fmt(j.deckB.confidence)})`} />
        <Row label="Next Actions" value={j.nextActions.length ? j.nextActions.map((a) => `${a.type} ${a.deck} @ ${a.beat.toFixed(1)}`).join(', ') : '-'} />
        <Row label="Confidence" value={fmt(j.confidence)} />
        <Row label="Safety" value={j.safety} />
        <Row label="Stand-alone" value={j.standalone ? `${j.standalone.source} on ${j.standalone.deck} (${j.standalone.trigger}), ${j.standalone.phase}` : '-'} />
        <Row label="Budget" value={`${(j.budget.juggledFraction * 100).toFixed(0)} % juggled, cooldown ${Math.round(j.budget.cooldownSec)} s`} />
        <Row label="Last Quality" value={j.lastQuality ? fmt(j.lastQuality.overall) : '-'} />
        <div className="text-text-secondary">{j.reason}</div>
      </div>
    </Section>
  );
};
