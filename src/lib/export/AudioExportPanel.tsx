import React, { useState, useEffect, useRef } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, notify , useFormatStore } from '@stores';
import { exportLiveCaptureToWav, exportUADEAsWav, getUADEInstrument } from './audioExport';

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
  useEffect(() => { unmuteAllRef.current = unmuteAll; }, [unmuteAll]);
  useEffect(() => { rawRenderRef.current = rawRender; }, [rawRender]);

  useEffect(() => {
    if (initialScope) setAudioExportScope(initialScope);
  }, [initialScope]);

  // Register export handler (assigned during render — always has fresh closure).
  //
  // All paths now go through `exportLiveCaptureToWav` — a real-time capture
  // of the engine's master output post-FX. This is the only path that
  // includes every synth (TB303/DB303/Furnace/UADE/Hively/libopenmpt/…),
  // every per-instrument + per-channel + master effect, the user's mute/
  // solo state, stereo separation, and every in-song tracker effect.
  //
  // For a raw-module render (ignore all user processing), hold Shift at
  // export time — we'll route UADE-backed songs through the offline UADE
  // renderer which bypasses the live graph.
  handlerRef.current = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    try {
      const baseName = metadata.name || 'song';
      const uadeInst = getUADEInstrument(instruments);

      // Shift-export → raw module render bypassing the live graph. Useful
      // when the user wants the file "as shipped" without their mix.
      const rawMode = rawRenderRef.current;

      if (rawMode && uadeInst?.uade?.fileData) {
        await exportUADEAsWav(
          uadeInst.uade.fileData,
          uadeInst.uade.filename,
          `${baseName}.wav`,
          uadeInst.uade.currentSubsong ?? 0,
          (progress) => setRenderProgress(progress),
        );
        return;
      }
      if (rawMode && originalModuleData?.base64) {
        const binaryStr = atob(originalModuleData.base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const sourceFilename = originalModuleData.sourceFile ||
          `module.${originalModuleData.format.toLowerCase()}`;
        await exportUADEAsWav(
          bytes.buffer,
          sourceFilename,
          `${baseName}.wav`,
          0,
          (progress) => setRenderProgress(progress),
        );
        return;
      }

      // Default path — live capture. Handles every song type uniformly.
      if (audioExportScope === 'pattern') {
        const pattern = patterns[selectedPatternIndex];
        if (!pattern) {
          notify.warning('Please select a valid pattern');
          return false;
        }
        // Pattern-scope duration: rows × secondsPerRow + 2 s tail.
        const secondsPerRow = (60 / bpm) * 0.25;
        const durationSec = pattern.length * secondsPerRow + 2;
        await exportLiveCaptureToWav({
          durationSec,
          unmuteAll: unmuteAllRef.current,
          filename: `${pattern.name || 'pattern'}.wav`,
          onProgress: (p) => setRenderProgress(p),
        });
      } else {
        // Full song — let the helper estimate duration from transport +
        // patterns.
        await exportLiveCaptureToWav({
          unmuteAll: unmuteAllRef.current,
          filename: `${baseName}.wav`,
          onProgress: (p) => setRenderProgress(p),
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
          <div>Format: <span className="text-accent-primary">WAV (16-bit, 44.1kHz)</span></div>
          <div>Method: <span className="text-accent-primary">
            {rawRender ? 'Raw UADE offline' : 'Live capture (real-time)'}
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
      </div>
    </div>
  );
};
