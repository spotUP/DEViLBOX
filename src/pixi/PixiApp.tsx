/**
 * PixiApp — Top-level React component for the WebGL rendering path.
 * Creates a PixiJS v8 Application filling the viewport, loads fonts,
 * and renders the PixiRoot layout container.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Application, extend, useApplication } from '@pixi/react';
import { Container, Graphics, BitmapText, Sprite, Text } from 'pixi.js';
import '@pixi/layout'; // Side-effect: registers layout mixin on Container
import { loadPixiFonts } from './fonts';
import { usePixiTheme } from './theme';
import { PixiRoot } from './PixiRoot';

// Register PixiJS classes for use in @pixi/react JSX
extend({ Container, Graphics, BitmapText, Sprite, Text });

/** Props for PixiApp */
interface PixiAppProps {
  /** Callback to switch back to DOM mode */
  onSwitchToDom?: () => void;
}

export const PixiApp: React.FC<PixiAppProps> = ({ onSwitchToDom }) => {
  const [fontsReady, setFontsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load MSDF fonts on mount
  useEffect(() => {
    loadPixiFonts().then(() => setFontsReady(true));
  }, []);

  if (!fontsReady) {
    return (
      <div
        ref={containerRef}
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: '#0a0a0b' }}
      >
        <span style={{ color: '#606068', fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
          Loading WebGL UI...
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-screen w-screen" style={{ overflow: 'hidden' }}>
      <Application
        preference="webgl"
        backgroundAlpha={1}
        backgroundColor={0x0a0a0b}
        antialias
        autoDensity
        resolution={window.devicePixelRatio || 1}
        resizeTo={containerRef}
        roundPixels
      >
        <PixiAppContent onSwitchToDom={onSwitchToDom} />
      </Application>
    </div>
  );
};

/**
 * Inner content component — rendered inside the Application context,
 * so it has access to useApplication().
 */
const PixiAppContent: React.FC<{ onSwitchToDom?: () => void }> = ({ onSwitchToDom }) => {
  const { app } = useApplication();
  const theme = usePixiTheme();

  // Update background color when theme changes
  useEffect(() => {
    if (app?.renderer) {
      app.renderer.background.color = theme.bg.color;
    }
  }, [app, theme.bg.color]);

  return <PixiRoot onSwitchToDom={onSwitchToDom} />;
};
