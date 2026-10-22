/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 909 editor: the original canvas panel (shared drawing code in
 * components/instruments/rebirth/) plus a small DOM key-map legend.
 */

import React from 'react';
import type { ReBirth909Config } from '@typedefs/instrument';
import { DrumMachinePanel } from '../rebirth/DrumMachinePanel';
import { REBIRTH_909_LAYOUT } from '../../../engine/rebirthdrums/rebirthDrumLayout';

export interface ReBirth909ControlsProps {
  config: ReBirth909Config;
  onChange: (updates: Partial<ReBirth909Config>) => void;
}

const LEGEND = REBIRTH_909_LAYOUT.voices
  .map((v) => `${v.label} ${[v.note, ...v.aliases].join('/')}`)
  .join('  |  ');

export const ReBirth909Controls: React.FC<ReBirth909ControlsProps> = ({ config, onChange }) => (
  <div className="flex flex-col gap-2 p-2">
    <DrumMachinePanel kit="909" config={{ ...config }} onChange={onChange as (u: Record<string, number>) => void} />
    <div className="text-[10px] font-mono text-text-muted">Notes: {LEGEND}</div>
  </div>
);
