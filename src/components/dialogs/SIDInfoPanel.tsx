/**
 * SIDInfoPanel.tsx — Displays C64 SID file metadata in the import dialog.
 * Shows: header info, chip model, clock, subsong selector, STIL comments, SongDB data.
 */

import React from 'react';
import { Cpu, Music, Clock, User, Disc, MessageSquare, Hash, Zap } from 'lucide-react';
import type { SIDHeaderInfo } from '@/lib/sid/SIDHeaderParser';
import type { STILSubsongInfo } from '@/lib/sid/STILParser';
import type { SongDBResult } from '@/lib/songdb';
import { useSettingsStore } from '@stores/useSettingsStore';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import type { SIDEngineType } from '@engine/deepsid/DeepSIDEngineManager';
import { CustomSelect } from '@components/common/CustomSelect';

interface SIDInfoPanelProps {
  header: SIDHeaderInfo;
  songDBInfo?: SongDBResult | null;
  stilInfo?: STILSubsongInfo | null;
  selectedSubsong: number;
  onSubsongChange: (subsong: number) => void;
}

export const SIDInfoPanel: React.FC<SIDInfoPanelProps> = ({
  header,
  songDBInfo,
  stilInfo,
  selectedSubsong,
  onSubsongChange,
}) => {
  const sidEngine = useSettingsStore(s => s.sidEngine);
  const setSidEngine = useSettingsStore(s => s.setSidEngine);
  const sidHwMode = useSettingsStore(s => s.sidHardwareMode);
  const chipLabel = header.chipModel !== 'Unknown'
    ? `MOS ${header.chipModel}`
    : 'Unknown';
  const clockLabel = header.clockSpeed !== 'Unknown'
    ? header.clockSpeed
    : 'Unknown';
  const chipCount = 1 + (header.secondSID ? 1 : 0) + (header.thirdSID ? 1 : 0);

  // Get duration from SongDB for current subsong
  const subsongDuration = songDBInfo?.found && songDBInfo?.subsongs?.[selectedSubsong];
  const durationStr = subsongDuration
    ? `${Math.floor(subsongDuration.duration_ms / 60000)}:${String(Math.floor((subsongDuration.duration_ms % 60000) / 1000)).padStart(2, '0')}`
    : null;

  return (
    <div className="space-y-2">
      {/* SID Header Info */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3 space-y-2">
        {/* Title & Author Row */}
        <div className="space-y-1">
          {header.title && (
            <div className="flex items-center gap-2">
              <Music className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-sm font-medium text-blue-200 truncate">{header.title}</span>
            </div>
          )}
          {header.author && (
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-blue-400/70 shrink-0" />
              <span className="text-xs text-blue-300/80 truncate">{header.author}</span>
            </div>
          )}
          {header.copyright && (
            <div className="flex items-center gap-2">
              <Disc className="w-3.5 h-3.5 text-blue-400/50 shrink-0" />
              <span className="text-xs text-text-muted truncate">{header.copyright}</span>
            </div>
          )}
        </div>

        {/* Chip & Clock Info */}
        <div className="flex items-center gap-3 text-xs text-text-muted border-t border-blue-800/30 pt-2">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-blue-400/60" />
            <span className="text-blue-300/80">
              {chipLabel}{chipCount > 1 ? ` × ${chipCount}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-blue-400/60" />
            <span className="text-blue-300/80">{clockLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Hash className="w-3 h-3 text-blue-400/60" />
            <span className="text-blue-300/80">{header.format}v{header.version}</span>
          </div>
          {durationStr && (
            <span className="text-blue-300/80 ml-auto font-mono">{durationStr}</span>
          )}
        </div>

        {/* Subsong Selector */}
        {header.subsongs > 1 && (
          <div className="flex items-center gap-3 border-t border-blue-800/30 pt-2">
            <label className="text-xs text-text-muted whitespace-nowrap">Subsong:</label>
            {header.subsongs > 20 ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  min={1}
                  max={header.subsongs}
                  value={selectedSubsong + 1}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(header.subsongs, Number(e.target.value)));
                    onSubsongChange(v - 1);
                  }}
                  className="w-20 text-xs bg-dark-bgSecondary border border-blue-800/40 rounded px-2 py-1 text-text-primary"
                />
                <span className="text-xs text-text-muted">of {header.subsongs}</span>
                {durationStr && (
                  <span className="text-xs text-blue-300/70 ml-auto font-mono">{durationStr}</span>
                )}
              </div>
            ) : (
              <CustomSelect
                value={String(selectedSubsong)}
                onChange={(v) => onSubsongChange(Number(v))}
                options={Array.from({ length: header.subsongs }, (_, i) => ({
                  value: String(i),
                  label: `Subsong ${i + 1}${i === header.defaultSubsong ? ' (default)' : ''}${songDBInfo?.found && songDBInfo?.subsongs?.[i] ? ` — ${Math.floor(songDBInfo.subsongs[i].duration_ms / 60000)}:${String(Math.floor((songDBInfo.subsongs[i].duration_ms % 60000) / 1000)).padStart(2, '0')}` : ''}`,
                }))}
                className="flex-1 text-xs bg-dark-bgSecondary border border-blue-800/40 rounded px-2 py-1 text-text-primary"
              />
            )}
          </div>
        )}

        {/* SID Engine Selector */}
        <div className="flex flex-col gap-1 border-t border-blue-800/30 pt-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <Zap className="w-3 h-3 text-blue-400/60" />
              <label className="text-xs text-text-muted whitespace-nowrap">Engine:</label>
            </div>
            <CustomSelect
              value={sidEngine}
              onChange={(v) => setSidEngine(v as SIDEngineType)}
              options={Object.values(SID_ENGINES).map(eng => ({
                value: eng.id,
                label: `${eng.name} — ${eng.accuracy}, ${eng.speed} (${eng.size})${eng.features.asidHardware ? ' ★ HW' : ''}`,
              }))}
              className="flex-1 text-xs bg-dark-bgSecondary border border-blue-800/40 rounded px-2 py-1 text-text-primary"
            />
          </div>
          {sidHwMode !== 'off' && !SID_ENGINES[sidEngine].features.asidHardware && (
            <p className="text-[10px] text-accent-warning leading-tight">
              ⚠ Hardware SID output requires jsSID engine. Select jsSID ★ HW above.
            </p>
          )}
          {sidHwMode !== 'off' && SID_ENGINES[sidEngine].features.asidHardware && (
            <p className="text-[10px] text-accent-success leading-tight">
              ✓ Hardware SID output active via {sidHwMode === 'webusb' ? 'USB-SID-Pico' : 'ASID'}
            </p>
          )}
        </div>
      </div>

      {/* SongDB Info (album, year, group) */}
      {songDBInfo && songDBInfo.found && (songDBInfo.album || songDBInfo.year || songDBInfo.publishers?.length > 0) && (
        <div className="grid grid-cols-2 gap-1.5 text-xs border-t border-dark-border pt-2">
          {songDBInfo.album && (
            <div className="flex justify-between text-text-muted col-span-2">
              <span>Album:</span>
              <span className="text-text-primary truncate ml-2">{songDBInfo.album}</span>
            </div>
          )}
          {songDBInfo.year && (
            <div className="flex justify-between text-text-muted">
              <span>Year:</span>
              <span className="text-text-primary">{songDBInfo.year}</span>
            </div>
          )}
          {songDBInfo.publishers?.length > 0 && (
            <div className="flex justify-between text-text-muted col-span-2">
              <span>Group:</span>
              <span className="text-text-primary truncate ml-2">{songDBInfo.publishers.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* STIL Comments */}
      {stilInfo && (stilInfo.comment?.length || stilInfo.title || stilInfo.artist) && (
        <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <MessageSquare className="w-3 h-3" />
            <span className="font-medium">STIL Info</span>
          </div>
          {stilInfo.title && (
            <p className="text-xs text-text-primary">{stilInfo.title}</p>
          )}
          {stilInfo.artist && (
            <p className="text-xs text-text-muted">Cover by: {stilInfo.artist}</p>
          )}
          {stilInfo.comment?.map((line, i) => (
            <p key={i} className="text-xs text-text-muted leading-relaxed">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
};
