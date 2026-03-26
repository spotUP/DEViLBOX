/**
 * lucideToTexture — Renders Lucide icon SVG paths into PixiJS Textures.
 *
 * Lucide icons export as arrays of [tagName, { d, key, ... }] tuples.
 * This utility converts them to SVG strings, draws them to a canvas,
 * and creates Pixi Textures that can be used as Sprite textures.
 *
 * Usage:
 *   import { getLucideTexture } from '@/pixi/utils/lucideToTexture';
 *   import { Volume2 } from 'lucide-static'; // or extract __iconNode
 *
 *   // In a component:
 *   const tex = getLucideTexture('volume-2', Volume2IconNode, 16, 0xffffff);
 *   <pixiSprite texture={tex} />
 */

import { Texture } from 'pixi.js';

type IconNode = [string, Record<string, string>][];

// Cache textures by key (name + size + color)
const textureCache = new Map<string, Texture>();

/**
 * Build an SVG string from Lucide icon node data.
 * Lucide icons are 24x24 viewBox with stroke-based paths.
 */
function buildSVG(iconNode: IconNode, size: number, color: string): string {
  const elements = iconNode.map(([tag, attrs]) => {
    const attrStr = Object.entries(attrs)
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ');
    return `<${tag} ${attrStr} />`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${elements}</svg>`;
}

/**
 * Convert an SVG string to a PixiJS Texture via canvas.
 * Falls back to a 1-tick deferred draw if the image isn't immediately complete,
 * then updates the texture source so existing sprites refresh.
 */
function svgToTexture(svg: string, size: number): Texture {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;

  const ctx = canvas.getContext('2d')!;
  const img = new Image();
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  img.src = dataUrl;

  // Draw synchronously if image is cached (common for data URLs)
  if (img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, size * dpr, size * dpr);
  } else {
    // Async fallback — draw once the image loads, then update the texture source
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size * dpr, size * dpr);
      // Force Pixi to re-upload the canvas texture to GPU
      texture.source.update();
    };
  }

  const texture = Texture.from({ resource: canvas, alphaMode: 'premultiply-alpha-on-upload' });
  return texture;
}

/**
 * Get a cached Pixi Texture for a Lucide icon.
 *
 * @param name Unique name for caching (e.g., 'volume-2')
 * @param iconNode The Lucide icon node array (from __iconNode export)
 * @param size Pixel size (default 16)
 * @param color Hex color number (default 0xffffff → '#ffffff')
 */
export function getLucideTexture(
  name: string,
  iconNode: IconNode,
  size = 16,
  color = 0xffffff,
): Texture {
  const colorStr = '#' + color.toString(16).padStart(6, '0');
  const key = `${name}-${size}-${colorStr}`;

  let tex = textureCache.get(key);
  if (tex) return tex;

  const svg = buildSVG(iconNode, size, colorStr);
  tex = svgToTexture(svg, size);
  textureCache.set(key, tex);
  return tex;
}

/**
 * Preload multiple Lucide icons asynchronously (better quality via Image.onload).
 * Returns a promise that resolves when all textures are ready.
 */
export function preloadLucideIcons(
  icons: { name: string; iconNode: IconNode; size?: number; color?: number }[],
): Promise<void> {
  return Promise.all(
    icons.map(({ name, iconNode, size = 16, color = 0xffffff }) => {
      return new Promise<void>((resolve) => {
        const colorStr = '#' + color.toString(16).padStart(6, '0');
        const key = `${name}-${size}-${colorStr}`;
        if (textureCache.has(key)) { resolve(); return; }

        const dpr = window.devicePixelRatio || 1;
        const svg = buildSVG(iconNode, size, colorStr);
        const canvas = document.createElement('canvas');
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        const ctx = canvas.getContext('2d')!;

        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, size * dpr, size * dpr);
          const tex = Texture.from({ resource: canvas, alphaMode: 'premultiply-alpha-on-upload' });
          textureCache.set(key, tex);
          resolve();
        };
        img.onerror = () => resolve(); // Fail silently
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
    }),
  ).then(() => {});
}

/** Clear all cached textures */
export function clearLucideTextureCache(): void {
  textureCache.forEach(tex => tex.destroy(true));
  textureCache.clear();
}
