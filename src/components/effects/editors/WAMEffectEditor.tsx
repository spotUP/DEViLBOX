/**
 * WAM 2.0 effect editor (native GUI embed) and Generic fallback editor
 */

import React, { useEffect, useRef, useState } from 'react';
import { Knob } from '@components/controls/Knob';
import { getToneEngine } from '@engine/ToneEngine';
import { WAMEffectNode } from '@engine/wam/WAMEffectNode';
import { SectionHeader, type VisualEffectEditorProps } from './shared';

// ============================================================================
// GENERIC FALLBACK EDITOR
// ============================================================================

/** Convert camelCase key to a human-readable label */
function formatParamName(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

/** Infer parameter range heuristics (matches PixiEffectParameterEditor logic) */
function inferParamRange(_key: string, value: number): { min: number; max: number; step: number; unit: string } {
  // Negative values suggest dB range
  if (value < 0) return { min: -60, max: 12, step: 0.5, unit: 'dB' };
  // Values > 100 suggest ms/Hz range
  if (value > 100) return { min: 0, max: Math.max(value * 4, 1000), step: 1, unit: '' };
  // 0-1 normalized
  if (value >= 0 && value <= 1) return { min: 0, max: 1, step: 0.01, unit: '' };
  // 0-100 percentage-like
  return { min: 0, max: 100, step: 1, unit: '%' };
}

/** Accent color for WASM effects */
const WASM_ACCENT = '#10b981';

export const GenericEffectEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
  onUpdateWet,
}) => {
  const params = Object.entries(effect.parameters).filter(
    ([, v]) => typeof v === 'number',
  ) as [string, number][];

  return (
    <div className="space-y-4">
      {/* Parameter knobs grid */}
      {params.length > 0 && (
        <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
          <SectionHeader size="lg" color={WASM_ACCENT} title={effect.type} />
          <div className="flex flex-wrap justify-around items-end gap-y-4">
            {params.map(([key, value]) => {
              const range = inferParamRange(key, value);
              return (
                <Knob
                  key={key}
                  value={value}
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  onChange={(v) => onUpdateParameter(key, v)}
                  label={formatParamName(key)}
                  size="md"
                  color={WASM_ACCENT}
                  formatValue={(v) => {
                    if (range.max <= 1) return v.toFixed(2);
                    if (range.unit === 'dB') return `${v.toFixed(1)}dB`;
                    return `${Math.round(v)}${range.unit}`;
                  }}
                />
              );
            })}
          </div>
        </section>
      )}
      {/* Mix knob */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#6b7280"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};

// ============================================================================
// WAM 2.0 EFFECT EDITOR (Native GUI embed)
// ============================================================================

export const WAMEffectEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateWet,
}) => {
  const guiContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasGui, setHasGui] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let currentGui: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const mountGui = async () => {
      if (!guiContainerRef.current) return;
      guiContainerRef.current.innerHTML = '';
      setHasGui(false);
      setIsLoading(true);

      try {
        const engine = getToneEngine();

        // The WAM node may not exist yet — rebuildMasterEffects is async.
        // Poll until the node is available (up to ~5s).
        let node: ReturnType<typeof engine.getMasterEffectNode> = null;
        for (let attempt = 0; attempt < 25; attempt++) {
          node = engine.getMasterEffectNode(effect.id);
          if (node && node instanceof WAMEffectNode) break;
          node = null;
          await new Promise(r => setTimeout(r, 200));
          if (!isMounted) return;
        }

        if (!node || !(node instanceof WAMEffectNode)) {
          if (isMounted) setIsLoading(false);
          return;
        }

        await node.ensureInitialized();
        if (!isMounted) return;

        const gui = await node.createGui();
        if (!gui || !isMounted || !guiContainerRef.current) {
          if (isMounted) setIsLoading(false);
          return;
        }

        currentGui = gui;
        setHasGui(true);
        guiContainerRef.current.appendChild(gui);

        // Per-effect minimum scale overrides (for zoom-in requests)
        const WAM_MIN_SCALE: Record<string, number> = {
          WAMQuadraFuzz: 1.3,
          WAMVoxAmp: 1.15,
        };
        // Effects that should render at 1:1 and be centered (no zoom scaling)
        const WAM_NO_SCALE: Set<string> = new Set([
          'WAMBigMuff',
        ]);
        const effectMinScale = WAM_MIN_SCALE[effect.type] ?? 0;
        const forceNoScale = WAM_NO_SCALE.has(effect.type);

        // Try to directly resize canvas-based WAM plugins through their Shadow DOM.
        // This is the ONLY correct approach for canvas plugins that use
        // getBoundingClientRect() + event.clientX to compute mouse coordinates —
        // CSS transform/zoom changes the visual rect without updating the canvas
        // internal dimensions, making all click/drag coordinates wrong.
        const tryResizeCanvasPlugin = (container: HTMLDivElement): boolean => {
          const shadow = gui.shadowRoot;
          if (!shadow) return false;
          const canvas = shadow.querySelector('canvas') as HTMLCanvasElement | null;
          if (!canvas) return false;

          const guiAny = gui as any;
          const cw = container.clientWidth;
          if (!cw || !guiAny.width) return false;

          // Calculate new dimensions maintaining original aspect ratio
          const origW = 430; // Default WAM graphic EQ width
          const origH = 250; // Default WAM graphic EQ height
          const aspectRatio = origH / origW;
          const newWidth = cw;
          const newHeight = Math.round(newWidth * aspectRatio);

          // Resize primary canvas (interactive layer)
          canvas.width = newWidth;
          canvas.height = newHeight;

          // Resize secondary canvas (frequency analyzer) if present
          const canvas2 = shadow.querySelectorAll('canvas')[1] as HTMLCanvasElement | null;
          if (canvas2) {
            canvas2.width = newWidth;
            canvas2.height = newHeight;
          }

          // Update plugin's internal coordinate mapping
          guiAny.width = newWidth;
          guiAny.height = newHeight;
          guiAny.pixelsPerDb = (0.5 * newHeight) / (guiAny.dbScale || 60);

          // Resize the canvas parent div to match
          const canvasParent = shadow.querySelector('#DivFilterBank') as HTMLElement | null;
          if (canvasParent) {
            canvasParent.style.width = `${newWidth}px`;
            canvasParent.style.height = `${newHeight}px`;
          }

          container.style.height = `${newHeight + 20}px`;

          // Trigger plugin redraw
          if (typeof guiAny.draw === 'function') guiAny.draw();
          return true;
        };

        // Cache natural (unscaled) dimensions for CSS zoom fallback
        let naturalW = 0;
        let naturalH = 0;
        let isCanvasPlugin = false;

        const scaleToFit = () => {
          const container = guiContainerRef.current;
          if (!container || !gui) return;

          // No-scale mode: render at 1:1 and center
          if (forceNoScale) {
            (gui.style as any).zoom = '';
            gui.style.transform = '';
            gui.style.position = 'relative';
            gui.style.margin = '0 auto';
            gui.style.display = 'block';
            const h = gui.offsetHeight || gui.scrollHeight || gui.clientHeight;
            if (h) container.style.height = `${h + 8}px`;
            return;
          }

          // For canvas-based plugins, directly resize canvases (no CSS scaling)
          if (isCanvasPlugin || tryResizeCanvasPlugin(container)) {
            isCanvasPlugin = true;
            // Clear any previous CSS scaling
            (gui.style as any).zoom = '';
            gui.style.transform = '';
            tryResizeCanvasPlugin(container);
            return;
          }

          // Fallback: CSS zoom for non-canvas WAM plugins
          if (!naturalW || !naturalH) {
            (gui.style as any).zoom = '';
            gui.style.transform = '';
            gui.style.position = '';
            gui.style.left = '';
            gui.style.top = '';
            naturalW = gui.offsetWidth || gui.scrollWidth || gui.clientWidth;
            naturalH = gui.offsetHeight || gui.scrollHeight || gui.clientHeight;
            if (!naturalW || !naturalH) return;
          }

          const cw = container.clientWidth;
          if (!cw) return;

          const scale = Math.max(effectMinScale, cw / naturalW);
          const scaledH = naturalH * scale;

          container.style.height = `${Math.max(scaledH, 200)}px`;
          (gui.style as any).zoom = `${scale}`;
        };

        resizeObserver = new ResizeObserver(scaleToFit);
        resizeObserver.observe(guiContainerRef.current);
        requestAnimationFrame(scaleToFit);
        setTimeout(scaleToFit, 300);
        setTimeout(scaleToFit, 800);
        setTimeout(scaleToFit, 1500);
      } catch (err) {
        console.warn('[WAMEffectEditor] Failed to load GUI:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    mountGui();

    return () => {
      isMounted = false;
      resizeObserver?.disconnect();
      if (currentGui?.parentElement) {
        currentGui.parentElement.removeChild(currentGui);
      }
    };
  }, [effect.id]);

  return (
    <div className="space-y-4">
      {/* Native WAM GUI */}
      <div
        ref={guiContainerRef}
        className="bg-black rounded-lg border border-dark-border overflow-visible relative flex justify-center"
        style={{ minHeight: hasGui ? 200 : 0, display: hasGui || isLoading ? 'flex' : 'none' }}
      />
      {isLoading && (
        <div className="flex items-center justify-center py-8 text-text-muted text-xs">
          Loading plugin interface...
        </div>
      )}
      {!hasGui && !isLoading && (
        <div className="text-center text-text-muted text-xs py-4">
          Plugin did not provide a native GUI.
        </div>
      )}
      {/* Mix knob */}
      <section className="rounded-xl p-4 border border-dark-border bg-black/30 backdrop-blur-sm shadow-inner-dark">
        <SectionHeader size="lg" color="#6b7280" title="Mix" />
        <div className="flex justify-center">
          <Knob
            value={effect.wet}
            min={0}
            max={100}
            onChange={onUpdateWet}
            label="Mix"
            size="lg"
            color="#6b7280"
            formatValue={(v) => `${Math.round(v)}%`}
          />
        </div>
      </section>
    </div>
  );
};
