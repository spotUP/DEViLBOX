/**
 * WasmParamEditorWrapper.tsx — Connects WasmParamEditor to a WASM engine's worklet
 *
 * Uses postMessage to request/set instrument params via the worklet's string-based API.
 * Each format's engine singleton is accessed to get the worklet port.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { WasmParamEditor, WASM_FORMAT_DESCRIPTORS } from './WasmParamEditor';
import type { SynthType } from '@/types/instrument/base';

interface WasmParamEditorWrapperProps {
  synthType: SynthType;
  instrumentCount?: number;
  instrumentNames?: string[];
}

// Map synthType to engine module + accessor
type EngineAccessor = {
  getEngine: () => { workletPort: MessagePort | null } | null;
};

const ENGINE_MAP: Record<string, () => Promise<EngineAccessor>> = {
  ActivisionProWasmSynth: async () => {
    const { ActivisionProEngine } = await import('@/engine/activisionpro/ActivisionProEngine');
    return { getEngine: () => ActivisionProEngine.hasInstance() ? getWorkletPort(ActivisionProEngine.getInstance()) : null };
  },
  FutureComposerWasmSynth: async () => {
    const { FutureComposerEngine } = await import('@/engine/futurecomposer/FutureComposerEngine');
    return { getEngine: () => FutureComposerEngine.hasInstance() ? getWorkletPort(FutureComposerEngine.getInstance()) : null };
  },
  ActionamicsWasmSynth: async () => {
    const { ActionamicsEngine } = await import('@/engine/actionamics/ActionamicsEngine');
    return { getEngine: () => ActionamicsEngine.hasInstance() ? getWorkletPort(ActionamicsEngine.getInstance()) : null };
  },
  SoundControlWasmSynth: async () => {
    const { SoundControlEngine } = await import('@/engine/soundcontrol/SoundControlEngine');
    return { getEngine: () => SoundControlEngine.hasInstance() ? getWorkletPort(SoundControlEngine.getInstance()) : null };
  },
  FaceTheMusicWasmSynth: async () => {
    const { FaceTheMusicEngine } = await import('@/engine/facethemusic/FaceTheMusicEngine');
    return { getEngine: () => FaceTheMusicEngine.hasInstance() ? getWorkletPort(FaceTheMusicEngine.getInstance()) : null };
  },
  QuadraComposerWasmSynth: async () => {
    const { QuadraComposerEngine } = await import('@/engine/quadracomposer/QuadraComposerEngine');
    return { getEngine: () => QuadraComposerEngine.hasInstance() ? getWorkletPort(QuadraComposerEngine.getInstance()) : null };
  },
  DssWasmSynth: async () => {
    const { DssEngine } = await import('@/engine/dss/DssEngine');
    return { getEngine: () => DssEngine.hasInstance() ? getWorkletPort(DssEngine.getInstance()) : null };
  },
  SynthesisWasmSynth: async () => {
    const { SynthesisEngine } = await import('@/engine/synthesis/SynthesisEngine');
    return { getEngine: () => SynthesisEngine.hasInstance() ? getWorkletPort(SynthesisEngine.getInstance()) : null };
  },
  SoundFactory2WasmSynth: async () => {
    const { SoundFactory2Engine } = await import('@/engine/soundfactory/SoundFactory2Engine');
    return { getEngine: () => SoundFactory2Engine.hasInstance() ? getWorkletPort(SoundFactory2Engine.getInstance()) : null };
  },
  OktalyzerWasmSynth: async () => {
    const { OktalyzerEngine } = await import('@/engine/oktalyzer/OktalyzerEngine');
    return { getEngine: () => OktalyzerEngine.hasInstance() ? getWorkletPort(OktalyzerEngine.getInstance()) : null };
  },
};

// Helper: engines store workletNode privately, but we need the port.
// All engines follow the pattern: this.workletNode?.port
// We access it via the engine's output node (connected to workletNode)
function getWorkletPort(engine: unknown): { workletPort: MessagePort | null } {
  // All engines have a private workletNode. Access via any public path or reflection.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = engine as any;
  const node = e.workletNode as AudioWorkletNode | null;
  return { workletPort: node?.port ?? null };
}

export const WasmParamEditorWrapper: React.FC<WasmParamEditorWrapperProps> = ({
  synthType,
  instrumentCount: propCount,
  instrumentNames,
}) => {
  const descriptor = WASM_FORMAT_DESCRIPTORS[synthType];
  const [paramCache, setParamCache] = useState<Map<string, number>>(new Map());
  const [instrumentCount, setInstrumentCount] = useState(propCount ?? 0);
  const accessorRef = useRef<EngineAccessor | null>(null);
  const listenerRef = useRef<((ev: MessageEvent) => void) | null>(null);

  // Load engine accessor
  useEffect(() => {
    const loader = ENGINE_MAP[synthType];
    if (!loader) return;
    let cancelled = false;
    loader().then(acc => {
      if (!cancelled) accessorRef.current = acc;
    });
    return () => { cancelled = true; };
  }, [synthType]);

  // Listen for param value responses
  useEffect(() => {
    const check = () => {
      const eng = accessorRef.current?.getEngine();
      if (!eng?.workletPort) return;

      if (listenerRef.current) {
        eng.workletPort.removeEventListener('message', listenerRef.current);
      }

      const handler = (ev: MessageEvent) => {
        const data = ev.data;
        if (data.type === 'instrumentParamValue') {
          setParamCache(prev => {
            const next = new Map(prev);
            next.set(`${data.inst}:${data.param}`, data.value);
            return next;
          });
        }
        if (data.type === 'instrumentCount') {
          setInstrumentCount(data.count);
        }
      };
      listenerRef.current = handler;
      eng.workletPort.addEventListener('message', handler);
    };

    // Retry a few times since engine may not be ready yet
    check();
    const t1 = setTimeout(check, 500);
    const t2 = setTimeout(check, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [synthType]);

  const getParam = useCallback((inst: number, param: string): number | undefined => {
    return paramCache.get(`${inst}:${param}`);
  }, [paramCache]);

  const setParam = useCallback((inst: number, param: string, value: number) => {
    const eng = accessorRef.current?.getEngine();
    if (!eng?.workletPort) return;
    eng.workletPort.postMessage({ type: 'setInstrumentParam', instrument: inst, param, value });
    // Optimistic update
    setParamCache(prev => {
      const next = new Map(prev);
      next.set(`${inst}:${param}`, value);
      return next;
    });
  }, []);

  const requestAllParams = useCallback((inst: number) => {
    const eng = accessorRef.current?.getEngine();
    if (!eng?.workletPort || !descriptor) return;
    for (const p of descriptor.params) {
      eng.workletPort.postMessage({ type: 'getInstrumentParam', inst, param: p.key });
    }
  }, [descriptor]);

  if (!descriptor) {
    return <div className="p-4 text-text-muted text-sm">No editor available for {synthType}</div>;
  }

  if (descriptor.params.length === 0) {
    return (
      <div className="p-4 text-text-muted text-sm">
        {descriptor.name} — playback-only format (no editable instrument parameters)
      </div>
    );
  }

  return (
    <WasmParamEditor
      descriptor={descriptor}
      instrumentCount={instrumentCount}
      getParam={getParam}
      setParam={setParam}
      requestAllParams={requestAllParams}
      instrumentNames={instrumentNames}
    />
  );
};
