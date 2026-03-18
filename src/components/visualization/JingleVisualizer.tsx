/**
 * JingleVisualizer — startup jingle visualization overlay.
 * Renders an audio-reactive animation during the DEViLBOX startup jingle.
 */

import React from 'react';

interface Props {
  height?: number;
}

export const JingleVisualizer: React.FC<Props> = ({ height = 100 }) => {
  return (
    <div
      className="w-full flex items-center justify-center"
      style={{ height }}
    >
      {/* Placeholder — jingle visualization renders here */}
    </div>
  );
};
