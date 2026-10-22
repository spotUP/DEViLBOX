/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * re-rebirth 808 editor: the original canvas panel (shared drawing code in
 * components/instruments/rebirth/) plus a small DOM key-map legend.
 */

import React from 'react';
import type { ReBirth808Config } from '@typedefs/instrument';
import { DrumMachinePanel } from '../rebirth/DrumMachinePanel';
import { REBIRTH_808_LAYOUT } from '../../../engine/rebirthdrums/rebirthDrumLayout';

export interface ReBirth808ControlsProps {
  config: ReBirth808Config;
  onChange: (updates: Partial<ReBirth808Config>) => void;
}

const LEGEND = REBIRTH_808_LAYOUT.voices
  .map((v) => `${v.label} ${[v.note, ...v.aliases].join('/')}`)
  .join('  |  ');

export const ReBirth808Controls: React.FC<ReBirth808ControlsProps> = ({ config, onChange }) => (
  <div className="flex flex-col gap-2 p-2">
    <DrumMachinePanel kit="808" config={{ ...config }} onChange={onChange as (u: Record<string, number>) => void} />
    <div className="text-[10px] font-mono text-text-muted">Notes: {LEGEND}</div>
  </div>
);
