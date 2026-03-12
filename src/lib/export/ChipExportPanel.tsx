import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore, useTransportStore, notify } from '@stores';
import {
  ChipRecordingSession,
  exportChipMusic,
  getAvailableFormats,
  getLogStatistics,
  parseRegisterLog,
  FORMAT_INFO,
  type ChipExportFormat,
  type RegisterWrite,
} from './ChipExporter';

interface ChipExportPanelProps {
  handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null>;
  isRendering: boolean;
  setIsRendering: (v: boolean) => void;
  renderProgress: number;
  setRenderProgress: (v: number) => void;
  onClose: () => void;
  onFormatChange?: (extension: string) => void;
}

export const ChipExportPanel: React.FC<ChipExportPanelProps> = ({
  handlerRef,
  isRendering,
  setIsRendering,
  renderProgress,
  setRenderProgress,
  onClose,
  onFormatChange,
}) => {
  const { metadata } = useProjectStore();
  const { bpm, loopStartRow, currentRow, setLoopStartRow } = useTransportStore();

  const [chipFormat, setChipFormat] = useState<ChipExportFormat>('vgm');
  const [chipRecordingSession] = useState(() => new ChipRecordingSession());
  const [isChipRecording, setIsChipRecording] = useState(false);
  const [chipRecordingTime, setChipRecordingTime] = useState(0);
  const [chipLogData, setChipLogData] = useState<Uint8Array | null>(null);
  const [chipWrites, setChipWrites] = useState<RegisterWrite[]>([]);
  const [availableChipFormats, setAvailableChipFormats] = useState<ChipExportFormat[]>([]);
  const [chipTitle, setChipTitle] = useState('');
  const [chipAuthor, setChipAuthor] = useState('');
  const [chipLoopPoint, setChipLoopPoint] = useState(0);

  const chipRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync chipLoopPoint with global loopStartRow on mount
  useEffect(() => {
    if (loopStartRow > 0) {
      setChipLoopPoint(loopStartRow);
    }
  }, [loopStartRow]);

  // Notify parent of format changes
  useEffect(() => {
    onFormatChange?.(FORMAT_INFO[chipFormat].extension);
  }, [chipFormat, onFormatChange]);

  // Cleanup chip recording timer on unmount
  useEffect(() => {
    return () => {
      if (chipRecordingTimerRef.current) {
        clearInterval(chipRecordingTimerRef.current);
      }
    };
  }, []);

  const startChipRecording = () => {
    chipRecordingSession.startRecording();
    setIsChipRecording(true);
    setChipRecordingTime(0);
    setChipLogData(null);
    setChipWrites([]);
    setAvailableChipFormats([]);

    // Start timer
    chipRecordingTimerRef.current = setInterval(() => {
      setChipRecordingTime((t) => t + 100);
    }, 100);
  };

  const stopChipRecording = async () => {
    if (chipRecordingTimerRef.current) {
      clearInterval(chipRecordingTimerRef.current);
      chipRecordingTimerRef.current = null;
    }

    const logData = await chipRecordingSession.stopRecording();
    setIsChipRecording(false);
    setChipLogData(logData);

    if (logData.length > 0) {
      const writes = parseRegisterLog(logData);
      setChipWrites(writes);
      const formats = getAvailableFormats(writes);
      setAvailableChipFormats(formats);
      if (formats.length > 0 && !formats.includes(chipFormat)) {
        setChipFormat(formats[0]);
      }
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  // Register export handler
  handlerRef.current = async () => {
    // Validate chip export
    if (!chipLogData || chipLogData.length === 0) {
      notify.error('No recording data. Press Record and play your song first.');
      return false;
    }

    if (chipWrites.length === 0) {
      notify.error('No register writes captured. Make sure Furnace chips are playing.');
      return false;
    }

    if (!availableChipFormats.includes(chipFormat)) {
      const usedChips = getLogStatistics(chipWrites).usedChips
        .map(c => c.name)
        .join(', ');
      notify.error(`${FORMAT_INFO[chipFormat].name} format is not compatible with chips used: ${usedChips}. Try VGM for universal compatibility.`);
      return false;
    }

    if (!chipTitle.trim()) {
      notify.error('Please enter a title for your export.');
      return false;
    }

    // Show progress
    setIsRendering(true);
    setRenderProgress(0);

    try {
      // Calculate loop point in samples from row number
      const rowsPerBeat = 4;
      const beatsPerSecond = bpm / 60;
      const secondsPerRow = 1 / (beatsPerSecond * rowsPerBeat);
      const loopPointSamples = chipLoopPoint > 0
        ? Math.floor(chipLoopPoint * secondsPerRow * 44100)
        : undefined;

      setRenderProgress(50);

      const chipResult = await exportChipMusic(chipLogData, {
        format: chipFormat,
        title: chipTitle || metadata.name || 'Untitled',
        author: chipAuthor || metadata.author || 'Unknown',
        loopPoint: loopPointSamples,
      });

      setRenderProgress(100);

      // Download the file
      const url = URL.createObjectURL(chipResult.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = chipResult.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notify.success(`${FORMAT_INFO[chipFormat].name} file exported successfully!`);
      onClose();
    } catch (error) {
      notify.error(`Export failed: ${(error as Error).message}`);
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
        Chip Music Export
      </h3>
      <div className="space-y-4">
        {/* Recording controls */}
        <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono text-text-muted">RECORDING</span>
            <span className="text-lg font-mono text-accent-primary font-bold">
              {formatTime(chipRecordingTime)}
            </span>
          </div>
          <div className="flex gap-2">
            {!isChipRecording ? (
              <button
                onClick={startChipRecording}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-text-primary font-mono text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                <span className="w-3 h-3 rounded-full bg-white" />
                Record
              </button>
            ) : (
              <button
                onClick={stopChipRecording}
                className="flex-1 px-4 py-2 rounded-lg bg-dark-bgHover text-text-primary font-mono text-sm hover:bg-dark-border transition-colors flex items-center justify-center gap-2"
              >
                <span className="w-3 h-3 bg-white" />
                Stop
              </button>
            )}
          </div>
          <p className="text-xs font-mono text-text-muted mt-2">
            {isChipRecording
              ? 'Recording... Play your song now!'
              : chipWrites.length > 0
              ? `Captured ${chipWrites.length.toLocaleString()} register writes`
              : 'Press Record, then play your song to capture chip output'}
          </p>
        </div>

        {/* Chip statistics */}
        {chipWrites.length > 0 && (
          <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
            <h4 className="text-xs font-mono text-text-muted mb-2">CAPTURED DATA</h4>
            {(() => {
              const stats = getLogStatistics(chipWrites);
              return (
                <div className="space-y-1 text-sm font-mono">
                  <div>Duration: <span className="text-accent-primary">{stats.duration.toFixed(1)}s</span></div>
                  <div>Writes: <span className="text-accent-primary">{stats.totalWrites.toLocaleString()}</span></div>
                  <div className="pt-1 border-t border-dark-border mt-2">
                    <span className="text-text-muted">Chips used:</span>
                    {stats.usedChips.map((chip) => (
                      <div key={chip.type} className="ml-2 text-xs">
                        {chip.name}: <span className="text-accent-secondary">{chip.writes.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Quick presets */}
        {chipWrites.length > 0 && (
          <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
            <div className="text-xs font-mono text-text-muted mb-2">QUICK PRESETS</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setChipFormat('vgm')}
                className="px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left"
              >
                🌐 Universal (VGM)
              </button>
              <button
                onClick={() => setChipFormat('gym')}
                disabled={!availableChipFormats.includes('gym')}
                className="px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🎮 Genesis (GYM)
              </button>
              <button
                onClick={() => setChipFormat('nsf')}
                disabled={!availableChipFormats.includes('nsf')}
                className="px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🕹️ NES (NSF)
              </button>
              <button
                onClick={() => setChipFormat('gbs')}
                disabled={!availableChipFormats.includes('gbs')}
                className="px-3 py-2 rounded-lg bg-dark-bgSecondary border border-dark-border hover:border-accent-primary text-xs font-mono transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🎮 Game Boy (GBS)
              </button>
            </div>
          </div>
        )}

        {/* Format selection */}
        <div>
          <label className="block text-xs font-mono text-text-muted mb-2">
            EXPORT FORMAT
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['vgm', 'gym', 'nsf', 'gbs', 'spc', 'zsm', 'sap', 'tiuna'] as ChipExportFormat[]).map((fmt) => {
              const info = FORMAT_INFO[fmt];
              const isAvailable = availableChipFormats.includes(fmt) || chipWrites.length === 0;

              // Loop support indicators
              const loopSupport = {
                vgm: { supported: true, type: 'custom' },
                gym: { supported: false, type: 'none' },
                nsf: { supported: true, type: 'auto' },
                gbs: { supported: true, type: 'auto' },
                spc: { supported: false, type: 'none' },
                zsm: { supported: false, type: 'none' },
                sap: { supported: false, type: 'none' },
                tiuna: { supported: false, type: 'none' },
                s98: { supported: true, type: 'custom' },
                sndh: { supported: false, type: 'none' },
              }[fmt] ?? { supported: false, type: 'none' };

              return (
                <button
                  key={fmt}
                  onClick={() => isAvailable && setChipFormat(fmt)}
                  disabled={!isAvailable && chipWrites.length > 0}
                  className={`
                    p-3 rounded-lg text-left transition-all
                    ${chipFormat === fmt
                      ? 'bg-accent-primary text-text-inverse'
                      : isAvailable || chipWrites.length === 0
                      ? 'bg-dark-bg border border-dark-border hover:border-dark-borderLight'
                      : 'bg-dark-bg border border-dark-border opacity-40 cursor-not-allowed'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm font-semibold">{info.name}</div>
                    {loopSupport.type === 'custom' && (
                      <span className="text-xs opacity-70" title="Custom loop point supported">🔁</span>
                    )}
                    {loopSupport.type === 'auto' && (
                      <span className="text-xs opacity-70" title="Loops entire song automatically">↻</span>
                    )}
                  </div>
                  <div className="text-xs opacity-70">.{info.extension}</div>
                </button>
              );
            })}
          </div>

          {/* Loop point warning/info */}
          {chipLoopPoint > 0 && (
            <div className="mt-2 text-xs">
              {(() => {
                const loopType = {
                  vgm: 'custom',
                  nsf: 'auto',
                  gbs: 'auto',
                  gym: 'none',
                  spc: 'none',
                  zsm: 'none',
                  sap: 'none',
                  tiuna: 'none',
                  s98: 'custom',
                  sndh: 'none',
                }[chipFormat] ?? 'none';

                if (loopType === 'custom') {
                  return (
                    <div className="text-green-400">
                      ✓ Loop point at row {chipLoopPoint} will be used
                    </div>
                  );
                } else if (loopType === 'auto') {
                  return (
                    <div className="text-yellow-400">
                      ⚠️ {chipFormat.toUpperCase()} loops entire song (custom loop points not supported)
                    </div>
                  );
                } else {
                  return (
                    <div className="text-yellow-400">
                      ⚠️ {chipFormat.toUpperCase()} format does not support loop points
                    </div>
                  );
                }
              })()}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">
              Title
            </label>
            <input
              type="text"
              value={chipTitle}
              onChange={(e) => setChipTitle(e.target.value)}
              placeholder={metadata.name || 'Untitled'}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">
              Author
            </label>
            <input
              type="text"
              value={chipAuthor}
              onChange={(e) => setChipAuthor(e.target.value)}
              placeholder={metadata.author || 'Unknown'}
              className="input w-full"
            />
          </div>
        </div>

        {/* Loop Point */}
        <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
          <label className="block text-xs font-mono text-text-muted mb-2">
            LOOP POINT (Row)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={chipLoopPoint}
              onChange={(e) => setChipLoopPoint(Math.max(0, Number(e.target.value)))}
              min={0}
              className="input flex-1 font-mono"
              placeholder="0"
            />
            <button
              onClick={() => {
                setChipLoopPoint(currentRow);
                setLoopStartRow(currentRow);
              }}
              className="px-3 py-2 rounded-lg bg-dark-bgHover text-text-primary font-mono text-xs hover:bg-dark-border transition-colors"
              title="Set loop point to current row"
            >
              From Cursor
            </button>
          </div>
          <p className="text-xs font-mono text-text-muted mt-2">
            {chipLoopPoint > 0
              ? `Music will loop back to row ${chipLoopPoint}`
              : 'Set to 0 for no loop (one-shot playback)'}
          </p>
        </div>

        {/* Export progress */}
        {isRendering && (
          <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-text-muted">
                Exporting {FORMAT_INFO[chipFormat].name}...
              </span>
              <span className="text-xs font-mono text-accent-primary">
                {renderProgress}%
              </span>
            </div>
            <div className="h-2 bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-300"
                style={{ width: `${renderProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Format description */}
        <div className="text-xs font-mono text-text-muted bg-dark-bg border border-dark-border rounded-lg p-3">
          {FORMAT_INFO[chipFormat].description}
        </div>
      </div>
    </div>
  );
};
