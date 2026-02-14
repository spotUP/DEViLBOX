/**
 * CanvasCamera - Pan/zoom transform helper
 *
 * Manages viewport transformation for canvas view:
 * - Pan (middle mouse drag or two-finger drag)
 * - Zoom (mouse wheel or pinch)
 * - Fit to view / reset zoom
 */

import type { CanvasCamera as CameraState } from '../../../../../types/modular';

export class CanvasCamera {
  private state: CameraState;
  private minZoom = 0.1;
  private maxZoom = 2;

  constructor(initialState?: CameraState) {
    this.state = initialState || { x: 0, y: 0, zoom: 1 };
  }

  /**
   * Get current camera state
   */
  getState(): CameraState {
    return { ...this.state };
  }

  /**
   * Set camera state
   */
  setState(state: Partial<CameraState>): void {
    this.state = {
      x: state.x ?? this.state.x,
      y: state.y ?? this.state.y,
      zoom: state.zoom ?? this.state.zoom,
    };
    this.clampZoom();
  }

  /**
   * Pan the camera by delta
   */
  pan(dx: number, dy: number): void {
    this.state.x += dx;
    this.state.y += dy;
  }

  /**
   * Zoom at a specific point (keeping that point stationary)
   */
  zoomAt(clientX: number, clientY: number, delta: number): void {
    const oldZoom = this.state.zoom;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, oldZoom * (1 + delta)));

    // Calculate world position of mouse before zoom
    const worldX = (clientX - this.state.x) / oldZoom;
    const worldY = (clientY - this.state.y) / oldZoom;

    // Update zoom
    this.state.zoom = newZoom;

    // Adjust pan to keep mouse position stationary
    this.state.x = clientX - worldX * newZoom;
    this.state.y = clientY - worldY * newZoom;
  }

  /**
   * Set zoom level
   */
  setZoom(zoom: number): void {
    this.state.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  /**
   * Reset to default view (zoom 100%, centered)
   */
  reset(): void {
    this.state = { x: 0, y: 0, zoom: 1 };
  }

  /**
   * Fit all modules in view
   */
  fitToView(modules: Array<{ position?: { x: number; y: number } }>, viewportWidth: number, viewportHeight: number): void {
    if (modules.length === 0) {
      this.reset();
      return;
    }

    // Find bounding box of all modules
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    modules.forEach((module) => {
      const pos = module.position || { x: 0, y: 0 };
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + 200); // Assume ~200px module width
      maxY = Math.max(maxY, pos.y + 300); // Assume ~300px module height
    });

    // Calculate zoom to fit
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const zoomX = viewportWidth / (contentWidth + 100); // +100 for padding
    const zoomY = viewportHeight / (contentHeight + 100);
    const zoom = Math.min(zoomX, zoomY, this.maxZoom);

    // Center the content
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.state.zoom = zoom;
    this.state.x = viewportWidth / 2 - centerX * zoom;
    this.state.y = viewportHeight / 2 - centerY * zoom;
  }

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.state.x) / this.state.zoom,
      y: (screenY - this.state.y) / this.state.zoom,
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.state.zoom + this.state.x,
      y: worldY * this.state.zoom + this.state.y,
    };
  }

  /**
   * Get CSS transform string
   */
  getCSSTransform(): string {
    return `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.zoom})`;
  }

  /**
   * Clamp zoom to valid range
   */
  private clampZoom(): void {
    this.state.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.state.zoom));
  }
}
