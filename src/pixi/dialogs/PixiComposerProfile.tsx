/**
 * PixiComposerProfile — GL-native C64 SID composer profile panel.
 * Pixel-perfect match to DOM: src/components/dialogs/ComposerProfile.tsx
 *
 * This is a sub-panel (not a standalone modal), rendered within other dialogs
 * such as PixiSIDInfoModal.
 *
 * DOM structure:
 *   space-y-3 → flexDirection column, gap 12
 *   profile card: bg-blue-950/30 border-blue-800/40 rounded-lg p-3 → 0x0a1929, 0x1e3a5a, 12
 *   photo: w-20 h-20 → 80×80
 *   stats row: text-xs → fontSize 10/12
 *   players section: bg-dark-bgSecondary/50 border-dark-border/50 p-2.5 → 10 padding
 *   tags: px-1.5 py-0.5 text-[10px] → 6/2 padding, 10px font
 */

import React from 'react';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import type { ComposerProfile as ComposerData } from '@/lib/sid/composerApi';

interface PixiComposerProfileProps {
  composer: ComposerData;
  /** Available width for layout */
  width?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Genre tag pill: bg-purple-900/30 text-purple-300/80 border-purple-800/30 */
const GenreTag: React.FC<{ name: string }> = ({ name }) => (
  <layoutContainer
    layout={{
      paddingLeft: 6, paddingRight: 6,
      paddingTop: 2, paddingBottom: 2,
      backgroundColor: 0x2d1a4e,
      borderWidth: 1,
      borderColor: 0x4a2d7a,
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    }}
  >
    <pixiBitmapText
      text="♦"
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
      tint={0xc084fc}
      layout={{}}
    />
    <pixiBitmapText
      text={name}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
      tint={0xc084fc}
      layout={{}}
    />
  </layoutContainer>
);

/** Production tag pill: bg-green-900/30 text-green-300/80 border-green-800/30 */
const ProdTag: React.FC<{ name: string }> = ({ name }) => (
  <layoutContainer
    layout={{
      paddingLeft: 6, paddingRight: 6,
      paddingTop: 2, paddingBottom: 2,
      backgroundColor: 0x14332a,
      borderWidth: 1,
      borderColor: 0x2d6a4f,
      borderRadius: 4,
    }}
  >
    <pixiBitmapText
      text={name}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
      tint={0x86efac}
      layout={{}}
    />
  </layoutContainer>
);

export const PixiComposerProfile: React.FC<PixiComposerProfileProps> = ({ composer, width = 360 }) => {
  const theme = usePixiTheme();

  const birthYear = composer.born ? parseInt(composer.born.slice(0, 4)) : null;
  const deathYear = composer.died ? parseInt(composer.died.slice(0, 4)) : null;
  const currentAge = birthYear && !deathYear
    ? new Date().getFullYear() - birthYear
    : null;
  const deathAge = birthYear && deathYear ? deathYear - birthYear : null;

  const genreTags = composer.tags.filter(t => t.type === 'GENRE');
  const prodTags = composer.tags.filter(t => t.type === 'PRODUCTION');

  const dateStr = [
    birthYear ? `b. ${birthYear}` : '',
    deathYear ? ` — d. ${deathYear}` : '',
    currentAge ? ` (age ${currentAge})` : '',
    deathAge ? ` (age ${deathAge})` : '',
  ].join('');

  return (
    <layoutContainer layout={{ flexDirection: 'column', gap: 12, width }}>

      {/* ── Profile card ── */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          gap: 12,
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          backgroundColor: 0x0a1929,
          borderColor: 0x1e3a5a,
        }}
      >
        {/* Photo placeholder (80×80) — no image in GL, show icon */}
        <layoutContainer
          layout={{
            width: 80,
            height: 80,
            borderRadius: 4,
            backgroundColor: 0x0d2340,
            borderWidth: 1,
            borderColor: 0x1a3050,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <pixiBitmapText
            text="♫"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 30, fill: 0xffffff }}
            tint={0x1e3a5a}
            layout={{}}
          />
        </layoutContainer>

        {/* Info */}
        <layoutContainer layout={{ flex: 1, flexDirection: 'column', gap: 4 }}>
          {/* Name */}
          <pixiBitmapText
            text={composer.name}
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
            tint={0xbfdbfe}
            layout={{}}
          />

          {/* Handles */}
          {composer.handles.length > 0 && (
            <pixiBitmapText
              text={`aka ${composer.handles.join(', ')}`}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
              tint={0x6b8db5}
              layout={{}}
            />
          )}

          {/* Country */}
          {composer.country && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <pixiBitmapText
                text="🌐"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                layout={{}}
              />
              <pixiBitmapText
                text={composer.country}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                tint={0x5a7fa0}
                layout={{}}
              />
            </layoutContainer>
          )}

          {/* Birth/Death */}
          {dateStr && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <pixiBitmapText
                text="📅"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                layout={{}}
              />
              <pixiBitmapText
                text={dateStr}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                tint={0x5a7fa0}
                layout={{}}
              />
            </layoutContainer>
          )}

          {/* Notable */}
          {composer.notable && (
            <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <pixiBitmapText
                text="★"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                tint={0xfbbf24}
                layout={{}}
              />
              <pixiBitmapText
                text={composer.notable}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                tint={0xe2b940}
                layout={{}}
              />
            </layoutContainer>
          )}
        </layoutContainer>
      </layoutContainer>

      {/* ── Stats row ── text-xs px-1 */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingLeft: 4, paddingRight: 4 }}>
        {/* Tune count */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <pixiBitmapText
            text="♪"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
            tint={0x5a8abf}
            layout={{}}
          />
          <pixiBitmapText
            text={`${composer.tuneCount} tune${composer.tuneCount !== 1 ? 's' : ''}`}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </layoutContainer>

        {/* Active years */}
        {composer.activeYears.length > 0 && (
          <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <pixiBitmapText
              text="📅"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={0x5a8abf}
              layout={{}}
            />
            <pixiBitmapText
              text={`${composer.activeYears[0]}–${composer.activeYears[composer.activeYears.length - 1]}`}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
        )}

        {/* CSDb link (text-only, no navigation in GL) */}
        {composer.csdbId && (
          <pixiBitmapText
            text="CSDb ↗"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={0x5a8abf}
            layout={{ marginLeft: 'auto' }}
          />
        )}
      </layoutContainer>

      {/* ── Players Used ── */}
      {composer.players.length > 0 && (
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 6,
            padding: 10,
            borderRadius: 6,
            borderWidth: 1,
            backgroundColor: theme.bgSecondary.color,
            borderColor: theme.border.color,
          }}
        >
          {/* Section header */}
          <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <pixiBitmapText
              text="♪"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <pixiBitmapText
              text="Players Used"
              style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>

          {/* Player rows */}
          {composer.players.slice(0, 8).map((p) => {
            const barW = Math.max(8, (p.cnt / composer.players[0].cnt) * 80);
            return (
              <layoutContainer
                key={p.player}
                layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <pixiBitmapText
                  text={p.player}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ flex: 1 }}
                />
                <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <layoutContainer
                    layout={{
                      width: barW,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: 0x3b82f6,
                    }}
                  />
                  <pixiBitmapText
                    text={String(p.cnt)}
                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{ width: 24, textAlign: 'right' }}
                  />
                </layoutContainer>
              </layoutContainer>
            );
          })}
        </layoutContainer>
      )}

      {/* ── Tags ── */}
      {(genreTags.length > 0 || prodTags.length > 0) && (
        <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingLeft: 4, paddingRight: 4 }}>
          {genreTags.map(t => <GenreTag key={t.name} name={t.name} />)}
          {prodTags.map(t => <ProdTag key={t.name} name={t.name} />)}
        </layoutContainer>
      )}

      {/* ── Employment / Career ── */}
      {composer.employment.length > 0 && (
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 4,
            padding: 10,
            borderRadius: 6,
            borderWidth: 1,
            backgroundColor: theme.bgSecondary.color,
            borderColor: theme.border.color,
          }}
        >
          <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <pixiBitmapText
              text="💼"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              layout={{}}
            />
            <pixiBitmapText
              text="Career"
              style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
          {composer.employment.map((e, i) => (
            <layoutContainer
              key={i}
              layout={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <pixiBitmapText
                text={e.company}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ flex: 1 }}
              />
              <pixiBitmapText
                text={e.years}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                tint={theme.textMuted.color}
                layout={{}}
              />
            </layoutContainer>
          ))}
        </layoutContainer>
      )}

      {/* ── Links (text-only, no navigation in GL) ── */}
      {composer.links.length > 0 && (
        <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 4, paddingRight: 4 }}>
          {composer.links.map((link, i) => (
            <layoutContainer
              key={i}
              layout={{
                paddingLeft: 8, paddingRight: 8,
                paddingTop: 2, paddingBottom: 2,
                backgroundColor: 0x0a1929,
                borderWidth: 1,
                borderColor: 0x1e3a5a,
                borderRadius: 4,
                flexDirection: 'row',
                gap: 4,
                alignItems: 'center',
              }}
            >
              <pixiBitmapText
                text="↗"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
                tint={0x5a8abf}
                layout={{}}
              />
              <pixiBitmapText
                text={link.name}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                tint={0x5a8abf}
                layout={{}}
              />
            </layoutContainer>
          ))}
        </layoutContainer>
      )}
    </layoutContainer>
  );
};
