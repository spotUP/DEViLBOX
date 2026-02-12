/**
 * Switch3Way - 3-position switch control styled like hardware toggles
 */

import React from 'react';
import { useThemeStore } from '@stores';

interface Switch3WayProps<T extends string> {
  label: string;
  value: T;
  options: [T, T, T]; // [left, center, right]
  labels?: [string, string, string]; // Display labels for each position
  onChange: (value: T) => void;
  color?: string;
  title?: string;
}

// PERFORMANCE: Memoize Switch3Way to prevent re-renders
const Switch3WayComponent = <T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  color: colorProp = '#00d4aa',
  title,
}: Switch3WayProps<T>) => {
  // Theme-aware colors: use cyan for cyan-lineart theme
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const color = isCyanTheme ? '#00ffff' : colorProp;
  const inactiveColor = isCyanTheme ? '#0a6666' : '#666';

  const currentIndex = options.indexOf(value);
  const position = currentIndex === -1 ? 1 : currentIndex; // Default to center

  return (
    <div className="switch3way-container" title={title}>
      <div className="switch3way-label">{label}</div>
      <div className="switch3way-track">
        {/* Option labels */}
        <div className="switch3way-options">
          {options.map((opt, idx) => (
            <button
              key={opt}
              className={`switch3way-option ${position === idx ? 'switch3way-option-active' : ''}`}
              onClick={() => onChange(opt)}
              style={{
                color: position === idx ? color : inactiveColor,
                textShadow: position === idx ? `0 0 4px ${color}80` : 'none',
              }}
            >
              {labels ? labels[idx] : opt}
            </button>
          ))}
        </div>
        {/* Slider indicator */}
        <div
          className="switch3way-indicator"
          style={{
            left: `${(position / 2) * 100}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
    </div>
  );
};

// Export memoized version with displayName
export const Switch3Way = React.memo(Switch3WayComponent, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.label === nextProps.label &&
    prevProps.color === nextProps.color &&
    JSON.stringify(prevProps.options) === JSON.stringify(nextProps.options)
  );
}) as typeof Switch3WayComponent;

(Switch3Way as { displayName?: string }).displayName = 'Switch3Way';
