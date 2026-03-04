/**
 * SIDSTILTab — Enhanced STIL (SID Tune Information List) display
 * with per-subtune switching and formatted field display.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { fetchFileInfoByPath } from '@/lib/sid/composerApi';
import type { STILEntry, STILSubsongInfo } from '@/lib/sid/STILParser';
import { parseSTIL, lookupSTIL } from '@/lib/sid/STILParser';
import { PixiButton, PixiLabel, PixiScrollView } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';

interface SIDSTILTabProps {
  width: number;
  height: number;
  hvscPath: string | null;
  currentSubsong: number;
  totalSubsongs: number;
}

const PAD = 16;

/** Single STIL field row */
const STILField: React.FC<{
  label: string;
  value: string;
  labelColor: number;
  valueColor: number;
}> = ({ label, value, labelColor, valueColor }) => (
  <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
    <pixiBitmapText
      text={`${label}:`}
      style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
      tint={labelColor}
      layout={{ width: 80 }}
    />
    <pixiBitmapText
      text={value}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
      tint={valueColor}
      layout={{ flex: 1 }}
    />
  </layoutContainer>
);

export const SIDSTILTab: React.FC<SIDSTILTabProps> = ({
  width,
  height,
  hvscPath,
  currentSubsong,
  totalSubsongs,
}) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;

  const [stilEntry, setStilEntry] = useState<STILEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewSubsong, setViewSubsong] = useState(currentSubsong);

  // Sync viewed subtune with playback
  useEffect(() => {
    setViewSubsong(currentSubsong);
  }, [currentSubsong]);

  // Fetch STIL data
  useEffect(() => {
    if (!hvscPath) return;
    setLoading(true);
    setError(null);

    fetch(`/api/deepsid/stil?path=${encodeURIComponent(hvscPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error('STIL not available');
        return res.text();
      })
      .then((text) => {
        const entries = parseSTIL(text);
        const normalizedPath = hvscPath.startsWith('/') ? hvscPath : '/' + hvscPath;
        setStilEntry(entries.get(normalizedPath) ?? null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load STIL');
        setStilEntry(null);
      })
      .finally(() => setLoading(false));
  }, [hvscPath]);

  const handlePrev = useCallback(() => {
    setViewSubsong((v) => Math.max(0, v - 1));
  }, []);

  const handleNext = useCallback(() => {
    setViewSubsong((v) => Math.min(totalSubsongs - 1, v + 1));
  }, [totalSubsongs]);

  // Resolve STIL info for current viewed subtune
  const info: STILSubsongInfo | null = stilEntry
    ? lookupSTIL(
        new Map([[stilEntry.filepath, stilEntry]]),
        stilEntry.filepath,
        viewSubsong + 1 // lookupSTIL uses 1-based
      )
    : null;

  const hasSubsongs = totalSubsongs > 1;
  const hasLyrics =
    info?.comment?.some((c) => c.toLowerCase().includes('lyrics:') || c.toLowerCase().includes('lyric:')) ?? false;
  const lyrics = hasLyrics
    ? info!.comment!.filter((c) => c.toLowerCase().startsWith('lyrics:') || c.toLowerCase().startsWith('lyric:'))
    : [];
  const comments = info?.comment?.filter(
    (c) => !c.toLowerCase().startsWith('lyrics:') && !c.toLowerCase().startsWith('lyric:')
  ) ?? [];

  // Content height estimate
  const fieldCount = [info?.title, info?.author, info?.artist, info?.name, info?.year].filter(Boolean).length;
  const contentH = 40 + fieldCount * 24 + comments.length * 20 + (hasLyrics ? lyrics.length * 18 + 32 : 0) + 60;

  if (loading) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="Loading STIL data..." size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  if (error || !stilEntry || !info) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="No STIL info available for this tune" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  return (
    <layoutContainer layout={{ width, height, flexDirection: 'column' }}>
      {/* Subtune nav */}
      {hasSubsongs && (
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            borderBottomWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <PixiLabel text="Subtune:" size="xs" color="textMuted" />
          <PixiButton icon="prev" label="" variant="ghost" size="sm" onClick={handlePrev} />
          <PixiLabel
            text={`${viewSubsong + 1} / ${totalSubsongs}`}
            size="xs"
            weight="semibold"
            font="mono"
            color="text"
          />
          <PixiButton icon="next" label="" variant="ghost" size="sm" onClick={handleNext} />
        </layoutContainer>
      )}

      {/* STIL content */}
      <PixiScrollView width={width} height={height - (hasSubsongs ? 36 : 0)} contentHeight={contentH}>
        <layoutContainer layout={{ flexDirection: 'column', gap: 8, padding: PAD, width: contentW }}>
          {info.title && <STILField label="TITLE" value={info.title} labelColor={0x93c5fd} valueColor={theme.text.color} />}
          {info.author && <STILField label="AUTHOR" value={info.author} labelColor={0x93c5fd} valueColor={theme.text.color} />}
          {info.artist && <STILField label="ARTIST" value={info.artist} labelColor={0x93c5fd} valueColor={theme.text.color} />}
          {info.name && <STILField label="NAME" value={info.name} labelColor={0x93c5fd} valueColor={theme.text.color} />}
          {info.year && <STILField label="YEAR" value={info.year} labelColor={0x93c5fd} valueColor={theme.text.color} />}

          {/* Comments */}
          {comments.length > 0 && (
            <layoutContainer layout={{ flexDirection: 'column', gap: 4, marginTop: 8 }}>
              <PixiLabel text="COMMENT" size="xs" weight="semibold" color="textSecondary" />
              {comments.map((c, i) => (
                <pixiBitmapText
                  key={i}
                  text={c}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ width: contentW - 8 }}
                />
              ))}
            </layoutContainer>
          )}

          {/* Lyrics section */}
          {hasLyrics && (
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 4,
                marginTop: 12,
                borderTopWidth: 1,
                borderColor: theme.border.color,
                paddingTop: 12,
              }}
            >
              <PixiLabel text="Lyrics" size="xs" weight="semibold" color="textSecondary" />
              {lyrics.map((l, i) => (
                <pixiBitmapText
                  key={i}
                  text={l.replace(/^lyrics:\s*/i, '')}
                  style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                  tint={theme.text.color}
                  layout={{ width: contentW - 8 }}
                />
              ))}
            </layoutContainer>
          )}
        </layoutContainer>
      </PixiScrollView>
    </layoutContainer>
  );
};
