/**
 * SIDCSDbTab — CSDb (Commodore Scene Database) integration.
 * Shows releases, group memberships, and external links for the composer.
 */

import React, { useEffect, useState } from 'react';
import { PixiLabel, PixiButton, PixiScrollView } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { tintBg } from '../../colors';

interface SIDCSDbTabProps {
  width: number;
  height: number;
  csdbId: number | null;
  composerName: string | null;
}

interface CSDbRelease {
  id: number;
  name: string;
  type: string;
  year?: string;
  event?: string;
}

interface CSDbGroup {
  id: number;
  name: string;
}

interface CSDbScener {
  handle: string;
  groups: CSDbGroup[];
  releases: CSDbRelease[];
}

const PAD = 16;

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

export const SIDCSDbTab: React.FC<SIDCSDbTabProps> = ({ width, height, csdbId, composerName }) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;

  const [scener, setScener] = useState<CSDbScener | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!csdbId) return;
    setLoading(true);
    setError(null);

    fetch(`https://csdb.dk/webservice/?type=scener&id=${csdbId}&output=json`)
      .then((res) => {
        if (!res.ok) throw new Error('CSDb API error');
        return res.json();
      })
      .then((data) => {
        const entry = data?.Scener;
        if (!entry) throw new Error('No scener data');

        const groups: CSDbGroup[] = (entry.UsedHandle?.[0]?.Group || []).map(
          (g: { ID: string; Name: string }) => ({ id: Number(g.ID), name: g.Name })
        );

        const releases: CSDbRelease[] = (entry.Release || []).map(
          (r: { ID: string; Name: string; Type: string; ReleaseYear?: string; ReleasedAt?: string }) => ({
            id: Number(r.ID),
            name: r.Name,
            type: r.Type || 'Unknown',
            year: r.ReleaseYear,
            event: r.ReleasedAt,
          })
        );

        setScener({
          handle: entry.Handle || composerName || 'Unknown',
          groups,
          releases: releases.slice(0, 50), // cap at 50
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load CSDb data');
        setScener(null);
      })
      .finally(() => setLoading(false));
  }, [csdbId, composerName]);

  if (!csdbId) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center', gap: 8, flexDirection: 'column' }}>
        <PixiLabel text="No CSDb ID linked for this composer" size="sm" color="textMuted" />
        {composerName && (
          <PixiLabel text={`Search CSDb manually for "${composerName}"`} size="xs" color="textMuted" />
        )}
      </layoutContainer>
    );
  }

  if (loading) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="Loading CSDb profile..." size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  if (error || !scener) {
    return (
      <layoutContainer layout={{ width, height, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <PixiLabel text="Failed to load CSDb data" size="sm" color="textMuted" />
        <PixiButton
          label="Open in Browser"
          variant="ghost"
          size="sm"
          onClick={() => window.open(`https://csdb.dk/scener/?id=${csdbId}`, '_blank')}
        />
      </layoutContainer>
    );
  }

  const releaseH = scener.releases.length * 22 + 40;
  const groupsH = scener.groups.length > 0 ? 40 : 0;
  const contentH = 60 + groupsH + releaseH + 40;

  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* Profile link header */}
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
        <PixiLabel text={`CSDb: ${scener.handle}`} size="xs" weight="semibold" color="text" />
        <PixiButton
          label="Open in Browser"
          variant="ghost"
          size="sm"
          onClick={() => window.open(`https://csdb.dk/scener/?id=${csdbId}`, '_blank')}
        />
      </layoutContainer>

      <PixiScrollView width={width} height={height - 36} contentHeight={contentH}>
        <layoutContainer layout={{ flexDirection: 'column', gap: 12, padding: PAD, width: contentW }}>
          {/* Groups */}
          {scener.groups.length > 0 && (
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 4,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: tintBg(theme.accent.color),
                borderColor: theme.accent.color,
              }}
            >
              <PixiLabel text="Groups" size="xs" weight="semibold" color="textSecondary" />
              <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {scener.groups.map((g) => (
                  <LinkRow
                    key={g.id}
                    text={g.name}
                    url={`https://csdb.dk/group/?id=${g.id}`}
                    tint={theme.accentHighlight.color}
                  />
                ))}
              </layoutContainer>
            </layoutContainer>
          )}

          {/* Releases */}
          {scener.releases.length > 0 && (
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 6,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
              }}
            >
              <PixiLabel text="Releases" size="xs" weight="semibold" color="textSecondary" />
              {scener.releases.map((r) => (
                <layoutContainer
                  key={r.id}
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => window.open(`https://csdb.dk/release/?id=${r.id}`, '_blank')}
                  layout={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingTop: 2,
                    paddingBottom: 2,
                    borderBottomWidth: 1,
                    borderColor: theme.border.color,
                  }}
                >
                  <pixiBitmapText
                    text={r.name}
                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
                    tint={theme.accentHighlight.color}
                    layout={{ flex: 1 }}
                  />
                  <pixiBitmapText
                    text={r.type}
                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{}}
                  />
                  {r.year && (
                    <pixiBitmapText
                      text={r.year}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
                      tint={theme.textMuted.color}
                      layout={{ width: 36 }}
                    />
                  )}
                  {r.event && (
                    <pixiBitmapText
                      text={r.event}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
                      tint={theme.accentHighlight.color}
                      alpha={0.7}
                      layout={{}}
                    />
                  )}
                </layoutContainer>
              ))}
            </layoutContainer>
          )}
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};
