/**
 * SIDRemixTab — Remix64 / RKO (Remix.Kwed.Org) cross-reference tab.
 * Shows links to search for professional remixes of the current SID tune.
 */

import React from 'react';
import { PixiButton, PixiLabel, PixiScrollView } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

interface SIDRemixTabProps {
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

export const SIDRemixTab: React.FC<SIDRemixTabProps> = ({ width, height, composerName, tuneName }) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;

  const searchTerm = tuneName || composerName;
  const remix64Url = searchTerm
    ? `https://remix64.com/search/?q=${encodeURIComponent(searchTerm)}`
    : null;

  const rkoUrl = composerName
    ? `https://remix.kwed.org/?search_composer=${encodeURIComponent(composerName)}`
    : null;

  const rkoTuneUrl = tuneName
    ? `https://remix.kwed.org/?search_title=${encodeURIComponent(tuneName)}`
    : null;

  if (!composerName && !tuneName) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
        <PixiLabel text="No composer or tune info available" size="sm" color="textMuted" />
        <PixiButton
          label="Open Remix64"
          variant="ghost"
          size="sm"
          onClick={() => window.open('https://remix64.com/', '_blank')}
        />
      </layoutContainer>
    );
  }

  const contentH = 320;

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
        <PixiLabel text="Remix64 - SID Remixes" size="xs" weight="semibold" color="text" />
      </layoutContainer>

      <PixiScrollView width={width} height={height - 36} contentHeight={contentH}>
        <layoutContainer layout={{ flexDirection: 'column', gap: 16, padding: PAD, width: contentW }}>
          {/* Search on Remix64 */}
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
              text="Find remixes of this tune:"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{ width: contentW - 24 }}
            />
            {remix64Url && (
              <PixiButton
                label="Search on Remix64"
                variant="primary"
                size="sm"
                onClick={() => window.open(remix64Url, '_blank')}
              />
            )}
          </layoutContainer>

          {/* Search on RKO */}
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
              text="Search Remix.Kwed.Org:"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            {rkoUrl && (
              <PixiButton
                label={`Search composer "${composerName}" on RKO`}
                variant="ghost"
                size="sm"
                onClick={() => window.open(rkoUrl, '_blank')}
              />
            )}
            {rkoTuneUrl && tuneName && (
              <PixiButton
                label={`Search tune "${tuneName}" on RKO`}
                variant="ghost"
                size="sm"
                onClick={() => window.open(rkoTuneUrl, '_blank')}
              />
            )}
          </layoutContainer>

          {/* About section */}
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
            <PixiLabel text="About" size="xs" weight="semibold" color="textSecondary" />
            <pixiBitmapText
              text="Remix64 and Remix.Kwed.Org (RKO) catalog professional remixes and covers of classic C64/SID music by artists worldwide."
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{ width: contentW - 24 }}
            />

            {/* Quick links */}
            <PixiLabel text="Quick Links" size="xs" weight="semibold" color="textSecondary" />
            <LinkRow
              text="Remix64 Homepage"
              url="https://remix64.com/"
              tint={theme.accentHighlight.color}
            />
            <LinkRow
              text="Remix.Kwed.Org"
              url="https://remix.kwed.org/"
              tint={theme.accentHighlight.color}
            />
            <LinkRow
              text="HVSC (High Voltage SID Collection)"
              url="https://www.hvsc.c64.org/"
              tint={theme.accentHighlight.color}
            />
          </layoutContainer>
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};
