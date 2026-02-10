import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { WAMSynth } from '@engine/wam/WAMSynth';
import { Globe, RefreshCw, AlertCircle, Sliders } from 'lucide-react';
import type { InstrumentConfig, WAMConfig } from '@typedefs/instrument';

interface WAMControlsProps {
  instrument: InstrumentConfig;
  onChange: (updates: Partial<InstrumentConfig>) => void;
}

interface WAMParamInfo {
  label?: string;
  minValue?: number;
  maxValue?: number;
  defaultValue?: number;
}

export const WAMControls: React.FC<WAMControlsProps> = ({
  instrument,
  onChange,
}) => {
  const [url, setUrl] = useState(instrument.wam?.moduleUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackParams, setFallbackParams] = useState<Record<string, WAMParamInfo> | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [hasNativeGui, setHasNativeGui] = useState(false);
  const guiContainerRef = useRef<HTMLDivElement>(null);
  const engine = getToneEngine();

  // Handle parameter change from fallback sliders
  const handleParamChange = useCallback((id: string, value: number) => {
    setParamValues(prev => ({ ...prev, [id]: value }));
    const synth = engine.getInstrument(instrument.id, instrument, -1);
    if (synth instanceof WAMSynth) {
      synth.setParameter(id, value);
    }
  }, [engine, instrument]);

  // Load and mount WAM GUI
  useEffect(() => {
    let isMounted = true;
    let currentGui: HTMLElement | null = null;

    const mountGui = async () => {
      if (!guiContainerRef.current) return;

      // Clear existing GUI
      guiContainerRef.current.innerHTML = '';
      setFallbackParams(null);
      setHasNativeGui(false);

      if (!instrument.wam?.moduleUrl) {
        console.log('[WAMControls] No URL provided yet');
        return;
      }

      try {
        console.log(`[WAMControls] Attempting to mount GUI for ${instrument.wam.moduleUrl}`);
        setIsLoading(true);
        setError(null);

        // Ensure the instrument exists in the engine
        const synth = engine.getInstrument(instrument.id, instrument, -1);

        if (!(synth instanceof WAMSynth)) {
          const errorMsg = `Instrument ${instrument.id} is not a WAMSynth (got ${synth?.constructor.name})`;
          console.warn('[WAMControls]', errorMsg);
          setError(errorMsg);
          return;
        }

        console.log('[WAMControls] Waiting for WAM initialization...');
        await synth.ensureInitialized();

        if (!isMounted) return;

        console.log('[WAMControls] Creating native GUI...');
        const gui = await synth.createGui();
        if (gui && isMounted) {
          console.log('[WAMControls] GUI created, mounting to DOM');
          currentGui = gui;
          setHasNativeGui(true);
          guiContainerRef.current.appendChild(gui);
        } else if (!gui && isMounted) {
          console.warn('[WAMControls] Plugin did not provide a GUI, trying parameter discovery');
          // No native GUI — try parameter discovery for fallback UI
          try {
            const params = await synth.getParameters();
            if (params && Object.keys(params).length > 0 && isMounted) {
              setFallbackParams(params);
              const initialValues: Record<string, number> = {};
              Object.entries(params).forEach(([id, info]: [string, any]) => {
                initialValues[id] = info.defaultValue ?? info.minValue ?? 0;
              });
              setParamValues(initialValues);
            } else if (isMounted) {
              guiContainerRef.current.innerHTML =
                '<div class="text-text-muted text-xs p-4 italic">Plugin does not provide a GUI or discoverable parameters</div>';
            }
          } catch (paramErr) {
            console.warn('[WAMControls] Parameter discovery failed:', paramErr);
            if (isMounted && guiContainerRef.current) {
              guiContainerRef.current.innerHTML =
                '<div class="text-text-muted text-xs p-4 italic">Plugin does not provide a native GUI</div>';
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[WAMControls] Failed to load GUI:', err);
        if (isMounted) setError(msg);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    mountGui();

    return () => {
      isMounted = false;
      if (currentGui && currentGui.parentElement) {
        currentGui.parentElement.removeChild(currentGui);
      }
    };
  }, [instrument.id, instrument.wam?.moduleUrl, engine]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    onChange({
      wam: {
        ...instrument.wam,
        moduleUrl: trimmedUrl,
        pluginState: null, // Reset state on URL change
      } as WAMConfig
    });

    // Force engine to recreate the synth
    engine.invalidateInstrument(instrument.id);
  };

  return (
    <div className="flex flex-col h-full bg-dark-bgSecondary p-4 space-y-4 overflow-hidden">
      {/* URL Header */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
          <Globe size={14} />
          WAM Module URL
        </label>
        <form onSubmit={handleUrlSubmit} className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://cdn.example.com/wam/plugin/index.js"
            className="flex-1 bg-dark-bg border border-dark-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 text-text-inverse px-4 py-1.5 rounded text-sm font-bold transition-all flex items-center gap-2"
          >
            {isLoading ? <RefreshCw size={14} className="animate-spin" /> : 'LOAD'}
          </button>
        </form>
        <div className="text-[10px] text-text-muted space-y-0.5">
          <p className="italic">Enter a WAM 2.0 module URL above. Example sources:</p>
          <ul className="list-disc list-inside pl-1">
            <li><a href="https://github.com/webaudiomodules" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline">github.com/webaudiomodules</a> — Official WAM ecosystem</li>
            <li><a href="https://mainline.i3s.unice.fr/wam2/" target="_blank" rel="noreferrer" className="text-accent-primary hover:underline">mainline.i3s.unice.fr/wam2</a> — WAM 2.0 demo host</li>
          </ul>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-accent-error/10 border border-accent-error/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-accent-error flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-accent-error uppercase">Loading Error</h4>
            <p className="text-xs text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-dark-bg/20 rounded-xl border border-dark-border border-dashed">
          <RefreshCw size={32} className="text-accent-primary animate-spin" />
          <p className="text-sm text-text-muted font-mono animate-pulse">Initializing Web Audio Module...</p>
        </div>
      )}

      {/* GUI Container (native GUI or empty for fallback) */}
      {!isLoading && !error && instrument.wam?.moduleUrl && (hasNativeGui || !fallbackParams) && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-muted uppercase">Plugin Interface</span>
            <button
              onClick={() => engine.invalidateInstrument(instrument.id)}
              className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1"
            >
              <RefreshCw size={10} /> Reload
            </button>
          </div>
          <div
            ref={guiContainerRef}
            className="flex-1 bg-black rounded-lg border border-dark-border overflow-auto flex items-center justify-center min-h-[300px]"
          />
        </div>
      )}

      {/* Fallback Parameter UI (when plugin has no native GUI but has discoverable params) */}
      {fallbackParams && !hasNativeGui && !isLoading && !error && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-text-muted uppercase flex items-center gap-1.5">
              <Sliders size={12} />
              Plugin Parameters
            </span>
            <button
              onClick={() => engine.invalidateInstrument(instrument.id)}
              className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1"
            >
              <RefreshCw size={10} /> Reload
            </button>
          </div>
          <div className="flex-1 overflow-auto space-y-1.5 p-3 bg-dark-bg rounded-lg border border-dark-border">
            {Object.entries(fallbackParams).map(([id, info]) => {
              const min = info.minValue ?? 0;
              const max = info.maxValue ?? 1;
              const step = (max - min) > 10 ? 1 : 0.01;
              const value = paramValues[id] ?? info.defaultValue ?? min;
              return (
                <div key={id} className="flex items-center gap-3">
                  <label className="text-xs text-text-secondary w-32 truncate" title={info.label || id}>
                    {info.label || id}
                  </label>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => handleParamChange(id, parseFloat(e.target.value))}
                    className="flex-1 accent-accent-primary h-1.5"
                  />
                  <span className="text-[10px] text-text-muted w-12 text-right font-mono">
                    {value.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Hidden GUI container ref still needed for effect cleanup */}
          <div ref={guiContainerRef} className="hidden" />
        </div>
      )}

      {/* Placeholder when no URL */}
      {!instrument.wam?.moduleUrl && !isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8 bg-dark-bg/10 rounded-xl border border-dark-border border-dashed">
          <div className="p-4 rounded-full bg-dark-bgTertiary text-text-muted">
            <Globe size={48} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">No WAM Loaded</h3>
            <p className="text-sm text-text-muted max-w-xs mx-auto mt-2">
              Web Audio Modules are external plugins. Enter a URL above to load a synthesizer or effect.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
