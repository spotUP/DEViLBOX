import React, { useState, useEffect } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, notify } from '@stores';
import { exportWithOpenMPT, type OpenMPTExportOptions } from './OpenMPTExporter';

interface ModuleExportPanelProps {
  handlerRef: React.MutableRefObject<(() => Promise<false | void>) | null>;
  exportMode: 'xm' | 'mod' | 'it' | 's3m';
  onClose: () => void;
}

const FORMAT_LABELS: Record<string, string> = {
  mod: 'ProTracker MOD',
  xm:  'FastTracker II XM',
  it:  'Impulse Tracker IT',
  s3m: 'ScreamTracker 3 S3M',
};

const CHANNEL_MAX: Record<string, number> = {
  mod: 32,
  xm:  32,
  it:  64,
  s3m: 32,
};

export const ModuleExportPanel: React.FC<ModuleExportPanelProps> = ({
  handlerRef,
  exportMode,
  onClose,
}) => {
  const { patterns, patternOrder } = useTrackerStore();
  const { instruments } = useInstrumentStore();
  const { metadata } = useProjectStore();
  const { bpm, speed } = useTransportStore();

  const [channelCount, setChannelCount] = useState(
    exportMode === 'mod' ? 4 : 8,
  );
  const [exportWarnings, setExportWarnings] = useState<string[]>([]);

  const hasNotes = patterns.some(pat =>
    pat.channels.some(ch => ch.rows.some(row => row.note > 0)),
  );
  const maxChannels = CHANNEL_MAX[exportMode] ?? 32;

  useEffect(() => {
    setExportWarnings([]);
    setChannelCount(exportMode === 'mod' ? 4 : 8);
  }, [exportMode]);

  // All four formats export via OpenMPT WASM (CSoundFile::SaveMod/SaveXM/SaveIT/SaveS3M)
  handlerRef.current = async () => {
    if (!hasNotes) {
      notify.error('No playable note data — this format stores audio externally and cannot be exported.');
      return false;
    }

    const opts: OpenMPTExportOptions = {
      format: exportMode,
      moduleName: metadata.name || 'DEViLBOX Export',
      channelLimit: Math.min(channelCount, maxChannels),
      initialBPM: bpm,
      initialSpeed: speed,
    };

    const result = await exportWithOpenMPT(patterns, instruments, patternOrder, opts);

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
  };

  return (
    <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
      <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
        {FORMAT_LABELS[exportMode]} Export (.{exportMode})
      </h3>

      {!hasNotes ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-xs font-mono text-red-300">
            No playable note data found. This format stores audio externally and cannot be exported to a tracker module.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-mono text-text-muted mb-1">
              Channel Count (max {maxChannels})
            </label>
            <input
              type="number"
              min={1}
              max={maxChannels}
              value={channelCount}
              onChange={(e) => setChannelCount(Math.min(maxChannels, Math.max(1, Number(e.target.value))))}
              className="input w-full"
            />
          </div>

          <div className="text-sm font-mono text-text-secondary space-y-1">
            <div>Format: <span className="text-accent-primary">{FORMAT_LABELS[exportMode]}</span></div>
            <div>Engine: <span className="text-accent-primary">OpenMPT CSoundFile (WASM)</span></div>
            <div>Patterns: <span className="text-accent-primary">{patterns.length}</span></div>
            <div>Channels: <span className="text-accent-primary">{Math.min(patterns[0]?.channels.length || channelCount, maxChannels)}</span></div>
            <div>Instruments: <span className="text-accent-primary">{instruments.length}</span></div>
            <div>BPM / Speed: <span className="text-accent-primary">{bpm} / {speed}</span></div>
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
      )}
    </div>
  );
};
