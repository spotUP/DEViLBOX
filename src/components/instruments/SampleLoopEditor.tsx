/**
 * SampleLoopEditor - Loop controls extracted from SampleEditor.
 *
 * Renders the loop enable checkbox, forward/pingpong type selector,
 * auto-find button, and loop start/end sliders.
 */

import React from 'react';
import { Repeat } from 'lucide-react';
import type { LoopType } from '../../hooks/useSampleEditorState';

interface SampleLoopEditorProps {
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  loopType: LoopType;
  updateParam: (key: string, value: string | number | boolean | null) => void;
  doFindLoop: () => void;
  doSnapLoopToZero: () => void;
}

export const SampleLoopEditor: React.FC<SampleLoopEditorProps> = ({
  loopEnabled, loopStart, loopEnd, loopType, updateParam, doFindLoop, doSnapLoopToZero,
}) => (
  <div className="border-t border-dark-border pt-3">
    <div className="flex items-center gap-3 mb-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={loopEnabled}
          onChange={(e) => {
            const enabled = e.target.checked;
            // When enabling the loop, if the loop region is still at the
            // defaults (0..1), set it to a visible region (25%..75%) so
            // the loop handles are obvious and draggable instead of being
            // hidden behind the start/end handles at the canvas corners.
            if (enabled && loopStart === 0 && loopEnd === 1) {
              updateParam('loopStart', 0.25);
              updateParam('loopEnd', 0.75);
            }
            updateParam('loopEnabled', enabled);
            e.target.blur();
          }}
          className="w-4 h-4 rounded"
        />
        <Repeat size={14} className="text-blue-400" />
        <span className="font-mono text-text-secondary text-xs">LOOP</span>
      </label>

      {loopEnabled && (
        <>
          <div className="flex items-center gap-0.5 bg-dark-bgSecondary rounded border border-dark-border p-0.5 ml-2">
            <button
              onClick={() => updateParam('loopType', 'forward')}
              className={
                'px-2 py-0.5 rounded text-[10px] font-mono transition-colors ' +
                (loopType === 'forward' || !loopType ? 'bg-blue-500/30 text-blue-400' : 'text-text-muted hover:bg-white/5')
              }
              title="Forward loop"
            >{'\u2192'}</button>
            <button
              onClick={() => updateParam('loopType', 'pingpong')}
              className={
                'px-2 py-0.5 rounded text-[10px] font-mono transition-colors ' +
                (loopType === 'pingpong' ? 'bg-blue-500/30 text-blue-400' : 'text-text-muted hover:bg-white/5')
              }
              title="Ping-pong loop"
            >{'\u2194'}</button>
          </div>
          <button
            onClick={doSnapLoopToZero}
            className="px-2 py-0.5 rounded text-[10px] font-mono text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors ml-auto"
            title="Snap loop start and end to nearest zero crossings (eliminates click/pop at the seam)"
          >Snap 0</button>
          <button
            onClick={doFindLoop}
            className="px-2 py-0.5 rounded text-[10px] font-mono text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
            title="Auto-find best loop point"
          >Auto</button>
        </>
      )}
    </div>

    {loopEnabled && (
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-text-muted text-xs mb-1">
            {'LOOP START: '}<span className="text-blue-400">{(loopStart * 100).toFixed(1)}%</span>
          </label>
          <input
            type="range" min="0" max="0.99" step="0.001" value={loopStart}
            onChange={(e) => updateParam('loopStart', Math.min(parseFloat(e.target.value), loopEnd - 0.01))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block font-mono text-text-muted text-xs mb-1">
            {'LOOP END: '}<span className="text-blue-400">{(loopEnd * 100).toFixed(1)}%</span>
          </label>
          <input
            type="range" min="0.01" max="1" step="0.001" value={loopEnd}
            onChange={(e) => updateParam('loopEnd', Math.max(parseFloat(e.target.value), loopStart + 0.01))}
            className="w-full"
          />
        </div>
      </div>
    )}
  </div>
);
