import { useEffect, useMemo, useState, type RefObject } from 'react';

export interface HiDpiCanvasSize {
  /** Displayed width in CSS pixels (drawing coordinates). */
  width: number;
  /** Displayed height in CSS pixels (drawing coordinates). */
  height: number;
  dpr: number;
}

const currentDpr = (): number => (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

/**
 * Tracks a canvas's displayed CSS size and the device pixel ratio, so the
 * backing store can match the screen 1:1. Reacts to element resize and to
 * dpr changes (window moved between a retina and a non-retina screen, zoom).
 * Until the first measurement the fallback size is returned.
 */
export function useHiDpiCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  fallbackWidth: number,
  fallbackHeight: number,
): HiDpiCanvasSize {
  const [cssSize, setCssSize] = useState<{ width: number; height: number } | null>(null);
  const [dpr, setDpr] = useState(currentDpr);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      setCssSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef]);

  useEffect(() => {
    // A resolution query matches only the current dpr; its change event fires when dpr moves.
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(currentDpr());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [dpr]);

  const width = cssSize?.width ?? fallbackWidth;
  const height = cssSize?.height ?? fallbackHeight;
  // Stable identity: callers list the size in effect/callback deps.
  return useMemo(() => ({ width, height, dpr }), [width, height, dpr]);
}

/**
 * Sizes the backing store to cssSize*dpr (only when it changed, since assigning
 * width clears the canvas) and scales the context so drawing uses CSS pixels.
 */
export function prepareHiDpiCanvas(
  canvas: HTMLCanvasElement,
  { width, height, dpr }: HiDpiCanvasSize,
): CanvasRenderingContext2D | null {
  const bw = Math.round(width * dpr);
  const bh = Math.round(height * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
