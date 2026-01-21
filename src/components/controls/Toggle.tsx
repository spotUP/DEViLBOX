/**
 * Toggle - On/Off switch control styled like hardware toggles
 */

import React from 'react';
import { useThemeStore } from '@stores';

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  title?: string;
}

// PERFORMANCE: Memoize Toggle to prevent re-renders
export const Toggle: React.FC<ToggleProps> = React.memo(({
  label,
  value,
  onChange,
  color: colorProp = '#00d4aa',
  size = 'md',
  disabled = false,
  title,
}) => {
  // Theme-aware colors: use cyan for cyan-lineart theme
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const color = isCyanTheme ? '#00ffff' : colorProp;
  const offBgColor = isCyanTheme ? '#0a1a1f' : '#1a1a1f';
  const offBorderColor = isCyanTheme ? '#0a3333' : '#333';
  const thumbOffColor = isCyanTheme ? '#0a6666' : '#666';

  const sizes = {
    sm: { width: 36, height: 18, fontSize: 9 },
    md: { width: 44, height: 22, fontSize: 10 },
  };
  const { width, height, fontSize } = sizes[size];

  return (
    <div className="toggle-container" style={{ width: width + 10, opacity: disabled ? 0.4 : 1 }}>
      <div className="toggle-label" style={{ fontSize: fontSize - 1 }}>
        {label}
      </div>
      <button
        className={`toggle-switch ${value ? 'toggle-on' : 'toggle-off'}`}
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        title={title}
        style={{
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: value ? color : offBgColor,
          border: `2px solid ${value ? color : offBorderColor}`,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div
          className="toggle-thumb"
          style={{
            width: height - 6,
            height: height - 6,
            borderRadius: '50%',
            backgroundColor: value ? '#fff' : thumbOffColor,
            transform: `translateX(${value ? width - height + 2 : 0}px)`,
            transition: 'transform 0.15s ease-out, background-color 0.15s',
            boxShadow: value ? `0 0 6px ${color}` : 'none',
          }}
        />
      </button>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.label === nextProps.label &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.color === nextProps.color &&
    prevProps.size === nextProps.size
  );
});

Toggle.displayName = 'Toggle';
