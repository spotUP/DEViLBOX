/**
 * Toggle - On/Off switch control styled like hardware toggles
 */

import React from 'react';

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color?: string;
  size?: 'sm' | 'md';
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  value,
  onChange,
  color = '#00d4aa',
  size = 'md',
}) => {
  const sizes = {
    sm: { width: 36, height: 18, fontSize: 9 },
    md: { width: 44, height: 22, fontSize: 10 },
  };
  const { width, height, fontSize } = sizes[size];

  return (
    <div className="toggle-container" style={{ width: width + 10 }}>
      <div className="toggle-label" style={{ fontSize: fontSize - 1 }}>
        {label}
      </div>
      <button
        className={`toggle-switch ${value ? 'toggle-on' : 'toggle-off'}`}
        onClick={() => onChange(!value)}
        style={{
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: value ? color : '#1a1a1f',
          border: `2px solid ${value ? color : '#333'}`,
        }}
      >
        <div
          className="toggle-thumb"
          style={{
            width: height - 6,
            height: height - 6,
            borderRadius: '50%',
            backgroundColor: value ? '#fff' : '#666',
            transform: `translateX(${value ? width - height + 2 : 0}px)`,
            transition: 'transform 0.15s ease-out, background-color 0.15s',
            boxShadow: value ? `0 0 6px ${color}` : 'none',
          }}
        />
      </button>
    </div>
  );
};
