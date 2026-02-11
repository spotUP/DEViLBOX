/**
 * BpmSyncControl — Compact inline control for BPM-synced effect parameters.
 *
 * Shows a SYNC toggle, note-division dropdown, and computed ms display.
 */

import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useTransportStore } from '@stores/useTransportStore';
import {
  SYNC_DIVISIONS,
  bpmToMs,
  type SyncDivision,
} from '@engine/bpmSync';

interface BpmSyncControlProps {
  /** Current bpmSync value (0 or 1) */
  bpmSync: number;
  /** Current syncDivision value */
  syncDivision: SyncDivision;
  /** Called when user toggles sync on/off */
  onToggleSync: (enabled: boolean) => void;
  /** Called when user selects a new division */
  onChangeDivision: (division: SyncDivision) => void;
}

export const BpmSyncControl: React.FC<BpmSyncControlProps> = ({
  bpmSync,
  syncDivision,
  onToggleSync,
  onChangeDivision,
}) => {
  const bpm = useTransportStore((s) => s.bpm);
  const isOn = bpmSync === 1;

  const computedMs = useMemo(
    () => (isOn ? bpmToMs(bpm, syncDivision) : null),
    [isOn, bpm, syncDivision],
  );

  // Group divisions for the dropdown
  const grouped = useMemo(() => {
    const groups: Record<string, typeof SYNC_DIVISIONS> = {};
    for (const d of SYNC_DIVISIONS) {
      (groups[d.category] ??= []).push(d);
    }
    return groups;
  }, []);

  return (
    <div className="flex items-center gap-2 mt-2">
      {/* SYNC toggle */}
      <button
        onClick={() => onToggleSync(!isOn)}
        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide transition-colors ${
          isOn
            ? 'bg-emerald-600 text-white'
            : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
        }`}
        title={isOn ? 'BPM sync ON — click to disable' : 'Enable BPM sync'}
      >
        <Clock size={12} />
        Sync
      </button>

      {isOn && (
        <>
          {/* Division dropdown */}
          <select
            value={syncDivision}
            onChange={(e) => onChangeDivision(e.target.value as SyncDivision)}
            className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 border border-gray-700 focus:outline-none focus:border-emerald-500"
          >
            {Object.entries(grouped).map(([cat, divs]) => (
              <optgroup key={cat} label={cat}>
                {divs.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Computed ms readout */}
          {computedMs !== null && (
            <span className="text-[10px] text-emerald-400 font-mono tabular-nums">
              {computedMs < 1000
                ? `${Math.round(computedMs)}ms`
                : `${(computedMs / 1000).toFixed(2)}s`}
            </span>
          )}
        </>
      )}
    </div>
  );
};
