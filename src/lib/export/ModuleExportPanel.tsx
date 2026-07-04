import React, { useState, useEffect } from 'react';
import { useTrackerStore, useInstrumentStore, useProjectStore, useTransportStore, notify } from '@stores';
import { exportWithOpenMPT, type OpenMPTExportOptions } from './OpenMPTExporter';
import { exportCinterModFile, downloadBytes } from './Cinter4ModSave';
import { getOriginalModuleDataForExport, base64ToBuffer } from './exporters';

/** The original imported .mod bytes (for byte-exact Cinter crunching), if any. */
function originalModBytes(): Uint8Array | undefined {
  const omd = getOriginalModuleDataForExport();
  return omd?.format === 'MOD' ? new Uint8Array(base64ToBuffer(omd.base64)) : undefined;
}

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

  // Cinter MOD: any MOD export whose instruments carry Cinter synth params. The
  // Cinter instruments themselves are the reliable signal — detect by them, not by
  // libopenmpt bytes (a natively-parsed .mod has no libopenmptFileData).
  const cinterCount = instruments.filter(
    (i) => (i.parameters as Record<string, unknown> | undefined)?.cinter === 1,
  ).length;
  const isCinterMod = exportMode === 'mod' && cinterCount > 0;
  // Default for Cinter songs: the small crunched .cinter4 (CinterConvert) format.
  // Off → a full ProTracker .mod with rendered samples (plays anywhere).
  const [crunched, setCrunched] = useState(true);

  const hasNotes = patterns.some(pat =>
    pat.channels.some(ch => ch.rows.some(row => row.note > 0)),
  );
  const maxChannels = CHANNEL_MAX[exportMode] ?? 32;

  // Check for synth-replaced instruments
  const replacedIds: number[] = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getTrackerReplayer } = require('@engine/TrackerReplayer');
      return getTrackerReplayer().replacedInstrumentIds;
    } catch { return []; }
  })();
  const hasReplacedInstruments = replacedIds.length > 0;

  useEffect(() => {
    setExportWarnings([]);
    setChannelCount(exportMode === 'mod' ? 4 : 8);
  }, [exportMode]);

  // All four formats export via OpenMPT WASM (CSoundFile::SaveMod/SaveXM/SaveIT/SaveS3M)
  handlerRef.current = async () => {
    // Cinter: crunched .cinter4 (CinterConvert — tiny, no PCM, Amiga regenerates)
    // or a full rendered .mod that plays anywhere. Both reflect pattern edits.
    if (isCinterMod) {
      try {
        if (!hasNotes) { notify.error('Cinter export: this song has no pattern notes to write.'); return false; }
        if (crunched) {
          const { exportCinterCrunched } = await import('./Cinter4ModSave');
          const c = await exportCinterCrunched(patterns, instruments, patternOrder, {
            moduleName: metadata.name || 'cinter', bpm, speed, originalModBytes: originalModBytes(),
          });
          downloadBytes(c.songdata, c.filename);
          if (c.rawSamples.length > 0) downloadBytes(c.rawSamples, c.filename.replace(/\.cinter4$/, '.raw'));
          const kb = ((c.songdata.length + c.rawSamples.length) / 1024).toFixed(1);
          if (c.errors.length > 0) {
            setExportWarnings(c.errors);
            notify.warning(`Crunched "${c.filename}" (${kb} KB) — ${c.errors.length} unsupported-command warning(s).`);
          } else {
            notify.success(`Crunched "${c.filename}" (${kb} KB)${c.rawSamples.length ? ' + .raw samples' : ''}.`);
          }
        } else {
          const res = await exportCinterModFile(patterns, instruments, patternOrder, {
            stripCinter: false, moduleName: metadata.name || 'cinter',
            bpm, speed, channels: Math.min(channelCount, maxChannels),
          });
          downloadBytes(res.data, res.filename);
          notify.success(`MOD "${res.filename}" — ${res.cinterCount} Cinter voice(s), samples rendered.`);
        }
        onClose();
        return;
      } catch (err) {
        console.error('[Cinter export] failed:', err);
        notify.error(`Cinter export failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    }

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
        {isCinterMod ? 'Cinter / ProTracker MOD' : FORMAT_LABELS[exportMode]} Export (.{exportMode})
      </h3>

      {isCinterMod && (
        <div className="bg-accent-highlight/10 border border-accent-highlight/40 rounded-lg p-3 mb-3 space-y-2">
          <p className="text-xs font-mono text-accent-highlight">
            Cinter song detected ({cinterCount} synth voice{cinterCount === 1 ? '' : 's'}).
          </p>
          <label className="flex items-center gap-2 text-xs font-mono text-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={crunched}
              onChange={(e) => setCrunched(e.target.checked)}
            />
            <span>
              Crunched Cinter format (.cinter4)
              <span className="text-text-muted">
                {' '}({crunched
                  ? 'small; param words + compact music data, no PCM (Amiga regenerates)'
                  : 'unchecked: full .mod with rendered samples — plays in any MOD player'})
              </span>
            </span>
          </label>
        </div>
      )}

      {!hasNotes && !isCinterMod ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-xs font-mono text-red-300">
            No playable note data found. This format stores audio externally and cannot be exported to a tracker module.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hasReplacedInstruments && (
            <div className="bg-accent-warning/10 border border-accent-warning/30 rounded-lg p-3">
              <p className="text-xs font-mono text-text-muted">
                <span className="text-accent-warning font-bold">WARNING:</span> Instruments{' '}
                {replacedIds.join(', ')} are synth-replaced. They will export as silence in{' '}
                {exportMode.toUpperCase()} format. Save as .dbx to preserve synth assignments.
              </p>
            </div>
          )}

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
