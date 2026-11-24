/**
 * Which effect chain the full-screen FX editor (MasterEffectsModal) edits:
 * the master bus, or one instrument's chain. The editor is one component; only
 * the store it reads and writes differs per target.
 */
import { useAudioStore } from '@stores/useAudioStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import type { EffectConfig } from '@typedefs/instrument';

export type FxChainTarget = { kind: 'master' } | { kind: 'instrument'; instrumentId: number };

export interface FxChainActions {
  add: (effect: Omit<EffectConfig, 'id'>) => void;
  remove: (effectId: string) => void;
  update: (effectId: string, updates: Partial<EffectConfig>) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  /** Replace the whole chain. Gain compensation applies to the master bus only. */
  setAll: (effects: EffectConfig[], gainCompensationDb?: number) => void;
  /** The chain as the store holds it right now (after a write). */
  read: () => EffectConfig[];
}

export const MASTER_FX_TARGET: FxChainTarget = { kind: 'master' };
const EMPTY: EffectConfig[] = [];

/** The target's chain, subscribed. */
export function useFxChainEffects(target: FxChainTarget): EffectConfig[] {
  const master = useAudioStore((s) => s.masterEffects);
  const instrumentFx = useInstrumentStore((s) =>
    target.kind === 'instrument' ? s.instruments.find((i) => i.id === target.instrumentId)?.effects : undefined);
  return target.kind === 'master' ? master : (instrumentFx ?? EMPTY);
}

/** Store writes for the target's chain. Reads state at call time, so it is safe to call per render. */
export function fxChainActions(target: FxChainTarget): FxChainActions {
  if (target.kind === 'master') {
    const audio = () => useAudioStore.getState();
    return {
      add: (fx) => audio().addMasterEffectConfig(fx),
      remove: (id) => audio().removeMasterEffect(id),
      update: (id, u) => audio().updateMasterEffect(id, u),
      reorder: (a, b) => audio().reorderMasterEffects(a, b),
      setAll: (fx, gain) => audio().setMasterEffects(fx, gain),
      read: () => audio().masterEffects,
    };
  }
  const id = target.instrumentId;
  const inst = () => useInstrumentStore.getState();
  return {
    add: (fx) => inst().addEffectConfig(id, fx),
    remove: (fxId) => inst().removeEffect(id, fxId),
    update: (fxId, u) => inst().updateEffect(id, fxId, u),
    reorder: (a, b) => inst().reorderEffects(id, a, b),
    // updateInstrument rebuilds the instrument's effect chain in the engine.
    setAll: (fx) => inst().updateInstrument(id, { effects: fx }),
    read: () => inst().instruments.find((i) => i.id === id)?.effects ?? EMPTY,
  };
}
