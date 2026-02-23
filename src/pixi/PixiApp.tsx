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
import { attachFPSLimiter, setIsPlayingFn } from './performance';
import { useTransportStore } from '@stores';

// Register PixiJS classes for use in @pixi/react JSX
extend({ Container, Graphics, BitmapText, Sprite, Text });

/**
 * Shared promise for Yoga WASM + font initialization.
 * Ensures React Strict Mode double-invocation waits for the same operation
 * instead of loading Yoga twice (which would mix WASM Node instances and
 * cause "Expected null or instance of Node" BindingErrors).
 */
let initPromise: Promise<void> | null = null;

function initPixiLayout(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const yoga = await loadYoga();
      setYoga(yoga);
      setYogaConfig(yoga.Config.create());
      await loadPixiFonts();
    })();
  }
  return initPromise;
}

export const PixiApp: React.FC = () => {
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // NOTE: useProjectPersistence() and useGlobalKeyboardHandler() are called
  // in the parent App.tsx. Do NOT duplicate them here — it causes double
  // keyboard event handlers (every keypress fires twice) and double auto-saves.

  // Pre-initialize Yoga WASM and load fonts before rendering any layout nodes
  useEffect(() => {
    let cancelled = false;
    initPixiLayout().then(() => {
      if (!cancelled) setReady(true);
    });
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

  // Attach FPS limiter — drops to 10fps when idle, stays at 60 during playback
  useEffect(() => {
    if (!app) return;
    setIsPlayingFn(() => useTransportStore.getState().isPlaying);
    return attachFPSLimiter(app);
  }, [app]);

  return <PixiRoot />;
};
