/**
 * ModuleInfoModal — DOM module file info dialog.
 * Shows metadata from SongDB (audacious-uade-tools), Modland, import metadata,
 * and project metadata for any loaded tracker module (MOD, XM, IT, S3M, etc.).
 */

import React, { useMemo } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useProjectStore } from '@stores/useProjectStore';
import { useModlandResultStore } from '@stores/useModlandResultStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Disc3, Database, Zap, Settings, MessageSquare } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const InfoRow: React.FC<{ label: string; value?: string | null; accent?: boolean }> = ({
  label,
  value,
  accent,
}) => {
  if (!value || value === 'Unknown') return null;
  return (
    <div className="flex gap-2 py-0.5 text-[11px]">
      <span className="w-24 shrink-0 text-text-secondary">{label}</span>
      <span className={accent ? 'text-blue-300' : 'text-text-primary'}>{value}</span>
    </div>
  );
};

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-1.5 pt-3 pb-1 border-t border-dark-border/30 first:border-0 first:pt-0">
    <span className="text-blue-400">{icon}</span>
    <span className="text-[11px] font-bold text-blue-300">{title}</span>
  </div>
);

export const ModuleInfoModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { patterns } = useTrackerStore(
    useShallow((s) => ({ patterns: s.patterns }))
  );
  const { songDBInfo, sidMetadata } = useFormatStore(
    useShallow((s) => ({
      songDBInfo: s.songDBInfo,
      sidMetadata: s.sidMetadata,
    }))
  );

  const metadata = useProjectStore((s) => s.metadata);
  const modlandResult = useModlandResultStore((s) => s.lastResult);
  const instruments = useInstrumentStore((s) => s.instruments);

  const importMeta = patterns[0]?.importMetadata;
  const modData = importMeta?.modData;

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

    const authors = songDBInfo?.authors?.filter(Boolean) ?? [];
    const publishers = songDBInfo?.publishers?.filter(Boolean) ?? [];
    const album = songDBInfo?.album ?? '';
    const year = songDBInfo?.year ?? '';
    const duration = songDBInfo?.duration_ms ?? 0;

    const modlandArtist = modlandResult?.metadata?.artist ?? '';
    const modlandFormat = modlandResult?.metadata?.format ?? '';
    const modlandTitle = modlandResult?.metadata?.title ?? '';

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

  if (!isOpen || sidMetadata) return null;

  const hasModland = !!(info.modlandArtist || info.modlandFormat || info.modlandTitle);
  const hasSongDB = !!(info.album || info.year || info.authors.length || info.publishers.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dark-bg border border-dark-border rounded-lg w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-border">
          <span className="text-sm font-bold text-text-primary">Module Info</span>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0">
          {/* Module */}
          <SectionHeader icon={<Disc3 size={12} />} title="Module" />
          <InfoRow label="Title" value={info.name} />
          <InfoRow
            label="Format"
            value={info.moduleType ? `${info.format} (${info.moduleType})` : info.format}
          />
          <InfoRow label="File" value={info.sourceFile} />
          <InfoRow
            label="Duration"
            value={info.duration > 0 ? formatDuration(info.duration) : undefined}
          />

          {/* SongDB */}
          {hasSongDB && (
            <>
              <SectionHeader icon={<Database size={12} />} title="Database" />
              {info.authors.length > 0 && (
                <InfoRow label="Author(s)" value={info.authors.join(', ')} accent />
              )}
              {info.publishers.length > 0 && (
                <InfoRow label="Group" value={info.publishers.join(', ')} />
              )}
              <InfoRow label="Album" value={info.album} />
              <InfoRow label="Year" value={info.year} />
            </>
          )}

          {/* Modland */}
          {hasModland && (
            <>
              <SectionHeader icon={<Zap size={12} />} title="Modland" />
              <InfoRow label="Artist" value={info.modlandArtist} accent />
              <InfoRow label="Title" value={info.modlandTitle} />
              <InfoRow label="Format" value={info.modlandFormat} />
            </>
          )}

          {/* Technical */}
          <SectionHeader icon={<Settings size={12} />} title="Technical" />
          <InfoRow
            label="Channels"
            value={info.channelCount > 0 ? String(info.channelCount) : undefined}
          />
          <InfoRow label="Patterns" value={String(info.patternCount)} />
          <InfoRow label="Instruments" value={String(info.instrumentCount)} />
          {info.sampleCount > 0 && <InfoRow label="Samples" value={String(info.sampleCount)} />}
          <InfoRow label="Speed" value={String(info.speed)} />
          <InfoRow label="BPM" value={String(info.bpm)} />
          {info.amigaPeriods !== undefined && (
            <InfoRow label="Freq. Table" value={info.amigaPeriods ? 'Amiga Periods' : 'Linear'} />
          )}

          {/* Song Message */}
          {info.songMessage && (
            <>
              <SectionHeader icon={<MessageSquare size={12} />} title="Song Message" />
              <pre className="text-[10px] text-text-secondary whitespace-pre-wrap font-mono px-1 py-1 bg-dark-bgSecondary rounded mt-1 max-h-32 overflow-y-auto">
                {info.songMessage}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
