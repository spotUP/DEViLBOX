/**
 * PixiHardwareUI — Embeds JUCE WASM framebuffer hardware UIs in the Pixi scene.
 *
 * Uses an offscreen <canvas> for BGRA→RGBA blit, then uploads the canvas
 * as a Pixi Texture rendered on a Sprite. Mouse/wheel events are forwarded
 * from Pixi pointer events to the WASM module's input handlers.
 *
 * Supports: Dexed (DX7), Monique, Amsynth, OBXf, VL1, Surge, Odin2,
 * and any JUCE-based WASM UI that follows the framebuffer blit pattern.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Texture, Sprite } from 'pixi.js';
import { PixiLabel } from '../../components/PixiLabel';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';

/** Generic interface for JUCE WASM hardware UI modules */
interface WASMUIModule {
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  [key: string]: unknown;
}

interface HardwareUIDescriptor {
  /** Script URL for the Emscripten module (e.g., '/dexed/DexedUI.js') */
  scriptUrl: string;
  /** Global factory function name (e.g., 'createDexedUIModule') */
  factoryName: string;
  /** Prefix for exported C functions (e.g., 'dexed_ui' → _dexed_ui_init, _dexed_ui_tick, etc.) */
  fnPrefix: string;
  /** Whether to use DPR scaling */
  useDPR?: boolean;
}

/** Known hardware UI descriptors keyed by synthType */
const HARDWARE_UI_REGISTRY: Record<string, HardwareUIDescriptor> = {
  DX7: { scriptUrl: '/dexed/DexedUI.js', factoryName: 'createDexedUIModule', fnPrefix: 'dexed_ui' },
  Monique: { scriptUrl: '/monique/MoniqueUI.js', factoryName: 'createMoniqueUIModule', fnPrefix: 'monique_ui' },
  Amsynth: { scriptUrl: '/amsynth/AmsynthUI.js', factoryName: 'createAmsynthUIModule', fnPrefix: 'amsynth_ui' },
  OBXf: { scriptUrl: '/obxf/OBXfUI.js', factoryName: 'createOBXfUIModule', fnPrefix: 'obxf_ui' },
  VL1: { scriptUrl: '/vl1/VL1UI.js', factoryName: 'createVL1UIModule', fnPrefix: 'vl1_ui', useDPR: true },
};

interface PixiHardwareUIProps {
  synthType: string;
  instrumentId: number;
  width: number;
  height: number;
}

export const PixiHardwareUI: React.FC<PixiHardwareUIProps> = ({ synthType, instrumentId, width, height }) => {
  const spriteRef = useRef<Sprite | null>(null);
  const moduleRef = useRef<WASMUIModule | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const imgDataRef = useRef<ImageData | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const rafRef = useRef<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fbWidth, setFbWidth] = useState(0);
  const [fbHeight, setFbHeight] = useState(0);

  const descriptor = HARDWARE_UI_REGISTRY[synthType];

  // Load and initialize the WASM module
  useEffect(() => {
    if (!descriptor) {
      setError(`No hardware UI for ${synthType}`);
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        // Load script if not cached
        if (!(window as any)[descriptor.factoryName]) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = descriptor.scriptUrl;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${descriptor.scriptUrl}`));
            document.head.appendChild(script);
          });
        }

        const factory = (window as any)[descriptor.factoryName];
        if (!factory) throw new Error(`Factory ${descriptor.factoryName} not found`);

        const mod = await factory({}) as WASMUIModule;
        if (cancelled) return;
        moduleRef.current = mod;

        // Initialize
        const prefix = descriptor.fnPrefix;
        const initFn = mod[`_${prefix}_init_scaled`] as ((s: number) => void) | undefined;
        const initBasic = mod[`_${prefix}_init`] as (() => void) | undefined;

        if (descriptor.useDPR && initFn) {
          initFn(window.devicePixelRatio || 1);
        } else if (initBasic) {
          initBasic();
        }

        // Get framebuffer dimensions
        const getWidth = mod[`_${prefix}_get_width`] as (() => number) | undefined;
        const getHeight = mod[`_${prefix}_get_height`] as (() => number) | undefined;
        const w = getWidth?.() || 800;
        const h = getHeight?.() || 400;
        setFbWidth(w);
        setFbHeight(h);

        // Create offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(w, h);
        canvasRef.current = canvas;
        ctxRef.current = ctx;
        imgDataRef.current = imgData;

        // Create Pixi texture from canvas
        const texture = Texture.from({ resource: canvas });
        textureRef.current = texture;

        setLoaded(true);

        // Start render loop
        const tick = mod[`_${prefix}_tick`] as (() => void) | undefined;
        const getFb = mod[`_${prefix}_get_fb`] as (() => number) | undefined;

        const renderFrame = () => {
          if (cancelled) return;
          tick?.();
          const fbPtr = getFb?.();
          if (fbPtr && fbPtr > 0) {
            const totalPixels = w * h;
            const src = mod.HEAPU8.subarray(fbPtr, fbPtr + totalPixels * 4);
            const dst = imgData.data;
            // BGRA → RGBA byte swap
            for (let i = 0; i < totalPixels; i++) {
              const off = i * 4;
              dst[off] = src[off + 2];
              dst[off + 1] = src[off + 1];
              dst[off + 2] = src[off];
              dst[off + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);
            // Update Pixi texture
            texture.source?.update();
          }
          rafRef.current = requestAnimationFrame(renderFrame);
        };
        rafRef.current = requestAnimationFrame(renderFrame);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    };

    init();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const mod = moduleRef.current;
      if (mod) {
        const shutdown = mod[`_${descriptor.fnPrefix}_shutdown`] as (() => void) | undefined;
        shutdown?.();
      }
      textureRef.current?.destroy(true);
    };
  }, [synthType, instrumentId, descriptor]);

  // Forward pointer events to WASM
  const getLocalCoords = useCallback((e: FederatedPointerEvent): { x: number; y: number } => {
    const sprite = spriteRef.current;
    if (!sprite || !fbWidth || !fbHeight) return { x: 0, y: 0 };
    const local = sprite.toLocal(e.global);
    // Scale from display size to framebuffer size
    const scaleX = fbWidth / (sprite.width || 1);
    const scaleY = fbHeight / (sprite.height || 1);
    return { x: Math.round(local.x * scaleX), y: Math.round(local.y * scaleY) };
  }, [fbWidth, fbHeight]);

  const onPointerDown = useCallback((e: FederatedPointerEvent) => {
    const mod = moduleRef.current;
    if (!mod || !descriptor) return;
    const { x, y } = getLocalCoords(e);
    const fn = mod[`_${descriptor.fnPrefix}_on_mouse_down`] as ((x: number, y: number, mods: number) => void) | undefined;
    fn?.(x, y, 0);
  }, [descriptor, getLocalCoords]);

  const onPointerUp = useCallback((e: FederatedPointerEvent) => {
    const mod = moduleRef.current;
    if (!mod || !descriptor) return;
    const { x, y } = getLocalCoords(e);
    const fn = mod[`_${descriptor.fnPrefix}_on_mouse_up`] as ((x: number, y: number, mods: number) => void) | undefined;
    fn?.(x, y, 0);
  }, [descriptor, getLocalCoords]);

  const onPointerMove = useCallback((e: FederatedPointerEvent) => {
    const mod = moduleRef.current;
    if (!mod || !descriptor) return;
    const { x, y } = getLocalCoords(e);
    const fn = mod[`_${descriptor.fnPrefix}_on_mouse_move`] as ((x: number, y: number, mods: number) => void) | undefined;
    fn?.(x, y, 0);
  }, [descriptor, getLocalCoords]);

  const onWheel = useCallback((e: FederatedWheelEvent) => {
    const mod = moduleRef.current;
    if (!mod || !descriptor) return;
    const { x, y } = getLocalCoords(e as unknown as FederatedPointerEvent);
    const fn = mod[`_${descriptor.fnPrefix}_on_mouse_wheel`] as ((x: number, y: number, dx: number, dy: number) => void) | undefined;
    fn?.(x, y, e.deltaX, e.deltaY);
  }, [descriptor, getLocalCoords]);

  if (error) {
    return <PixiLabel text={`Hardware UI: ${error}`} size="sm" color="textMuted" />;
  }

  if (!loaded || !textureRef.current) {
    return <PixiLabel text="Loading hardware UI..." size="sm" color="textMuted" />;
  }

  // Scale framebuffer to fit available space while maintaining aspect ratio
  const scale = Math.min(width / fbWidth, height / fbHeight, 1);

  return (
    <pixiSprite
      ref={(s: Sprite | null) => { spriteRef.current = s; }}
      texture={textureRef.current}
      width={fbWidth * scale}
      height={fbHeight * scale}
      eventMode="static"
      cursor="pointer"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerUpOutside={onPointerUp}
      onPointerMove={onPointerMove}
      onWheel={onWheel}
    />
  );
};

/** Check if a synth type has a Pixi hardware UI available */
export function hasPixiHardwareUI(synthType?: string): boolean {
  return !!synthType && synthType in HARDWARE_UI_REGISTRY;
}
