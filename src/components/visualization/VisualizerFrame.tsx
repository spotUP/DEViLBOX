/**
 * VisualizerFrame - Hardware-style display frame
 *
 * Wraps audio visualizers in a realistic recessed bezel with:
 * - Recessed groove shadow (like hardware synth panel cutouts)
 * - Subtle vignette for depth
 * - 6px border radius matching hardware aesthetics
 */

import React from 'react';

interface VisualizerFrameProps {
  children: React.ReactNode;
  className?: string;
  /** Style variant */
  variant?: 'default' | 'compact' | 'large';
  /** Override height */
  style?: React.CSSProperties;
}

export const VisualizerFrame: React.FC<VisualizerFrameProps> = ({
  children,
  className = '',
  variant = 'default',
  style,
}) => {
  return (
    <div
      className={`viz-frame viz-frame--${variant} ${className}`}
      style={style}
    >
      {/* Display content */}
      <div className="viz-frame__content">
        {children}
      </div>
      {/* Vignette overlay */}
      <div className="viz-frame__vignette" />
    </div>
  );
};
