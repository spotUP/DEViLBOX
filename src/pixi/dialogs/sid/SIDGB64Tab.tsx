/**
 * SIDGB64Tab — GameBase64 cross-reference tab.
 * Shows links to search for C64 games that used the current SID tune/composer.
 */

import React from 'react';
import { PixiButton, PixiLabel, PixiScrollView } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

interface SIDGB64TabProps {
  width: number;
  height: number;
  composerName: string | null;
  tuneName: string | null;
}

const PAD = 16;

function tintBg(color: number, factor = 0.15): number {
  return (((color >> 16 & 0xff) * factor | 0) << 16) | (((color >> 8 & 0xff) * factor | 0) << 8) | ((color & 0xff) * factor | 0);
}

/** Clickable link row */
const LinkRow: React.FC<{
  text: string;
  url: string;
  tint: number;
  fontSize?: number;
}> = ({ text, url, tint, fontSize = 13 }) => (
  <layoutContainer
    eventMode="static"
    cursor="pointer"
    onPointerUp={() => window.open(url, '_blank')}
    layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
  >
    <pixiBitmapText
      text={text}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize, fill: 0xffffff }}
      tint={tint}
      layout={{}}
    />
    <pixiBitmapText
      text=">"
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
      tint={tint}
      alpha={0.5}
      layout={{}}
    />
  </layoutContainer>
);

export const SIDGB64Tab: React.FC<SIDGB64TabProps> = ({ width, height, composerName, tuneName }) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;

  const gb64SearchUrl = composerName
    ? `https://gb64.com/search.php?a=3&f=1&id=&d=&n=${encodeURIComponent(composerName)}&e=&es=&rs=&re=&b=`
    : null;

  const gb64TuneSearchUrl = tuneName
    ? `https://gb64.com/search.php?a=3&f=1&id=&d=${encodeURIComponent(tuneName)}&n=&e=&es=&rs=&re=&b=`
    : null;

  if (!composerName && !tuneName) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
        <PixiLabel text="No composer or tune info available" size="sm" color="textMuted" />
        <PixiButton
          label="Open GameBase64"
          variant="ghost"
          size="sm"
          onClick={() => window.open('https://gb64.com/', '_blank')}
        />
      </layoutContainer>
    );
  }

  const contentH = 280;

  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* Header */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 8,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <PixiLabel text="GameBase64 - C64 Game Database" size="xs" weight="semibold" color="text" />
      </layoutContainer>

      <PixiScrollView width={width} height={height - 36} contentHeight={contentH}>
        <layoutContainer layout={{ flexDirection: 'column', gap: 16, padding: PAD, width: contentW }}>
          {/* Composer search */}
          {composerName && (
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 8,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: tintBg(theme.accent.color),
                borderColor: theme.accent.color,
              }}
            >
              <pixiBitmapText
                text="Search for games by this composer on GB64:"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{ width: contentW - 24 }}
              />
              <PixiButton
                label={`Search "${composerName}" on GB64`}
                variant="primary"
                size="sm"
                onClick={() => gb64SearchUrl && window.open(gb64SearchUrl, '_blank')}
              />
            </layoutContainer>
          )}

          {/* Tune search */}
          {tuneName && (
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 8,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
              }}
            >
              <pixiBitmapText
                text="Search by tune name:"
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
                tint={theme.text.color}
                layout={{}}
              />
              <PixiButton
                label={`Search "${tuneName}" on GB64`}
                variant="ghost"
                size="sm"
                onClick={() => gb64TuneSearchUrl && window.open(gb64TuneSearchUrl, '_blank')}
              />
            </layoutContainer>
          )}

          {/* Quick links */}
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
            }}
          >
            <PixiLabel text="Quick Links" size="xs" weight="semibold" color="textSecondary" />
            <LinkRow
              text="GameBase64 Homepage"
              url="https://gb64.com/"
              tint={theme.accentHighlight.color}
            />
            <LinkRow
              text="C64 Music in Games Archive"
              url="https://gb64.com/search.php?a=5"
              tint={theme.accentHighlight.color}
            />
            <LinkRow
              text="GB64 Top Rated Games"
              url="https://gb64.com/search.php?a=4"
              tint={theme.accentHighlight.color}
            />
          </layoutContainer>
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};
