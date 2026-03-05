/**
 * PixiApp — Top-level React component for the WebGL rendering path.
 * Creates a PixiJS v8 Application filling the viewport, loads fonts,
 * and renders the PixiRoot layout container.
 */

import { useRef, useState, useEffect } from 'react';
import { Application, extend, useApplication } from '@pixi/react';
import { GLRenderer } from '../ui/renderer-context';
import { Container, Graphics, BitmapText, Sprite, Text } from 'pixi.js';
import '@pixi/layout'; // Side-effect: registers layout mixin on Container
import { setYoga, setYogaConfig } from '@pixi/layout';
import { LayoutContainer } from '@pixi/layout/components';
import { loadYoga } from 'yoga-layout/load';
import { loadPixiFonts } from './fonts';
import { usePixiTheme } from './theme';
import { PixiRoot } from './PixiRoot';
import { attachFPSLimiter, setIsPlayingFn } from './performance';
import { setScrollPerfApp } from './scrollPerf';
import { useTransportStore } from '@stores';

// Register PixiJS classes for use in @pixi/react JSX
extend({ Container, Graphics, BitmapText, Sprite, Text, LayoutContainer });

/**
 * Shared promise for Yoga WASM + font initialization.
 * Ensures React Strict Mode double-invocation waits for the same operation
 * instead of loading Yoga twice (which would mix WASM Node instances and
 * cause "Expected null or instance of Node" BindingErrors).
 *
 * Yoga is stored on `window` so the reference survives Vite HMR module
 * reloads — if the PixiApp module is hot-replaced, `initPromise` resets to
 * null but `window.__pixiYogaInstance` still holds the original WASM module.
 * We re-call setYoga with the SAME instance rather than creating a new one,
 * preventing the "old tree nodes (instance A) + new child node (instance B)"
 * mismatch that triggers the Emscripten BindingError.
 */
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __pixiYogaInstance?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __pixiYogaConfig?: any;
  }
}

let initPromise: Promise<void> | null = null;

/**
 * Monkey-patch Yoga Node prototype to guard insertChild/removeChild against
 * BindingErrors caused by stale/freed nodes during React reconciliation.
 * The error "Expected null or instance of Node, got an instance of Node"
 * occurs when @pixi/layout tries to reparent a Yoga node that was freed
 * or belongs to a different WASM instance.
 */
function patchYogaNodePrototype(yoga: any): void {
  if (yoga.__nodePatched) return;
  yoga.__nodePatched = true;

  const configObj = yoga.Config.create();
  const sampleNode = yoga.Node.create(configObj);
  const proto = Object.getPrototypeOf(sampleNode);
  sampleNode.free();
  configObj.free();

  if (!proto) return;

  const origInsert = proto.insertChild;
  const origRemove = proto.removeChild;

  if (origInsert) {
    proto.insertChild = function safeInsertChild(child: any, index: number) {
      try {
        return origInsert.call(this, child, index);
      } catch (e: any) {
        if (e?.name === 'BindingError') return;
        throw e;
      }
    };
  }
  if (origRemove) {
    proto.removeChild = function safeRemoveChild(child: any) {
      try {
        return origRemove.call(this, child);
      } catch (e: any) {
        if (e?.name === 'BindingError') return;
        throw e;
      }
    };
  }

  const origFree = proto.free;
  if (origFree) {
    proto.free = function safeFree() {
      try {
        return origFree.call(this);
      } catch (e: any) {
        if (e?.name === 'BindingError') return;
        throw e;
      }
    };
  }

  const origGetParent = proto.getParent;
  if (origGetParent) {
    proto.getParent = function safeGetParent() {
      try {
        return origGetParent.call(this);
      } catch (e: any) {
        if (e?.name === 'BindingError') return null;
        throw e;
      }
    };
  }

  // Guard getChildCount and calculateLayout which also touch WASM bindings
  for (const method of ['getChildCount', 'getChild', 'calculateLayout', 'getComputedLayout'] as const) {
    const orig = proto[method];
    if (orig) {
      proto[method] = function safeguarded(...args: any[]) {
        try {
          return orig.apply(this, args);
        } catch (e: any) {
          if (e?.name === 'BindingError') {
            if (method === 'getChildCount') return 0;
            if (method === 'getComputedLayout') return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
            return null;
          }
          throw e;
        }
      };
    }
  }
}

function initPixiLayout(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      let yoga = window.__pixiYogaInstance;
      if (!yoga) {
        yoga = await loadYoga();
        window.__pixiYogaInstance = yoga;
      }
      // Guard Yoga node ops against BindingErrors from stale nodes
      patchYogaNodePrototype(yoga);
      // Always re-set so @pixi/layout uses the instance even after HMR
      setYoga(yoga);
      // Reuse the same Config object across HMR reloads. Creating a new Config
      // each time causes BindingErrors: existing layout nodes were built with
      // the old Config instance, so the next layout update (e.g. pressing play)
      // triggers "Expected null or instance of Node, got an instance of Node".
      if (!window.__pixiYogaConfig) {
        window.__pixiYogaConfig = yoga.Config.create();
      }
      setYogaConfig(window.__pixiYogaConfig);
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
    <GLRenderer>
      <div ref={containerRef} className="h-screen w-screen" style={{ overflow: 'hidden' }}>
        <Application
          preference="webgl"
          backgroundAlpha={1}
          backgroundColor={0x0a0a0b}
          antialias
          autoDensity
          resolution={window.devicePixelRatio || 1}
          resizeTo={window}
          preserveDrawingBuffer
          className="pixi-canvas"
        >
          <PixiAppContent />
        </Application>
      </div>
    </GLRenderer>
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
    setScrollPerfApp(app);
    return attachFPSLimiter(app);
  }, [app]);

  return <PixiRoot />;
};
