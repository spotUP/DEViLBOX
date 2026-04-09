/**
 * PixiFXSearchReplace — GL-native FX search & replace panel.
 * Finds tracker cells matching a given effect code (effTyp/eff) and replaces them.
 *
 * Effect codes: hex byte strings (e.g. "0A"). The search can match:
 *   - By effect type only (leave param blank → match any eff value)
 *   - By effect type + exact eff param value
 * Replace: sets new effTyp and/or eff for each match.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from './PixiButton';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { useTrackerStore } from '@stores';
import type { Pattern } from '@typedefs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Match {
  patternIndex: number;
  channel: number;
  row: number;
}

export interface PixiFXSearchReplaceProps {
  width: number;
  height: number;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a hex string (1-2 chars) to a number, or null if empty/invalid. */
function parseHexInput(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const v = parseInt(trimmed, 16);
  if (isNaN(v)) return null;
  return Math.max(0, Math.min(255, v));
}

function findMatches(
  patterns: Pattern[],
  searchEffTyp: number | null,
  searchEff: number | null,
  scope: 'current' | 'all',
  currentPatternIndex: number,
): Match[] {
  if (searchEffTyp === null) return [];
  const results: Match[] = [];
  const idxRange = scope === 'current'
    ? [currentPatternIndex]
    : patterns.map((_, i) => i);

  for (const pi of idxRange) {
    const pattern = patterns[pi];
    if (!pattern) continue;
    for (let ch = 0; ch < pattern.channels.length; ch++) {
      const channel = pattern.channels[ch];
      for (let row = 0; row < channel.rows.length; row++) {
        const cell = channel.rows[row];
        // Match effect column 1
        if (cell.effTyp === searchEffTyp && (searchEff === null || cell.eff === searchEff)) {
          results.push({ patternIndex: pi, channel: ch, row });
        }
        // Also match effect column 2
        else if (cell.effTyp2 === searchEffTyp && (searchEff === null || cell.eff2 === searchEff)) {
          results.push({ patternIndex: pi, channel: ch, row });
        }
      }
    }
  }
  return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

const TITLE_H = 28;
const ROW_H = 28;
const FOOTER_H = 36;
const INPUT_W = 56;
const GAP = 6;
const PAD = 10;

export const PixiFXSearchReplace: React.FC<PixiFXSearchReplaceProps> = ({
  width,
  height,
  onClose,
}) => {
  const theme = usePixiTheme();

  const [searchTypStr, setSearchTypStr] = useState('');
  const [searchEffStr, setSearchEffStr] = useState('');
  const [replaceTypStr, setReplaceTypStr] = useState('');
  const [replaceEffStr, setReplaceEffStr] = useState('');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [lastReplaced, setLastReplaced] = useState<number | null>(null);

  // Keep refs for escape key
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const searchEffTyp = parseHexInput(searchTypStr);
  const searchEff = parseHexInput(searchEffStr);
  const replaceEffTyp = parseHexInput(replaceTypStr);
  const replaceEff = parseHexInput(replaceEffStr);

  const handleFindAll = useCallback(() => {
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const matches = findMatches(patterns, searchEffTyp, searchEff, scope, currentPatternIndex);
    setMatchCount(matches.length);
    setLastReplaced(null);
  }, [searchEffTyp, searchEff, scope]);

  const handleReplaceAll = useCallback(() => {
    if (replaceEffTyp === null && replaceEff === null) return;
    const { patterns, currentPatternIndex } = useTrackerStore.getState();
    const matches = findMatches(patterns, searchEffTyp, searchEff, scope, currentPatternIndex);
    if (matches.length === 0) { setMatchCount(0); setLastReplaced(0); return; }

    // Batch all mutations in a single setState call
    useTrackerStore.setState((state) => {
      for (const m of matches) {
        const p = state.patterns[m.patternIndex];
        if (!p) continue;
        const cell = p.channels[m.channel]?.rows[m.row];
        if (!cell) continue;

        // Determine which effect column matched
        const matchedCol1 = cell.effTyp === searchEffTyp && (searchEff === null || cell.eff === searchEff);
        if (matchedCol1) {
          if (replaceEffTyp !== null) cell.effTyp = replaceEffTyp;
          if (replaceEff !== null) cell.eff = replaceEff;
        } else {
          if (replaceEffTyp !== null) cell.effTyp2 = replaceEffTyp;
          if (replaceEff !== null) cell.eff2 = replaceEff;
        }
      }
    });

    setMatchCount(matches.length);
    setLastReplaced(matches.length);
  }, [searchEffTyp, searchEff, replaceEffTyp, replaceEff, scope]);

  // ── Draw functions ────────────────────────────────────────────────────────
  const drawScopeBtn = useCallback((isActive: boolean) => (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 100, 20);
    g.fill({ color: isActive ? theme.accent.color : theme.bgTertiary.color, alpha: isActive ? 0.25 : 0.5 });
    g.rect(0, 0, 100, 20);
    g.stroke({ color: isActive ? theme.accent.color : theme.border.color, alpha: isActive ? 0.7 : 0.4, width: 1 });
  }, [theme]);

  const drawScopeCurrent = drawScopeBtn(scope === 'current');
  const drawScopeAll = drawScopeBtn(scope === 'all');

  const statusText = lastReplaced !== null
    ? `Replaced: ${lastReplaced} cell${lastReplaced !== 1 ? 's' : ''}`
    : matchCount !== null
      ? `Found: ${matchCount} match${matchCount !== 1 ? 'es' : ''}`
      : '';

  return (
    <layoutContainer
      layout={{
        position: 'absolute',
        width,
        height,
        flexDirection: 'column',
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
      }}
      eventMode="static"
    >

      {/* Title row */}
      <pixiContainer layout={{ width: '100%', height: TITLE_H, flexDirection: 'row', alignItems: 'center', paddingLeft: PAD, paddingRight: 4 }}>
        <pixiBitmapText
          text="FX SEARCH & REPLACE"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
          tint={theme.text.color}
          layout={{ flexGrow: 1 }}
        />
        <PixiButton
          label="X"
          variant="ghost"
          size="sm"
          onClick={onClose}
          layout={{ width: 24 }}
        />
      </pixiContainer>

      {/* Row 1: Find */}
      <pixiContainer layout={{ width: '100%', height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: PAD, marginTop: PAD }}>
        <pixiBitmapText
          text="FIND:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiPureTextInput
          value={searchTypStr}
          onChange={setSearchTypStr}
          placeholder="EF"
          width={INPUT_W}
          height={22}
          fontSize={13}
          font="mono"
          layout={{}}
        />
        <pixiBitmapText
          text="PARAM:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiPureTextInput
          value={searchEffStr}
          onChange={setSearchEffStr}
          placeholder="any"
          width={INPUT_W}
          height={22}
          fontSize={13}
          font="mono"
          layout={{}}
        />
      </pixiContainer>

      {/* Row 2: Replace */}
      <pixiContainer layout={{ width: '100%', height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: PAD, marginTop: GAP }}>
        <pixiBitmapText
          text="REPL:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiPureTextInput
          value={replaceTypStr}
          onChange={setReplaceTypStr}
          placeholder="EF"
          width={INPUT_W}
          height={22}
          fontSize={13}
          font="mono"
          layout={{}}
        />
        <pixiBitmapText
          text="PARAM:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <PixiPureTextInput
          value={replaceEffStr}
          onChange={setReplaceEffStr}
          placeholder="--"
          width={INPUT_W}
          height={22}
          fontSize={13}
          font="mono"
          layout={{}}
        />
      </pixiContainer>

      {/* Row 3: Scope */}
      <pixiContainer layout={{ width: '100%', height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: PAD, marginTop: GAP }}>
        <pixiBitmapText
          text="SCOPE:"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 11, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onClick={() => setScope('current')}
          layout={{ width: 100, height: 20, flexDirection: 'row', alignItems: 'center', paddingLeft: 6 }}
        >
          <pixiGraphics draw={drawScopeCurrent} layout={{ position: 'absolute', width: 100, height: 20 }} />
          <pixiBitmapText
            text="Cur.Pattern"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={scope === 'current' ? theme.accent.color : theme.textSecondary.color}
            layout={{}}
          />
        </pixiContainer>
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onClick={() => setScope('all')}
          layout={{ width: 100, height: 20, flexDirection: 'row', alignItems: 'center', paddingLeft: 6 }}
        >
          <pixiGraphics draw={drawScopeAll} layout={{ position: 'absolute', width: 100, height: 20 }} />
          <pixiBitmapText
            text="All Patterns"
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={scope === 'all' ? theme.accent.color : theme.textSecondary.color}
            layout={{}}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Footer: status + buttons */}
      <pixiContainer layout={{ width: '100%', height: FOOTER_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: PAD, paddingRight: 4, marginTop: 'auto' }}>
        {statusText !== '' && (
          <pixiBitmapText
            text={statusText}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
            tint={lastReplaced !== null ? theme.success.color : theme.accentSecondary.color}
            layout={{}}
          />
        )}
        <pixiContainer layout={{ flexGrow: 1 }} />
        <PixiButton
          label="Find All"
          variant="ghost"
          size="sm"
          onClick={handleFindAll}
          layout={{}}
        />
        <PixiButton
          label="Replace All"
          variant="ft2"
          color="blue"
          size="sm"
          onClick={handleReplaceAll}
          layout={{}}
        />
        <PixiButton
          label="Close"
          variant="ghost"
          size="sm"
          onClick={onClose}
          layout={{}}
        />
      </pixiContainer>
    </layoutContainer>
  );
};
