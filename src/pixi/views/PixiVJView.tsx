/**
 * PixiVJView — VJ view for WebGL (PixiJS) mode.
 *
 * Butterchurn (and other VJ engines) need their own WebGL context, so VJView
 * renders into a hidden off-screen container. Each frame the active VJ canvas
 * is copied to a 2D display canvas → Pixi Texture → Sprite, participating in
 * the Pixi scene graph (CRT shader, etc.).
 *
 * VJ controls live inside the hidden VJView (auto-advance still works).
 * TODO: Re-expose preset controls as GL widgets.
 */

import React, { useRef, useEffect, useState } from 'react';
import { Texture } from 'pixi.js';
import type { Container as ContainerType } from 'pixi.js';
import { useTick } from '@pixi/react';
import { createRoot, type Root } from 'react-dom/client';
import { VJView } from '@components/vj/VJView';
import { useUIStore } from '@stores';

export const PixiVJView: React.FC = () => {
  const isActive = useUIStore((s) => s.activeView === 'vj');
  const containerRef = useRef<ContainerType>(null);
  const spriteRef = useRef<ContainerType>(null);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Hidden DOM container + React root for VJView
  const hiddenDivRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);

  // 2D display canvas — single texture source for Pixi
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const displayCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Pixi texture from display canvas
  const textureRef = useRef<Texture | null>(null);
  const [texVer, setTexVer] = useState(0);

  // Last known CSS-pixel dimensions
  const dimsRef = useRef({ w: 0, h: 0 });

  // Mount VJView into hidden container
  useEffect(() => {
    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;left:0;top:0;width:100vw;height:100vh;' +
      'visibility:hidden;pointer-events:none;z-index:-9999;overflow:hidden;';
    document.body.appendChild(div);
    hiddenDivRef.current = div;

    const root = createRoot(div);
    root.render(React.createElement(VJView));
    rootRef.current = root;

    const dc = document.createElement('canvas');
    dc.width = 1;
    dc.height = 1;
    displayCanvasRef.current = dc;
    displayCtxRef.current = dc.getContext('2d')!;

    return () => {
      root.unmount();
      rootRef.current = null;
      div.remove();
      hiddenDivRef.current = null;
      displayCanvasRef.current = null;
      displayCtxRef.current = null;
      if (textureRef.current) {
        textureRef.current.destroy(true);
        textureRef.current = null;
      }
    };
  }, []);

  // Per-frame: active VJ canvas → display canvas → Pixi texture
  useTick(() => {
    if (!isActiveRef.current) return;

    const hiddenDiv = hiddenDivRef.current;
    const dc = displayCanvasRef.current;
    const ctx = displayCtxRef.current;
    const el = containerRef.current;
    if (!hiddenDiv || !dc || !ctx || !el) return;

    // Read Pixi container's computed layout size
    const computed = (el as any).layout?._computedLayout as
      | { width: number; height: number }
      | undefined;
    if (!computed || computed.width <= 0 || computed.height <= 0) return;

    const pw = Math.round(computed.width);
    const ph = Math.round(computed.height);

    // Resize hidden container + display canvas on dimension change
    if (pw !== dimsRef.current.w || ph !== dimsRef.current.h) {
      dimsRef.current = { w: pw, h: ph };
      hiddenDiv.style.width = `${pw}px`;
      hiddenDiv.style.height = `${ph}px`;
      dc.width = pw;
      dc.height = ph;
    }

    // Find the active VJ canvas (parent not display:none → non-zero offsetWidth)
    let src: HTMLCanvasElement | null = null;
    for (const c of hiddenDiv.querySelectorAll('canvas')) {
      if (c.offsetWidth > 0 && c.offsetHeight > 0) { src = c; break; }
    }
    if (!src || src.width === 0 || src.height === 0) return;

    // Copy active VJ canvas → 2D display canvas
    ctx.clearRect(0, 0, dc.width, dc.height);
    ctx.drawImage(src, 0, 0, dc.width, dc.height);

    // Create or update Pixi texture
    if (!textureRef.current) {
      textureRef.current = Texture.from(dc, true);
      setTexVer((v) => v + 1);
    } else {
      textureRef.current.source.update();
    }

    // Keep sprite dimensions in sync with layout
    const sprite = spriteRef.current;
    if (sprite) {
      sprite.width = pw;
      sprite.height = ph;
    }
  });

  void texVer;

  return (
    <pixiContainer ref={containerRef} layout={{ width: '100%', height: '100%' }}>
      {textureRef.current && (
        <pixiSprite ref={spriteRef} texture={textureRef.current} />
      )}
    </pixiContainer>
  );
};
