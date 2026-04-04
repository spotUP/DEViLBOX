/**
 * SIDPlayerTab — Shows which SID player/editor was used to create the tune.
 * Fetches player metadata from the DeepSID API.
 */

import React, { useEffect, useState } from 'react';
import { PixiLabel, PixiScrollView } from '../../components';
import { usePixiTheme } from '../../theme';
import { PIXI_FONTS } from '../../fonts';
import { tintBg } from '../../colors';

interface SIDPlayerTabProps {
  width: number;
  height: number;
  playerName: string | null;
}

interface PlayerData {
  id: number;
  title: string;
  search: string;
  description: string;
  developer: string;
  startyear: number | null;
  endyear: number | null;
}

const PAD = 16;

const API_URL = import.meta.env.VITE_API_URL || 'https://devilbox.uprough.net/api';

/** Key-value info row */
const InfoRow: React.FC<{
  label: string;
  value: string;
  labelColor: number;
  valueColor: number;
}> = ({ label, value, labelColor, valueColor }) => (
  <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
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

export const SIDPlayerTab: React.FC<SIDPlayerTabProps> = ({ width, height, playerName }) => {
  const theme = usePixiTheme();
  const contentW = width - PAD * 2;

  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerName) return;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/deepsid/player/${encodeURIComponent(playerName)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Player info not available');
        return res.json();
      })
      .then((data: PlayerData) => setPlayer(data))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load player info');
        setPlayer(null);
      })
      .finally(() => setLoading(false));
  }, [playerName]);

  if (!playerName) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="No player information available" size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  if (loading) {
    return (
      <layoutContainer layout={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <PixiLabel text="Loading player info..." size="sm" color="textMuted" />
      </layoutContainer>
    );
  }

  if (error || !player) {
    return (
      <layoutContainer layout={{ width, height, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <PixiLabel text={`Unknown player: ${playerName}`} size="sm" color="textMuted" />
        {error && <PixiLabel text={error} size="xs" color="error" />}
      </layoutContainer>
    );
  }

  const yearRange = player.startyear
    ? `${player.startyear}${player.endyear ? ` — ${player.endyear}` : ' — present'}`
    : null;

  // Estimate content height for scroll
  const descLines = Math.ceil((player.description?.length ?? 0) / 60);
  const contentH = 100 + descLines * 18 + 60;

  return (
    <PixiScrollView width={width} height={height} contentHeight={contentH}>
      <layoutContainer layout={{ flexDirection: 'column', gap: 12, padding: PAD, width: contentW }}>
        {/* Player header */}
        <layoutContainer
          layout={{
            flexDirection: 'column',
            gap: 6,
            padding: 16,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: tintBg(theme.accent.color),
            borderColor: theme.accent.color,
          }}
        >
          <pixiBitmapText
            text={player.title || playerName}
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
            tint={theme.text.color}
            layout={{}}
          />

          {player.developer && (
            <InfoRow label="Developer" value={player.developer} labelColor={theme.accentHighlight.color} valueColor={theme.text.color} />
          )}

          {yearRange && (
            <InfoRow label="Active" value={yearRange} labelColor={theme.accentHighlight.color} valueColor={theme.text.color} />
          )}
        </layoutContainer>

        {/* Description */}
        {player.description && (
          <layoutContainer
            layout={{
              flexDirection: 'column',
              gap: 6,
              padding: 16,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: theme.bg.color,
              borderColor: theme.border.color,
            }}
          >
            <PixiLabel text="Description" size="xs" weight="semibold" color="textSecondary" />
            <pixiBitmapText
              text={player.description}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{ width: contentW - 40 }}
            />
          </layoutContainer>
        )}
      </layoutContainer>
    </PixiScrollView>
  );
};
