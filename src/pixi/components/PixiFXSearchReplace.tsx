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
const LABEL_W = 44;
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
  const drawPanel = useCallback((g: GraphicsType) => {
    g.clear();
    // Panel background
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgSecondary.color });
    // Border
    g.rect(0, 0, width, height);
    g.stroke({ color: theme.border.color, alpha: 0.7, width: 1 });
    // Title bar background
    g.rect(0, 0, width, TITLE_H);
    g.fill({ color: theme.bgTertiary.color });
    // Title bar bottom border
    g.rect(0, TITLE_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
    // Footer top border
    g.rect(0, height - FOOTER_H, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [width, height, theme]);

  const drawScopeBtn = useCallback((isActive: boolean) => (g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, 100, 20);
    g.fill({ color: isActive ? theme.accent.color : theme.bgTertiary.color, alpha: isActive ? 0.25 : 0.5 });
    g.rect(0, 0, 100, 20);
    g.stroke({ color: isActive ? theme.accent.color : theme.border.color, alpha: isActive ? 0.7 : 0.4, width: 1 });
  }, [theme]);

  const drawScopeCurrent = drawScopeBtn(scope === 'current');
  const drawScopeAll = drawScopeBtn(scope === 'all');

  const contentY = TITLE_H + PAD;
  const row1Y = contentY;
  const row2Y = contentY + ROW_H + GAP;
  const row3Y = contentY + (ROW_H + GAP) * 2;
  const footerY = height - FOOTER_H + (FOOTER_H - 24) / 2;

  const statusText = lastReplaced !== null
    ? `Replaced: ${lastReplaced} cell${lastReplaced !== 1 ? 's' : ''}`
    : matchCount !== null
      ? `Found: ${matchCount} match${matchCount !== 1 ? 'es' : ''}`
      : '';

  return (
    <pixiContainer
      layout={{ position: 'absolute', width, height }}
      eventMode="static"
    >
      {/* Panel background / border / title bar */}
      <pixiGraphics draw={drawPanel} layout={{ position: 'absolute', width, height }} />

      {/* Title */}
      <pixiBitmapText
        text="FX SEARCH & REPLACE"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 10, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{ position: 'absolute', left: PAD, top: (TITLE_H - 10) / 2 }}
      />

      {/* Close button */}
      <PixiButton
        label="X"
        variant="ghost"
        size="sm"
        onClick={onClose}
        layout={{ position: 'absolute', right: 4, top: (TITLE_H - 24) / 2, width: 24 }}
      />

      {/* Row 1: Find */}
      <pixiBitmapText
        text="FIND:"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: PAD, top: row1Y + (ROW_H - 9) / 2 }}
      />
      <PixiPureTextInput
        value={searchTypStr}
        onChange={setSearchTypStr}
        placeholder="EF"
        width={INPUT_W}
        height={22}
        fontSize={11}
        font="mono"
        layout={{ position: 'absolute', left: PAD + LABEL_W, top: row1Y + (ROW_H - 22) / 2 }}
      />
      <pixiBitmapText
        text="PARAM:"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: PAD + LABEL_W + INPUT_W + GAP, top: row1Y + (ROW_H - 9) / 2 }}
      />
      <PixiPureTextInput
        value={searchEffStr}
        onChange={setSearchEffStr}
        placeholder="any"
        width={INPUT_W}
        height={22}
        fontSize={11}
        font="mono"
        layout={{ position: 'absolute', left: PAD + LABEL_W + INPUT_W + GAP + 44, top: row1Y + (ROW_H - 22) / 2 }}
      />

      {/* Row 2: Replace */}
      <pixiBitmapText
        text="REPL:"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: PAD, top: row2Y + (ROW_H - 9) / 2 }}
      />
      <PixiPureTextInput
        value={replaceTypStr}
        onChange={setReplaceTypStr}
        placeholder="EF"
        width={INPUT_W}
        height={22}
        fontSize={11}
        font="mono"
        layout={{ position: 'absolute', left: PAD + LABEL_W, top: row2Y + (ROW_H - 22) / 2 }}
      />
      <pixiBitmapText
        text="PARAM:"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: PAD + LABEL_W + INPUT_W + GAP, top: row2Y + (ROW_H - 9) / 2 }}
      />
      <PixiPureTextInput
        value={replaceEffStr}
        onChange={setReplaceEffStr}
        placeholder="--"
        width={INPUT_W}
        height={22}
        fontSize={11}
        font="mono"
        layout={{ position: 'absolute', left: PAD + LABEL_W + INPUT_W + GAP + 44, top: row2Y + (ROW_H - 22) / 2 }}
      />

      {/* Row 3: Scope */}
      <pixiBitmapText
        text="SCOPE:"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: PAD, top: row3Y + (ROW_H - 9) / 2 }}
      />
      <pixiContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={() => setScope('current')}
        layout={{ position: 'absolute', left: PAD + LABEL_W, top: row3Y + (ROW_H - 20) / 2, width: 100, height: 20 }}
      >
        <pixiGraphics draw={drawScopeCurrent} layout={{ position: 'absolute', width: 100, height: 20 }} />
        <pixiBitmapText
          text="Cur.Pattern"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={scope === 'current' ? theme.accent.color : theme.textSecondary.color}
          layout={{ position: 'absolute', left: 6, top: 5 }}
        />
      </pixiContainer>
      <pixiContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={() => setScope('all')}
        layout={{ position: 'absolute', left: PAD + LABEL_W + 106, top: row3Y + (ROW_H - 20) / 2, width: 90, height: 20 }}
      >
        <pixiGraphics draw={drawScopeAll} layout={{ position: 'absolute', width: 100, height: 20 }} />
        <pixiBitmapText
          text="All Patterns"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={scope === 'all' ? theme.accent.color : theme.textSecondary.color}
          layout={{ position: 'absolute', left: 6, top: 5 }}
        />
      </pixiContainer>

      {/* Footer: status + buttons */}
      {statusText !== '' && (
        <pixiBitmapText
          text={statusText}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={lastReplaced !== null ? theme.success.color : theme.accentSecondary.color}
          layout={{ position: 'absolute', left: PAD, top: footerY + (24 - 9) / 2 }}
        />
      )}
      <PixiButton
        label="Find All"
        variant="ghost"
        size="sm"
        onClick={handleFindAll}
        layout={{ position: 'absolute', right: 4 + 60 + 4 + 60 + 4, top: footerY }}
      />
      <PixiButton
        label="Replace All"
        variant="ft2"
        color="blue"
        size="sm"
        onClick={handleReplaceAll}
        layout={{ position: 'absolute', right: 4 + 60 + 4, top: footerY }}
      />
      <PixiButton
        label="Close"
        variant="ghost"
        size="sm"
        onClick={onClose}
        layout={{ position: 'absolute', right: 4, top: footerY }}
      />
    </pixiContainer>
  );
};
