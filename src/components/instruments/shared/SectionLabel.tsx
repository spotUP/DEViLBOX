/**
 * SectionLabel — Shared section heading for instrument control panels.
 *
 * Replaces 19+ inline copies of the same component across instrument controls.
 */

import React from 'react';

interface SectionLabelProps {
  label: string;
  color?: string;
}

export const SectionLabel: React.FC<SectionLabelProps> = ({ label, color }) => (
  <div className="text-[10px] font-bold uppercase tracking-widest mb-2"
    style={{ color, opacity: 0.7 }}>
    {label}
  </div>
);
