/**
 * PixiIsolatedWrapper — Renders individual Pixi GT Ultra components in isolation.
 * Provides a minimal Pixi Application context for the component to render in.
 */

import React from 'react';

interface Props {
  name: string;
  width: number;
  height: number;
}

// For now, show a placeholder — full Pixi isolation requires the PixiApp context
// which is too heavy to instantiate per-component. The user should compare by
// loading the full app in WebGL mode.
export const PixiIsolatedWrapper: React.FC<Props> = ({ name, width, height }) => {
  return (
    <div style={{
      width, height, background: '#0d0d0d', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: '#44445a', textAlign: 'center', padding: 24,
    }}>
      <div>
        Pixi component: <span style={{ color: '#6366f1' }}>{name}</span>
        <br /><br />
        <span style={{ fontSize: 9 }}>
          Pixi components require the full PixiJS Application context.
          <br />
          Use the "Full Views" tab to compare the complete app in DOM vs WebGL mode.
          <br /><br />
          Or load a GT Ultra .sng file and switch between DOM/WebGL in the main app settings.
        </span>
      </div>
    </div>
  );
};
