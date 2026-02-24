/**
 * ISFCanvas — WebGL canvas rendering ISF shaders for the VJ view.
 *
 * Self-contained component with its own WebGL context.
 * Receives audio data from AudioDataBus and passes as uniforms.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ISFEngine, type AudioUniforms } from '@engine/vj/isf/ISFEngine';
import { ISF_PRESETS } from '@engine/vj/isf/ISFPresets';
import { AudioDataBus } from '@engine/vj/AudioDataBus';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ISFCanvasHandle {
  nextPreset: () => void;
  prevPreset: () => void;
  randomPreset: () => void;
  loadPresetByIndex: (idx: number) => void;
  loadPresetByName: (name: string) => void;
  getPresetNames: () => string[];
  getCurrentIndex: () => number;
}

interface ISFCanvasProps {
  onReady?: (presetCount: number) => void;
  onPresetChange?: (idx: number, name: string) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const ISFCanvas = React.forwardRef<ISFCanvasHandle, ISFCanvasProps>(
  ({ onReady, onPresetChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<ISFEngine | null>(null);
    const audioBusRef = useRef<AudioDataBus | null>(null);
    const rafRef = useRef<number>(0);
    const currentIdxRef = useRef(0);
    const [ready, setReady] = useState(false);

    // Init engine
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        const engine = new ISFEngine(canvas);
        engineRef.current = engine;

        // Load first preset
        if (ISF_PRESETS.length > 0) {
          const startIdx = Math.floor(Math.random() * ISF_PRESETS.length);
          engine.loadPreset(ISF_PRESETS[startIdx]);
          currentIdxRef.current = startIdx;
        }

        const bus = new AudioDataBus();
        bus.enable();
        audioBusRef.current = bus;

        setReady(true);
        onReady?.(ISF_PRESETS.length);
        if (ISF_PRESETS.length > 0) {
          onPresetChange?.(currentIdxRef.current, ISF_PRESETS[currentIdxRef.current].name);
        }
      } catch (err) {
        console.error('[ISFCanvas] Failed to initialize:', err);
      }

      return () => {
        engineRef.current?.dispose();
        audioBusRef.current?.disable();
        cancelAnimationFrame(rafRef.current);
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Render loop
    useEffect(() => {
      if (!ready) return;
      const render = () => {
        const engine = engineRef.current;
        const bus = audioBusRef.current;
        if (engine) {
          if (bus) {
            bus.update();
            const data = bus.getFrame();
            const audioUniforms: AudioUniforms = {
              audio_bass: data.subEnergy * 0.5 + data.bassEnergy * 0.5,
              audio_mid: data.midEnergy,
              audio_high: data.highEnergy,
              audio_level: data.rms,
              audio_beat: data.beat ? 1.0 : 0.0,
            };
            engine.setAudioUniforms(audioUniforms);
          }
          engine.draw();
        }
        rafRef.current = requestAnimationFrame(render);
      };
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [ready]);

    // Resize handling
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !engineRef.current) return;
      const handleResize = () => {
        const w = canvas.clientWidth * devicePixelRatio;
        const h = canvas.clientHeight * devicePixelRatio;
        engineRef.current?.resize(w, h);
      };
      handleResize();
      const observer = new ResizeObserver(handleResize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [ready]);

    const doLoadPreset = useCallback((idx: number) => {
      const preset = ISF_PRESETS[idx];
      if (preset && engineRef.current) {
        engineRef.current.loadPreset(preset);
        currentIdxRef.current = idx;
        onPresetChange?.(idx, preset.name);
      }
    }, [onPresetChange]);

    // Expose imperative API
    React.useImperativeHandle(ref, () => ({
      nextPreset: () => {
        if (ISF_PRESETS.length === 0) return;
        doLoadPreset((currentIdxRef.current + 1) % ISF_PRESETS.length);
      },
      prevPreset: () => {
        if (ISF_PRESETS.length === 0) return;
        doLoadPreset((currentIdxRef.current - 1 + ISF_PRESETS.length) % ISF_PRESETS.length);
      },
      randomPreset: () => {
        if (ISF_PRESETS.length === 0) return;
        doLoadPreset(Math.floor(Math.random() * ISF_PRESETS.length));
      },
      loadPresetByIndex: (idx: number) => doLoadPreset(idx),
      loadPresetByName: (name: string) => {
        const idx = ISF_PRESETS.findIndex(p => p.name === name);
        if (idx >= 0) doLoadPreset(idx);
      },
      getPresetNames: () => ISF_PRESETS.map(p => p.name),
      getCurrentIndex: () => currentIdxRef.current,
    }), [doLoadPreset]);

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'auto' }}
      />
    );
  }
);
ISFCanvas.displayName = 'ISFCanvas';
