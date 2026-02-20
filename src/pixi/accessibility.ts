/**
 * PixiJS Accessibility Utilities
 *
 * PixiJS v8 AccessibilitySystem creates shadow DOM elements that overlay
 * interactive display objects with ARIA attributes, enabling screen reader
 * navigation.
 *
 * These helpers set the appropriate accessible properties on display objects.
 */

import type { Container } from 'pixi.js';

/**
 * Make a container accessible as a button.
 */
export function makeAccessibleButton(
  container: Container,
  label: string,
  hint?: string,
): void {
  container.accessible = true;
  container.accessibleType = 'button';
  container.accessibleTitle = label;
  if (hint) {
    container.accessibleHint = hint;
  }
}

/**
 * Make a container accessible as a slider (for knobs and sliders).
 */
export function makeAccessibleSlider(
  container: Container,
  label: string,
  value: number,
  min: number,
  max: number,
): void {
  container.accessible = true;
  container.accessibleType = 'input' as keyof HTMLElementTagNameMap;
  container.accessibleTitle = `${label}: ${value}`;
  container.accessibleHint = `Range ${min} to ${max}`;
}

/**
 * Make a container accessible as a generic interactive element.
 */
export function makeAccessible(
  container: Container,
  label: string,
  type: keyof HTMLElementTagNameMap = 'button',
): void {
  container.accessible = true;
  container.accessibleType = type;
  container.accessibleTitle = label;
}

/**
 * Touch-friendly hit area expansion.
 * Ensures interactive elements have a minimum 44x44px hit area for mobile.
 */
export const MIN_TOUCH_TARGET = 44;

export function ensureTouchTarget(
  container: Container,
  currentWidth: number,
  currentHeight: number,
): void {
  if (currentWidth < MIN_TOUCH_TARGET || currentHeight < MIN_TOUCH_TARGET) {
    const padX = Math.max(0, (MIN_TOUCH_TARGET - currentWidth) / 2);
    const padY = Math.max(0, (MIN_TOUCH_TARGET - currentHeight) / 2);
    // Expand hit area via padding in the layout
    const layout = (container as any).layout;
    if (layout) {
      layout.paddingLeft = Math.max(layout.paddingLeft || 0, padX);
      layout.paddingRight = Math.max(layout.paddingRight || 0, padX);
      layout.paddingTop = Math.max(layout.paddingTop || 0, padY);
      layout.paddingBottom = Math.max(layout.paddingBottom || 0, padY);
    }
  }
}
