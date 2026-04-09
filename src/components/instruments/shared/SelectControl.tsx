/**
 * SelectControl — Labeled dropdown select for indexed options.
 * Replaces inline copies in TalNoizeMakerControls and SynthV1Controls.
 */

import React from 'react';
import { CustomSelect } from '@components/common/CustomSelect';

interface SelectControlProps {
  label: string;
  value: number;
  options: string[];
  onChange: (v: number) => void;
}

export const SelectControl: React.FC<SelectControlProps> = ({ label, value, options, onChange }) => (
  <div className="flex flex-col gap-1">
    <label className="text-text-muted text-[10px]">{label}</label>
    <CustomSelect
      className="bg-dark-bgSecondary text-text-primary border border-dark-border rounded px-1 py-0.5 text-[10px]"
      value={String(Math.round(value))}
      onChange={(v) => onChange(Number(v))}
      options={options.map((n, i) => ({ value: String(i), label: n }))}
    />
  </div>
);
