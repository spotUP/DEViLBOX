/**
 * PixiModuleInfoModal — GL-native module file info dialog.
 * Shows metadata from SongDB (audacious-uade-tools), Modland, import metadata,
 * and project metadata for any loaded tracker module (MOD, XM, IT, S3M, etc.).
 */

import React, { useMemo } from 'react';
import { useTrackerStore } from '@stores';
import { useProjectStore } from '@stores/useProjectStore';
import { useModlandResultStore } from '@stores/useModlandResultStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useShallow } from 'zustand/react/shallow';
import { PixiModal, PixiLabel, PixiScrollView, PixiIcon } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ── Row component ────────────────────────────────────────────────────────────

const InfoRow: React.FC<{
  label: string;
  value: string | number | undefined | null;
  color?: number;
}> = ({ label, value, color }) => {
  const theme = usePixiTheme();
  if (value == null || value === '' || value === 'Unknown') return null;
  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 8, paddingTop: 2, paddingBottom: 2 }}>
      <PixiLabel
        text={label}
        style={{ ...PIXI_FONTS.tiny, fill: theme.textSecondary }}
        layout={{ width: 110, flexShrink: 0 }}
      />
      <PixiLabel
        text={String(value)}
        style={{ ...PIXI_FONTS.tiny, fill: color ?? theme.textPrimary }}
        layout={{ flex: 1 }}
      />
    </pixiContainer>
  );
};

// ── Section header ───────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: string; title: string }> = ({ icon, title }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
      <PixiIcon name={icon} size={12} color={theme.accent} />
      <PixiLabel
        text={title}
        style={{ ...PIXI_FONTS.smallBold, fill: theme.accent }}
      />
    </pixiContainer>
  );
};

// ── Main modal ───────────────────────────────────────────────────────────────

export const PixiModuleInfoModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  const { songDBInfo, sidMetadata, patterns } = useTrackerStore(
    useShallow((s) => ({
      songDBInfo: s.songDBInfo,
      sidMetadata: s.sidMetadata,
      patterns: s.patterns,
    }))
  );

  const metadata = useProjectStore((s) => s.metadata);
  const modlandResult = useModlandResultStore((s) => s.lastResult);
  const instruments = useInstrumentStore((s) => s.instruments);

  // Extract import metadata from first pattern
  const importMeta = patterns[0]?.importMetadata;
  const modData = importMeta?.modData;

  // Gather all info
  const info = useMemo(() => {
    const format = importMeta?.sourceFormat ?? songDBInfo?.format ?? '—';
    const moduleType = modData?.moduleType ?? '';
    const songMessage = modData?.songMessage ?? '';
    const channelCount = patterns[0]?.channels.length ?? 0;
    const patternCount = patterns.length;
    const instrumentCount = instruments.length;
    const sampleCount = instruments.filter(
      (i) => i.synthType === 'Sampler' && i.sample?.audioBuffer
    ).length;

    // SongDB data
    const authors = songDBInfo?.authors?.filter(Boolean) ?? [];
    const publishers = songDBInfo?.publishers?.filter(Boolean) ?? [];
    const album = songDBInfo?.album ?? '';
    const year = songDBInfo?.year ?? '';
    const duration = songDBInfo?.duration_ms ?? 0;

    // Modland data
    const modlandArtist = modlandResult?.metadata?.artist ?? '';
    const modlandFormat = modlandResult?.metadata?.format ?? '';
    const modlandTitle = modlandResult?.metadata?.title ?? '';

    // Playback
    const speed = modData?.initialSpeed ?? 6;
    const bpm = modData?.initialBPM ?? 125;
    const amigaPeriods = modData?.amigaPeriods;

    return {
      name: metadata.name,
      format,
      moduleType,
      songMessage,
      channelCount,
      patternCount,
      instrumentCount,
      sampleCount,
      authors,
      publishers,
      album,
      year,
      duration,
      modlandArtist,
      modlandFormat,
      modlandTitle,
      speed,
      bpm,
      amigaPeriods,
      sourceFile: importMeta?.sourceFile ?? '',
    };
  }, [songDBInfo, patterns, instruments, modlandResult, importMeta, modData, metadata.name]);

  if (!isOpen) return null;

  // Don't show for SID files (they have their own modal)
  if (sidMetadata) return null;

  const hasModland = !!(info.modlandArtist || info.modlandFormat || info.modlandTitle);
  const hasSongDB = !!(info.album || info.year || info.authors.length || info.publishers.length);

  return (
    <PixiModal isOpen={isOpen} onClose={onClose} title="Module Info" width={480} height={520}>
      <PixiScrollView
        layout={{
          flex: 1,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        {/* ── Module ─────────────────────────────────────────────── */}
        <SectionHeader icon="diskio" title="Module" />
        <InfoRow label="Title" value={info.name} />
        <InfoRow label="Format" value={info.moduleType ? `${info.format} (${info.moduleType})` : info.format} />
        <InfoRow label="File" value={info.sourceFile} />
        <InfoRow label="Duration" value={info.duration > 0 ? formatDuration(info.duration) : undefined} />

        {/* ── SongDB metadata ────────────────────────────────────── */}
        {hasSongDB && (
          <>
            <SectionHeader icon="preset-a" title="Database" />
            {info.authors.length > 0 && (
              <InfoRow label="Author(s)" value={info.authors.join(', ')} color={theme.accent} />
            )}
            {info.publishers.length > 0 && (
              <InfoRow label="Group" value={info.publishers.join(', ')} />
            )}
            <InfoRow label="Album" value={info.album} />
            <InfoRow label="Year" value={info.year} />
          </>
        )}

        {/* ── Modland ────────────────────────────────────────────── */}
        {hasModland && (
          <>
            <SectionHeader icon="thunderbolt" title="Modland" />
            <InfoRow label="Artist" value={info.modlandArtist} color={theme.accent} />
            <InfoRow label="Title" value={info.modlandTitle} />
            <InfoRow label="Format" value={info.modlandFormat} />
          </>
        )}

        {/* ── Technical ──────────────────────────────────────────── */}
        <SectionHeader icon="cog" title="Technical" />
        <InfoRow label="Channels" value={info.channelCount > 0 ? String(info.channelCount) : undefined} />
        <InfoRow label="Patterns" value={String(info.patternCount)} />
        <InfoRow label="Instruments" value={String(info.instrumentCount)} />
        {info.sampleCount > 0 && <InfoRow label="Samples" value={String(info.sampleCount)} />}
        <InfoRow label="Speed" value={String(info.speed)} />
        <InfoRow label="BPM" value={String(info.bpm)} />
        {info.amigaPeriods !== undefined && (
          <InfoRow label="Freq. Table" value={info.amigaPeriods ? 'Amiga Periods' : 'Linear'} />
        )}

        {/* ── Song Message ───────────────────────────────────────── */}
        {info.songMessage && (
          <>
            <SectionHeader icon="copy" title="Song Message" />
            <pixiContainer
              layout={{
                paddingLeft: 4,
                paddingRight: 4,
                paddingTop: 4,
                paddingBottom: 4,
              }}
            >
              <PixiLabel
                text={info.songMessage}
                style={{
                  ...PIXI_FONTS.tiny,
                  fill: theme.textSecondary,
                  wordWrap: true,
                  wordWrapWidth: 420,
                }}
              />
            </pixiContainer>
          </>
        )}
      </PixiScrollView>
    </PixiModal>
  );
};
