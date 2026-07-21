/**
 * CamelotWheel — shared harmonic-mixing wheel for the DJ mixer centre.
 *
 * Renders the 24-segment Camelot wheel (outer ring = major/B, inner ring =
 * minor/A). The focus key (Deck A when loaded, else Deck B) drives harmonic
 * highlighting: perfect / energy / mood segments light up, clashing segments
 * dim out. Each deck's current key is marked with its deck letter so you can
 * read cross-deck compatibility at a glance.
 *
 * All colour comes from DJKeyUtils' Camelot palette (an intentional decorative
 * palette, not a design token) — the model is built by the tested pure helper
 * buildCamelotWheel(), so this component is presentation only.
 */

import React, { useMemo } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { useShallow } from 'zustand/react/shallow';
import {
  buildCamelotWheel,
  keyCompatibility,
  keyCompatibilityColor,
  camelotDisplay,
  camelotColor,
  toCamelot,
  type DeckId,
} from '@/engine/dj/DJKeyUtils';

interface CamelotWheelProps {
  size?: number;
}

const TAU = Math.PI * 2;

/** Polar → cartesian, angle in turns measured clockwise from top. */
function polar(cx: number, cy: number, r: number, turns: number): [number, number] {
  const a = turns * TAU - TAU / 4; // 0 turns = straight up
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Annular-sector path between radii [rI, rO] spanning [t0, t1] turns. */
function sectorPath(
  cx: number,
  cy: number,
  rI: number,
  rO: number,
  t0: number,
  t1: number,
): string {
  const [ox0, oy0] = polar(cx, cy, rO, t0);
  const [ox1, oy1] = polar(cx, cy, rO, t1);
  const [ix1, iy1] = polar(cx, cy, rI, t1);
  const [ix0, iy0] = polar(cx, cy, rI, t0);
  return [
    `M ${ox0} ${oy0}`,
    `A ${rO} ${rO} 0 0 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${rI} ${rI} 0 0 0 ${ix0} ${iy0}`,
    'Z',
  ].join(' ');
}

function relationOpacity(relation: string, hasFocus: boolean): number {
  // No focus key yet → muted reference wheel: each slot keeps its own colour so
  // it reads as a labelled Camelot chart, not a flat glow or a dark void.
  if (!hasFocus) return 0.4;
  switch (relation) {
    case 'perfect': return 1;
    case 'energy-boost':
    case 'energy-drop':
    case 'mood-change':
    case 'compatible': return 0.72;
    default: return 0.16; // clash
  }
}

/** Only accept a key string that actually resolves to a Camelot slot. */
function sanitizeKey(k: string | null | undefined): string | null {
  return toCamelot(k) ? (k as string) : null;
}

export const CamelotWheel: React.FC<CamelotWheelProps> = ({ size = 108 }) => {
  const { keyA, keyB, keyC, hasThird, stateA, stateB } = useDJStore(
    useShallow((s) => ({
      keyA: sanitizeKey(s.decks.A.musicalKey ?? s.decks.A.seratoKey),
      keyB: sanitizeKey(s.decks.B.musicalKey ?? s.decks.B.seratoKey),
      keyC: sanitizeKey(s.decks.C.musicalKey ?? s.decks.C.seratoKey),
      hasThird: s.thirdDeckActive,
      stateA: s.decks.A.analysisState,
      stateB: s.decks.B.analysisState,
    })),
  );

  // Focus on Deck A's key when present, else Deck B — that deck's harmonic
  // neighbourhood is what we light up.
  const focusKey = keyA ?? keyB;

  const deckKeys = useMemo(() => {
    const arr: { deckId: DeckId; key: string | null }[] = [
      { deckId: 'A', key: keyA },
      { deckId: 'B', key: keyB },
    ];
    if (hasThird) arr.push({ deckId: 'C', key: keyC });
    return arr;
  }, [keyA, keyB, keyC, hasThird]);

  // Is either deck still resolving its key? (so idle reads "analysing" not "broken")
  const analysing =
    (!keyA && (stateA === 'pending' || stateA === 'rendering' || stateA === 'analyzing')) ||
    (!keyB && (stateB === 'pending' || stateB === 'rendering' || stateB === 'analyzing'));

  const segments = useMemo(
    () => buildCamelotWheel(focusKey, deckKeys),
    [focusKey, deckKeys],
  );

  const hasFocus = !!focusKey;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rMid = rOuter * 0.66;
  const rInner = rOuter * 0.34;
  const gap = 0.006; // turns of padding between wedges

  const anyKey = deckKeys.some((d) => d.key);

  return (
    <div className="flex flex-col items-center gap-0.5" title="Camelot harmonic-mix wheel">
      <span className="text-[9px] font-mono text-text-muted tracking-wider uppercase">Harmonic</span>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Camelot harmonic mixing wheel">
        {segments.map((seg) => {
          const n = seg.number;
          const t0 = (n - 1) / 12 - 0.5 / 12 + gap;
          const t1 = (n - 1) / 12 + 0.5 / 12 - gap;
          const [rI, rO] = seg.ring === 'B' ? [rMid, rOuter] : [rInner, rMid];
          const occupied = seg.decks.length > 0;
          // Occupied segments read at full strength in their own colour; others
          // fade by harmonic relation to the focus key.
          const fill = seg.color;
          const opacity = occupied ? 1 : relationOpacity(seg.relation, hasFocus);
          const [lx, ly] = polar(cx, cy, (rI + rO) / 2, (n - 1) / 12);
          return (
            <g key={seg.display}>
              <path
                d={sectorPath(cx, cy, rI, rO, t0, t1)}
                fill={fill}
                fillOpacity={opacity}
                stroke={occupied ? '#ffffff' : 'rgba(0,0,0,0.35)'}
                strokeWidth={occupied ? 1.4 : 0.5}
              />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={seg.ring === 'B' ? 7 : 6}
                fontFamily="monospace"
                fill={occupied ? '#000000' : 'rgba(255,255,255,0.75)'}
                fontWeight={occupied ? 700 : 400}
                style={{ pointerEvents: 'none' }}
              >
                {occupied ? seg.decks.join('') : n}
              </text>
            </g>
          );
        })}
        {/* Centre hub: focus deck's Camelot key, or analysing / idle state */}
        <circle cx={cx} cy={cy} r={rInner - 1} fill="rgba(10,12,16,0.9)" stroke="rgba(255,255,255,0.14)" strokeWidth={0.75} />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={focusKey ? 11 : 8}
          fontFamily="monospace"
          fontWeight={700}
          fill={focusKey ? '#f3f4f6' : analysing ? '#eab308' : '#6b7280'}
        >
          {focusKey ? camelotDisplay(focusKey) : analysing ? '···' : '—'}
        </text>
      </svg>

      {/* Per-deck key read-out — makes detection state visible at a glance */}
      <div className="flex items-center gap-2 text-[9px] font-mono">
        {deckKeys.map((d) => {
          const disp = d.key ? camelotDisplay(d.key) : anyKey || !analysing ? '—' : '···';
          return (
            <span key={d.deckId} className="tabular-nums" style={{ color: d.key ? camelotColor(d.key) : '#6b7280' }}>
              {d.deckId} {disp}
            </span>
          );
        })}
      </div>

      {/* Cross-deck harmonic relation A→B */}
      {keyA && keyB && (
        <div
          className="text-[9px] font-mono tracking-wider uppercase"
          style={{ color: keyCompatibilityColor(keyCompatibility(keyA, keyB)) }}
        >
          A→B {relationLabel(keyCompatibility(keyA, keyB))}
        </div>
      )}
    </div>
  );
};

function relationLabel(rel: ReturnType<typeof keyCompatibility>): string {
  switch (rel) {
    case 'perfect': return 'MATCH';
    case 'compatible': return 'COMPAT';
    case 'energy-boost': return 'ENERGY +';
    case 'energy-drop': return 'ENERGY -';
    case 'mood-change': return 'MOOD';
    default: return 'CLASH';
  }
}
