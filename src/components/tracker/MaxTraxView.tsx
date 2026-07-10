/**
 * MaxTraxView — Toolbar + grid + right-panel host for the MaxTrax editor.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Toolbar (score picker, TPR zoom, Save, Export)       │
 *   ├─────────────────────────────────────────────────────┤
 *   │ MaxTraxGrid (flex-1, scrollable)                     │
 *   └─────────────────────────────────────────────────────┘
 *
 * Right panel reserved for MaxTraxControls (Task 10).
 */

import React, { useState } from 'react';
import { Button } from '@components/ui/Button';
import { CustomSelect } from '@components/common/CustomSelect';
import { useMaxTraxGrid } from '@/hooks/useMaxTraxGrid';
import { useFormatStore } from '@stores';
import { MaxTraxGrid } from './MaxTraxGrid';
import { notify } from '@stores/useNotificationStore';
import { MaxTraxControls } from '@/components/instruments/controls/MaxTraxControls';
import { decodeMaxTraxSamples } from '@/lib/import/formats/maxtrax/maxtraxFormat';

const TPR_OPTIONS = [
  { value: '12', label: '12 ticks / row' },
  { value: '24', label: '24 ticks / row' },
  { value: '48', label: '48 ticks / row' },
  { value: '96', label: '96 ticks / row' },
];

export const MaxTraxView: React.FC = () => {
  const maxTraxData = useFormatStore(s => s.maxTraxData);
  const maxTraxFileName = useFormatStore(s => s.maxTraxFileName);

  const [scoreIndex, setScoreIndex] = useState(0);
  const [tpr, setTpr] = useState(24);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);

  // Subscribe to maxTraxRev so the sample list re-decodes after a sample-field edit.
  const _maxTraxRev = useFormatStore(s => s.maxTraxRev);
  void _maxTraxRev;
  const samples = maxTraxData ? decodeMaxTraxSamples(maxTraxData) : [];
  const sampleCount = samples.length;

  const { grid, edit } = useMaxTraxGrid(scoreIndex, tpr);

  const scoreCount = maxTraxData?.scores.length ?? 0;

  const scoreOptions = scoreCount > 0
    ? Array.from({ length: scoreCount }, (_, i) => ({ value: String(i), label: `Score ${i + 1}` }))
    : [{ value: '0', label: 'Score 1' }];

  const runExportDownload = async (verb: 'save' | 'export') => {
    const capitalized = verb === 'save' ? 'Save' : 'Export';
    const past = verb === 'save' ? 'Saved' : 'Exported';
    try {
      const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
      const { downloadBytes } = await import('@lib/export/Cinter4ModSave');
      const res = await exportNativeSong(null);
      if (res) {
        downloadBytes(res.data, res.filename);
        notify.success(`${past} ${res.filename}`, 2000);
      } else {
        notify.warning(`Nothing to ${verb} — load a MaxTrax file first.`, 3000);
      }
    } catch (err) {
      console.error(`[MaxTraxView] ${verb} error`, err);
      notify.error(`${capitalized} failed — see console.`, 3000);
    }
  };

  const handleSave = () => runExportDownload('save');
  const handleExport = () => runExportDownload('export');

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-dark-border bg-dark-bgSecondary flex-shrink-0 flex-wrap">
        <span className="text-[10px] font-mono text-text-muted">MaxTrax</span>
        {maxTraxFileName && (
          <span className="text-[10px] font-mono text-text-secondary truncate max-w-[160px]" title={maxTraxFileName}>
            {maxTraxFileName}
          </span>
        )}

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-text-muted">Score</span>
          <CustomSelect
            value={String(scoreIndex)}
            onChange={v => setScoreIndex(Number(v))}
            options={scoreOptions}
            placeholder="Score"
          />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-text-muted">Zoom</span>
          <CustomSelect
            value={String(tpr)}
            onChange={v => setTpr(Number(v))}
            options={TPR_OPTIONS}
            placeholder="Ticks/row"
          />
        </div>

        {sampleCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-text-muted">Sample</span>
            <CustomSelect
              value={String(selectedSampleIndex)}
              onChange={v => setSelectedSampleIndex(Number(v))}
              options={Array.from({ length: sampleCount }, (_, i) => ({
                value: String(i),
                label: `${i + 1}: #${samples[i]?.number ?? i}`,
              }))}
              placeholder="Sample"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
          <Button variant="default" onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>

      {/* Main area: grid + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Grid */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          {grid ? (
            <MaxTraxGrid grid={grid} edit={edit} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-[10px] font-mono">
              {maxTraxData
                ? `Score ${scoreIndex + 1} has no data.`
                : 'No MaxTrax file loaded.'}
            </div>
          )}
        </div>

        {/* Right panel — MaxTraxControls */}
        <div className="w-56 flex-shrink-0 border-l border-dark-border bg-dark-bgSecondary flex flex-col min-h-0 overflow-hidden">
          <MaxTraxControls sampleIndex={selectedSampleIndex} />
        </div>
      </div>
    </div>
  );
};
