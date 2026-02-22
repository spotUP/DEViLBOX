/**
 * PixiApp — Top-level React component for the WebGL rendering path.
 * Creates a PixiJS v8 Application filling the viewport, loads fonts,
 * and renders the PixiRoot layout container.
 */

import { useRef, useState, useEffect } from 'react';
import { Application, extend, useApplication } from '@pixi/react';
import { Container, Graphics, BitmapText, Sprite, Text } from 'pixi.js';
import '@pixi/layout'; // Side-effect: registers layout mixin on Container
import { setYoga, setYogaConfig } from '@pixi/layout';
import { loadYoga } from 'yoga-layout/load';
import { loadPixiFonts } from './fonts';
import { usePixiTheme } from './theme';
import { PixiRoot } from './PixiRoot';
import { attachFPSLimiter } from './performance';
import { useProjectPersistence } from '@/hooks/useProjectPersistence';
import { useGlobalKeyboardHandler } from '@/hooks/useGlobalKeyboardHandler';

// Register PixiJS classes for use in @pixi/react JSX
extend({ Container, Graphics, BitmapText, Sprite, Text });

export const PixiApp: React.FC = () => {
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-save project to localStorage every 30s
  useProjectPersistence();

  // Global tracker keyboard shortcuts (cursor, transpose, octave, etc.)
  useGlobalKeyboardHandler();

  // Pre-initialize Yoga WASM and load fonts before rendering any layout nodes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Initialize Yoga WASM — must complete before any @pixi/layout node is created
      const yoga = await loadYoga();
      setYoga(yoga);
      setYogaConfig(yoga.Config.create());

      // Load MSDF bitmap fonts
      await loadPixiFonts();

      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!ready) {
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
        resizeTo={window}
        roundPixels
        preserveDrawingBuffer
        className="pixi-canvas"
      >
        <PixiAppContent />
      </Application>
    </div>
  );
};

/**
 * Inner content component — rendered inside the Application context,
 * so it has access to useApplication().
 */
const PixiAppContent: React.FC = () => {
  const { app } = useApplication();
  const theme = usePixiTheme();

  // Update background color when theme changes
  useEffect(() => {
    if (app?.renderer) {
      app.renderer.background.color = theme.bg.color;
    }
  }, [app, theme.bg.color]);

  // Attach FPS limiter — drops to 10fps when idle
  useEffect(() => {
    if (!app) return;
    return attachFPSLimiter(app);
  }, [app]);

  return <PixiRoot />;
};
