import React, { useState, useEffect } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, notify } from '@stores';
import { exportAsXM, type XMExportOptions } from './XMExporter';
import { exportSongToMOD } from './modExport';
import { exportWithOpenMPT, type OpenMPTExportOptions } from './OpenMPTExporter';

interface ModuleExportPanelProps {
  handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null>;
  exportMode: 'xm' | 'mod' | 'it' | 's3m';
  onClose: () => void;
}

export const ModuleExportPanel: React.FC<ModuleExportPanelProps> = ({
  handlerRef,
  exportMode,
  onClose,
}) => {
  const { patterns, patternOrder } = useTrackerStore();
  const { instruments } = useInstrumentStore();
  const { metadata } = useProjectStore();
  const { bpm, speed } = useTransportStore();

  const [xmChannelCount, setXmChannelCount] = useState(8);
  const [bakeSynthsToSamples, setBakeSynthsToSamples] = useState(true);
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);

  // Clear warnings when export mode changes
  useEffect(() => {
    setExportWarnings([]);
  }, [exportMode]);

  // Register export handler
  handlerRef.current = async () => {
    if (exportMode === 'it' || exportMode === 's3m') {
      // IT/S3M export via OpenMPT WASM
      const songPositions = patterns.map((_, i) => i);
      const opts: OpenMPTExportOptions = {
        format: exportMode,
        moduleName: metadata.name || 'DEViLBOX Export',
        channelLimit: exportMode === 's3m' ? Math.min(xmChannelCount, 32) : xmChannelCount,
      };

      const result = await exportWithOpenMPT(patterns, instruments, songPositions, opts);

      const url = URL.createObjectURL(result.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (result.warnings.length > 0) {
        setExportWarnings(result.warnings);
        notify.warning(`${exportMode.toUpperCase()} exported with ${result.warnings.length} warnings.`);
      } else {
        notify.success(`${exportMode.toUpperCase()} file "${result.filename}" exported successfully!`);
        onClose();
      }
    } else if (exportMode === 'xm') {
      const xmOptions: XMExportOptions = {
        channelLimit: xmChannelCount,
        moduleName: metadata.name || 'DEViLBOX Export',
        bakeSynthsToSamples,
      };

      const result = await exportAsXM(patterns, instruments, xmOptions);

      // Download the file
      const url = URL.createObjectURL(result.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show warnings if any
      if (result.warnings.length > 0) {
        setExportWarnings(result.warnings);
        notify.warning(`XM exported with ${result.warnings.length} warnings. Check the dialog for details.`);
      } else {
        notify.success(`XM file "${result.filename}" exported successfully!`);
        onClose();
      }
    } else {
      const nChannels = patterns[0]?.channels.length ?? 4;
      const song = {
        name: metadata.name || 'DEViLBOX Export',
        format: 'MOD' as const,
        patterns,
        instruments,
        songPositions: patternOrder,
        songLength: patternOrder.length,
        restartPosition: 0,
        numChannels: nChannels,
        initialBPM: bpm,
        initialSpeed: speed,
      };

      const result = await exportSongToMOD(song, { bakeSynths: bakeSynthsToSamples });

      // Download the file
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show warnings if any
      if (result.warnings.length > 0) {
        setExportWarnings(result.warnings);
        notify.warning(`MOD exported with ${result.warnings.length} warnings. Check the dialog for details.`);
      } else {
        notify.success(`MOD file "${result.filename}" exported successfully!`);
        onClose();
      }
    }
  };

  return (
    <>
      {exportMode === 'xm' && (
        <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
          <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
            FastTracker II XM Export (.xm)
          </h3>
          <div className="space-y-3">
            {/* Channel Count */}
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">
                Channel Count (max 32)
              </label>
              <input
                type="number"
                min={2}
                max={32}
                value={xmChannelCount}
                onChange={(e) => setXmChannelCount(Math.min(32, Math.max(2, Number(e.target.value))))}
                className="input w-full"
              />
            </div>

            {/* Synth instrument handling */}
            <label className="flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors">
              <input
                type="checkbox"
                checked={bakeSynthsToSamples}
                onChange={(e) => setBakeSynthsToSamples(e.target.checked)}
                className="w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
              />
              Include synth instrument slots (audio will be silent)
            </label>

            <div className="text-sm font-mono text-text-secondary space-y-1">
              <div>Format: <span className="text-accent-primary">FastTracker II Extended Module</span></div>
              <div>Patterns: <span className="text-accent-primary">{patterns.length}</span></div>
              <div>Channels: <span className="text-accent-primary">{Math.min(patterns[0]?.channels.length || 8, 32)}</span></div>
              <div>Instruments: <span className="text-accent-primary">{Math.min(instruments.length, 128)}</span></div>
            </div>

            {/* Warnings display */}
            {exportWarnings.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                <h4 className="text-xs font-mono font-bold text-orange-400 mb-2">
                  Export Warnings ({exportWarnings.length})
                </h4>
                <ul className="text-xs font-mono text-orange-300 space-y-1 max-h-32 overflow-y-auto">
                  {exportWarnings.map((warning, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {exportMode === 'mod' && (
        <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
          <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
            ProTracker MOD Export (.mod)
          </h3>
          <div className="space-y-3">
            {/* Synth instrument handling */}
            <label className="flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors">
              <input
                type="checkbox"
                checked={bakeSynthsToSamples}
                onChange={(e) => setBakeSynthsToSamples(e.target.checked)}
                className="w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
              />
              Bake synth instruments to PCM samples
            </label>

            <div className="text-sm font-mono text-text-secondary space-y-1">
              <div>Format: <span className="text-accent-primary">ProTracker MOD</span></div>
              <div>Channels: <span className="text-accent-primary">{patterns[0]?.channels.length ?? 4}</span></div>
              <div>Patterns: <span className="text-accent-primary">{patterns.length}</span></div>
              <div>Max Samples: <span className="text-accent-primary">31</span></div>
              <div>Note Range: <span className="text-accent-primary">C-1 to B-6</span></div>
            </div>

            {/* Warnings display */}
            {exportWarnings.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                <h4 className="text-xs font-mono font-bold text-orange-400 mb-2">
                  Export Warnings ({exportWarnings.length})
                </h4>
                <ul className="text-xs font-mono text-orange-300 space-y-1 max-h-32 overflow-y-auto">
                  {exportWarnings.map((warning, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {(exportMode === 'it' || exportMode === 's3m') && (
        <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
          <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
            {exportMode === 'it' ? 'Impulse Tracker IT Export (.it)' : 'ScreamTracker 3 S3M Export (.s3m)'}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-text-muted mb-1">
                Channel Count (max {exportMode === 's3m' ? 32 : 64})
              </label>
              <input
                type="number"
                min={2}
                max={exportMode === 's3m' ? 32 : 64}
                value={xmChannelCount}
                onChange={(e) => setXmChannelCount(Math.min(
                  exportMode === 's3m' ? 32 : 64,
                  Math.max(2, Number(e.target.value)),
                ))}
                className="input w-full"
              />
            </div>

            <div className="text-sm font-mono text-text-secondary space-y-1">
              <div>Format: <span className="text-accent-primary">
                {exportMode === 'it' ? 'Impulse Tracker Module' : 'ScreamTracker 3 Module'}
              </span></div>
              <div>Engine: <span className="text-accent-primary">OpenMPT CSoundFile (WASM)</span></div>
              <div>Patterns: <span className="text-accent-primary">{patterns.length}</span></div>
              <div>Channels: <span className="text-accent-primary">{Math.min(patterns[0]?.channels.length || 8, exportMode === 's3m' ? 32 : 64)}</span></div>
              <div>Instruments: <span className="text-accent-primary">{instruments.length}</span></div>
            </div>

            {exportWarnings.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                <h4 className="text-xs font-mono font-bold text-orange-400 mb-2">
                  Export Warnings ({exportWarnings.length})
                </h4>
                <ul className="text-xs font-mono text-orange-300 space-y-1 max-h-32 overflow-y-auto">
                  {exportWarnings.map((warning, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
