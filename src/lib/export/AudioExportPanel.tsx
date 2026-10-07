import React, { useState, useEffect, useRef } from 'react';
import { useTrackerStore, useProjectStore, useTransportStore, notify } from '@stores';
import { exportAudio } from './audioExportService';

type AudioExportScope = 'pattern' | 'song';
type AudioExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg';

interface AudioExportPanelProps {
  handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null>;
  selectedPatternIndex: number;
  setSelectedPatternIndex: (idx: number) => void;
  isRendering: boolean;
  setIsRendering: (v: boolean) => void;
  renderProgress: number;
  setRenderProgress: (v: number) => void;
  initialScope?: AudioExportScope;
}

export const AudioExportPanel: React.FC<AudioExportPanelProps> = ({
  handlerRef,
  selectedPatternIndex,
  setSelectedPatternIndex,
  isRendering,
  setIsRendering,
  renderProgress,
  setRenderProgress,
  initialScope,
}) => {
  const { patterns } = useTrackerStore();
  const { metadata } = useProjectStore();
  const { bpm } = useTransportStore();
  // Default to full-song export — users overwhelmingly want the whole track,
  // not the single pattern they happen to be editing. Caller can still pass
  // `initialScope='pattern'` when they specifically mean pattern scope.
  const [audioExportScope, setAudioExportScope] = useState<AudioExportScope>(initialScope || 'song');
  // Output format — WAV (lossless, big) or MP3 (lossy, small, good for chat).
  const [format, setFormat] = useState<AudioExportFormat>('wav');
  // Option: unmute every channel during export so the WAV contains the
  // whole mix even if the user is currently soloing one channel.
  const [unmuteAll, setUnmuteAll] = useState<boolean>(true);
  // Option: Shift-style "raw module render" — skip the live graph and
  // render the underlying module file through the UADE offline renderer.
  // Ignored if the song has no module data (pure DEViLBOX composition).
  const [rawRender, setRawRender] = useState<boolean>(false);
  // Refs so the handler closure (stored in parent-supplied `handlerRef`)
  // always reads the freshest values without re-registering.
  const unmuteAllRef = useRef(unmuteAll);
  const rawRenderRef = useRef(rawRender);
  const formatRef = useRef(format);
  useEffect(() => { unmuteAllRef.current = unmuteAll; }, [unmuteAll]);
  useEffect(() => { rawRenderRef.current = rawRender; }, [rawRender]);
  useEffect(() => { formatRef.current = format; }, [format]);

  useEffect(() => {
    if (initialScope) setAudioExportScope(initialScope);
  }, [initialScope]);

  // ─── Stem export state (N × song duration wall-clock) ─────────────────
  const [stemProgress, setStemProgress] = useState<{
    active: boolean;
    channelIndex: number;
    totalChannels: number;
    stemPercent: number;
  } | null>(null);

  const refPattern = patterns[selectedPatternIndex] ?? patterns[0];
  const numChannels = refPattern?.channels.length ?? 0;
  // Rough wall-clock estimate per stem: song duration. Cheap multiplier for UI.
  const estSongSeconds = audioExportScope === 'song'
    ? patterns.reduce((sum, p) => sum + p.length, 0) * (60 / bpm) * 0.25 + 2
    : (refPattern?.length ?? 64) * (60 / bpm) * 0.25 + 2;

  const runStemExport = async () => {
    if (stemProgress?.active || isRendering) return;
    setStemProgress({ active: true, channelIndex: 0, totalChannels: numChannels, stemPercent: 0 });
    try {
      const baseName = metadata.name || 'song';
      await exportAudio({
        scope: 'stems',
        format: formatRef.current,
        filename: baseName,
        onStemProgress: (ch, total, percent) => {
          setStemProgress({ active: true, channelIndex: ch, totalChannels: total, stemPercent: Math.round(percent) });
        },
      });
      notify.success(`Exported ${numChannels} stems`);
    } catch (err) {
      console.error('[StemExport] failed:', err);
      notify.error(`Stem export failed: ${(err as Error).message}`);
    } finally {
      setStemProgress(null);
    }
  };

  // Register export handler (assigned during render - always has fresh closure).
  // The render is audioExportService.exportAudio: a live capture of the engine's
  // export tap (see its header for why); Shift-style "raw" asks it for the
  // offline module render instead. MCP export_wav / export_mp3 / export_stems
  // call the same function.
  handlerRef.current = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    try {
      const baseName = metadata.name || 'song';
      const fmt = formatRef.current;
      // Shift-export (raw) is WAV only: re-encoding the raw render would defeat "as shipped".
      const rawMode = rawRenderRef.current;

      if (audioExportScope === 'pattern') {
        const pattern = patterns[selectedPatternIndex];
        if (!pattern) {
          notify.warning('Please select a valid pattern');
          return false;
        }
        await exportAudio({
          scope: 'pattern',
          patternIndex: selectedPatternIndex,
          format: fmt,
          raw: rawMode,
          unmuteAll: unmuteAllRef.current,
          filename: rawMode ? baseName : (pattern.name || 'pattern'),
          onProgress: (p: number) => setRenderProgress(p),
        });
      } else {
        await exportAudio({
          scope: 'song',
          format: fmt,
          raw: rawMode,
          unmuteAll: unmuteAllRef.current,
          filename: baseName,
          onProgress: (p: number) => setRenderProgress(p),
        });
      }
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
        Audio Export ({format.toUpperCase()})
      </h3>
      <div className="space-y-3">
        {/* Export scope toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setAudioExportScope('pattern')}
            disabled={isRendering}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${audioExportScope === 'pattern'
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            Single Pattern
          </button>
          <button
            onClick={() => setAudioExportScope('song')}
            disabled={isRendering}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${audioExportScope === 'song'
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            Full Song ({patterns.length} patterns)
          </button>
        </div>

        {/* Format toggle — WAV vs MP3 */}
        <div className="flex gap-2">
          <button
            onClick={() => setFormat('wav')}
            disabled={isRendering}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${format === 'wav'
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            WAV (lossless)
          </button>
          <button
            onClick={() => setFormat('mp3')}
            disabled={isRendering}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${format === 'mp3'
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            MP3 (192 kbps)
          </button>
          <button
            onClick={() => setFormat('flac')}
            disabled={isRendering}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${format === 'flac'
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            FLAC (lossless)
          </button>
          <button
            onClick={() => setFormat('ogg')}
            disabled={isRendering}
            className={`
              flex-1 px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${format === 'ogg'
                ? 'bg-accent-primary text-text-inverse'
                : 'bg-dark-bg text-text-secondary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            OGG (q5)
          </button>
        </div>

        {/* Pattern selector (only shown for single pattern mode) */}
        {audioExportScope === 'pattern' && (
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">
              Pattern to Render
            </label>
            <select
              value={selectedPatternIndex}
              onChange={(e) => setSelectedPatternIndex(Number(e.target.value))}
              className="input w-full"
              disabled={isRendering}
            >
              {patterns.map((pattern, index) => (
                <option key={pattern.id} value={index}>
                  {index.toString().padStart(2, '0')} - {pattern.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-mono text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={unmuteAll}
              onChange={(e) => setUnmuteAll(e.target.checked)}
              disabled={isRendering}
            />
            <span>Unmute all channels for the render (ignores current mute/solo)</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-mono text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={rawRender}
              onChange={(e) => setRawRender(e.target.checked)}
              disabled={isRendering}
            />
            <span>Raw module render (skip user effects + mix, UADE-backed only)</span>
          </label>
        </div>

        <div className="text-sm font-mono text-text-secondary space-y-1">
          <div>Format: <span className="text-accent-primary">
            {format === 'mp3' ? 'MP3 (192 kbps, 44.1 kHz)' : format === 'flac' ? 'FLAC (16-bit lossless, 44.1 kHz)' : format === 'ogg' ? 'OGG Vorbis (q5 ≈ 160 kbps, 44.1 kHz)' : 'WAV (16-bit, 44.1 kHz)'}
          </span></div>
          <div>Method: <span className="text-accent-primary">
            {rawRender ? 'Raw UADE offline (always WAV)' : 'Live capture (real-time)'}
          </span></div>
          <div>BPM: <span className="text-accent-primary">{bpm}</span></div>
          {audioExportScope === 'song' ? (
            <>
              <div>Patterns: <span className="text-accent-primary">{patterns.length}</span></div>
              <div>Total Rows: <span className="text-accent-primary">{patterns.reduce((sum, p) => sum + p.length, 0)}</span></div>
            </>
          ) : (
            <div>Length: <span className="text-accent-primary">{patterns[selectedPatternIndex]?.length || 64} rows</span></div>
          )}
        </div>
        {isRendering && (
          <div className="mt-3">
            <div className="text-xs font-mono text-text-muted mb-1">
              Rendering{audioExportScope !== 'pattern' ? ` ${audioExportScope}` : ''}... {renderProgress}%
            </div>
            <div className="w-full bg-dark-border rounded-full h-2">
              <div
                className="bg-accent-primary h-2 rounded-full transition-all duration-200"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Stem export — one file per channel, live-solo capture */}
        <div className="pt-3 mt-3 border-t border-dark-border">
          <div className="text-xs font-mono text-text-secondary mb-2">
            Per-channel stems — one {format.toUpperCase()} per channel, captured live (solo-per-stem).
            {' '}Real-time: ~{Math.ceil((estSongSeconds * numChannels) / 60)} min for {numChannels} channels.
          </div>
          <button
            onClick={runStemExport}
            disabled={isRendering || stemProgress?.active || numChannels === 0}
            className={`
              w-full px-3 py-2 rounded-lg text-sm font-mono transition-all
              ${stemProgress?.active
                ? 'bg-dark-bg text-text-muted border border-dark-border cursor-wait'
                : 'bg-dark-bg text-text-primary hover:bg-dark-bgHover border border-dark-border'
              }
            `}
          >
            {stemProgress?.active
              ? `Stem ${stemProgress.channelIndex + 1}/${stemProgress.totalChannels}: ${stemProgress.stemPercent}%`
              : `Export Stems (${numChannels} × ${format.toUpperCase()})`}
          </button>
          {stemProgress?.active && (
            <div className="w-full bg-dark-border rounded-full h-2 mt-2">
              <div
                className="bg-accent-primary h-2 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.min(100,
                    ((stemProgress.channelIndex + stemProgress.stemPercent / 100) / Math.max(1, stemProgress.totalChannels)) * 100
                  )}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
