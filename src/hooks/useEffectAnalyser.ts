// src/hooks/useEffectAnalyser.ts
/**
 * useEffectAnalyser — reads pre/post AnalyserNode taps for a master effect.
 * Uses the existing useVisualizationAnimation hook for 30fps rAF loop.
 */
import { useRef, useState, useEffect } from 'react';
import { useAudioStore } from '@stores/useAudioStore';
import { useVisualizationAnimation } from './useVisualizationAnimation';

export type AnalyserMode = 'waveform' | 'fft';

interface EffectAnalyserResult {
  pre: Float32Array;
  post: Float32Array;
}

export function useEffectAnalyser(effectId: string, mode: AnalyserMode): EffectAnalyserResult {
  const FFT_SIZE = 2048;

  // Allocate arrays once — reused every frame to avoid GC pressure
  const preRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(FFT_SIZE) as Float32Array<ArrayBuffer>);
  const postRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(FFT_SIZE) as Float32Array<ArrayBuffer>);

  // Version counter to trigger re-renders when data changes
  const [, setTick] = useState(0);

  // Track whether we have any analyser (for idle detection)
  const hasAnalyserRef = useRef(false);

  useEffect(() => {
    // Reset to zeroed arrays when effectId or mode changes
    preRef.current = new Float32Array(FFT_SIZE) as Float32Array<ArrayBuffer>;
    postRef.current = new Float32Array(FFT_SIZE) as Float32Array<ArrayBuffer>;
  }, [effectId, mode]);

  useVisualizationAnimation({
    onFrame: () => {
      const engine = useAudioStore.getState().toneEngineInstance;
      const analysers = engine?.getMasterEffectAnalysers(effectId) ?? null;

      if (!analysers) {
        if (hasAnalyserRef.current) {
          hasAnalyserRef.current = false;
          preRef.current = new Float32Array(FFT_SIZE) as Float32Array<ArrayBuffer>;
          postRef.current = new Float32Array(FFT_SIZE) as Float32Array<ArrayBuffer>;
          setTick(t => t + 1);
        }
        return false; // idle
      }

      hasAnalyserRef.current = true;

      // Resize arrays if analyser bin count differs from FFT_SIZE
      const binCount = analysers.pre.frequencyBinCount;
      if (preRef.current.length !== binCount) {
        preRef.current = new Float32Array(binCount) as Float32Array<ArrayBuffer>;
        postRef.current = new Float32Array(binCount) as Float32Array<ArrayBuffer>;
      }

      if (mode === 'waveform') {
        analysers.pre.getFloatTimeDomainData(preRef.current);
        analysers.post.getFloatTimeDomainData(postRef.current);
      } else {
        analysers.pre.getFloatFrequencyData(preRef.current);
        analysers.post.getFloatFrequencyData(postRef.current);
      }

      setTick(t => t + 1);
      return true; // active
    },
    enabled: true,
  });

  return { pre: preRef.current, post: postRef.current };
}
