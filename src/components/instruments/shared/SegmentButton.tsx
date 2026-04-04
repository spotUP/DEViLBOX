/**
 * SegmentButton — A row of mutually exclusive toggle buttons.
 *
 * Replaces inline copies in SetBfreeControls and ZynAddSubFXControls.
 */

import React from 'react';

interface SegmentButtonProps {
  labels: string[];
  value: number;
  onChange: (value: number) => void;
  /** Active button color class (default: 'bg-amber-600 text-black') */
  activeClass?: string;
}

export const SegmentButton: React.FC<SegmentButtonProps> = React.memo(({
  labels, value, onChange, activeClass = 'bg-amber-600 text-black',
}) => (
  <div className="flex gap-1 flex-wrap">
    {labels.map((label, i) => (
      <button
        key={label}
        onClick={() => onChange(i)}
        className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${
          Math.round(value) === i
            ? activeClass
            : 'bg-dark-bgTertiary text-text-secondary hover:bg-dark-bgHover'
        }`}
      >
        {label}
      </button>
    ))}
  </div>
));
SegmentButton.displayName = 'SegmentButton';
