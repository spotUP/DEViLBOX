import React, { useState, useEffect } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, notify , useFormatStore } from '@stores';
import { exportPatternAsWav, exportSongAsWav, getUADEInstrument, exportUADEAsWav } from './audioExport';

type AudioExportScope = 'pattern' | 'song';

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
  const { originalModuleData } = useFormatStore();
  const { instruments } = useInstrumentStore();
  const { metadata } = useProjectStore();
  const { bpm } = useTransportStore();
  const [audioExportScope, setAudioExportScope] = useState<AudioExportScope>(initialScope || 'pattern');

  useEffect(() => {
    if (initialScope) setAudioExportScope(initialScope);
  }, [initialScope]);

  // Register export handler (assigned during render — always has fresh closure)
  handlerRef.current = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    try {
      // Check if this is a UADE-backed module — render through UADE for accurate output
      const uadeInst = getUADEInstrument(instruments);
      if (uadeInst?.uade?.fileData) {
        // Module was loaded via UADE parser — use its stored fileData
        await exportUADEAsWav(
          uadeInst.uade.fileData,
          uadeInst.uade.filename,
          `${metadata.name || 'song'}.wav`,
          uadeInst.uade.currentSubsong ?? 0,
          (progress) => setRenderProgress(progress)
        );
      } else if (originalModuleData?.base64) {
        // Module was loaded via native parser but we have original bytes —
        // render through UADE for accurate effects/mixing
        const binaryStr = atob(originalModuleData.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const fileData = bytes.buffer;
        const sourceFilename = originalModuleData.sourceFile || `module.${originalModuleData.format.toLowerCase()}`;
        await exportUADEAsWav(
          fileData,
          sourceFilename,
          `${metadata.name || 'song'}.wav`,
          0,
          (progress) => setRenderProgress(progress)
        );
      } else if (audioExportScope === 'song') {
        // Export all patterns in sequence
        const sequence = patterns.map((_, index) => index);
        await exportSongAsWav(
          patterns,
          sequence,
          instruments,
          bpm,
          `${metadata.name || 'song'}.wav`,
          (progress) => setRenderProgress(progress)
        );
      } else {
        // Export single pattern
        const pattern = patterns[selectedPatternIndex];
        if (!pattern) {
          notify.warning('Please select a valid pattern');
          return false;
        }
        await exportPatternAsWav(
          pattern,
          instruments,
          bpm,
          `${pattern.name || 'pattern'}.wav`,
          (progress) => setRenderProgress(progress)
        );
      }
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
    }
  };

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
        Audio Export (WAV)
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

        <div className="text-sm font-mono text-text-secondary space-y-1">
          <div>Format: <span className="text-accent-primary">WAV (16-bit, 44.1kHz)</span></div>
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
      </div>
    </div>
  );
};
