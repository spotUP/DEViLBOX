/**
 * AelapseEditor — renders the Ælapse JUCE hardware UI inside the DEViLBOX
 * visual effect editor slot.
 *
 * Unlike every other effect editor in this directory (which is a knob grid
 * using the DEViLBOX `Knob` component), this one delegates the entire UI to
 * the real JUCE editor compiled to WASM. Param changes flow:
 *
 *   JUCE knob   → ParamForwarder::parameterValueChanged(idx, val)
 *               → window._aelapseUIParamCallback(idx, val)
 *               → AelapseHardwareUI's `onUpdateParameter(idx, val)` prop
 *               → this editor translates idx→store-key and calls
 *                 onUpdateParameter(key, val * 100) from VisualEffectEditorProps
 *               → store update triggers EffectParameterEngine.updateEffectParams
 *               → node.setParamById(dspId, val) on the live AelapseEffect
 *
 * And for the springs visualization overlay:
 *
 *   AelapseEffect.worklet.js posts RMS snapshots every ~30Hz
 *               → AelapseEffect.rmsStack / rmsPos updated on main thread
 *               → this editor's `getRMSSnapshot()` callback reads from
 *                 ToneEngine.getMasterEffectNode(effect.id)
 *               → AelapseHardwareUI feeds the snapshot to its WebGL2 canvas
 */

import React, { useCallback } from 'react';
import type { VisualEffectEditorProps } from './shared';
import { AelapseHardwareUI } from '@components/effects/hardware/AelapseHardwareUI';
import { useAudioStore } from '@stores/useAudioStore';
import { AelapseEffect } from '@engine/effects/AelapseEffect';

// JUCE ParamId ordinal → DEViLBOX store key. `null` entries are the two
// BPM-sync params (kDelayTimeType, kDelayBeats) that we skip in the DSP WASM.
const JUCE_INDEX_TO_STORE_KEY: (string | null)[] = [
  'delayActive',      // 0  kDelayActive
  'delayDryWet',      // 1  kDelayDrywet
  null,               // 2  kDelayTimeType — BPM sync deferred
  'delayTime',        // 3  kDelaySeconds
  null,               // 4  kDelayBeats    — BPM sync deferred
  'delayFeedback',    // 5  kDelayFeedback
  'delayCutLow',      // 6  kDelayCutLow
  'delayCutHi',       // 7  kDelayCutHi
  'delaySaturation',  // 8  kDelaySaturation
  'delayDrift',       // 9  kDelayDrift
  'delayMode',        // 10 kDelayMode
  'springsActive',    // 11 kSpringsActive
  'springsDryWet',    // 12 kSpringsDryWet
  'springsWidth',     // 13 kSpringsWidth
  'springsLength',    // 14 kSpringsLength
  'springsDecay',     // 15 kSpringsDecay
  'springsDamp',      // 16 kSpringsDamp
  'springsShape',     // 17 kSpringsShape
  'springsTone',      // 18 kSpringsTone
  'springsScatter',   // 19 kSpringsScatter
  'springsChaos',     // 20 kSpringsChaos
];

export const AelapseEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
}) => {
  // JUCE knob → store. Normalizes 0..1 → 0..100 (how the other effect params
  // are stored) and drops JUCE indices that have no DSP counterpart.
  const handleParam = useCallback(
    (juceIndex: number, value01: number) => {
      const key = JUCE_INDEX_TO_STORE_KEY[juceIndex];
      if (!key) return;
      // Boolean params go through the store as 0 or 100 so the toggle in
      // the create() factory reads `> 50` correctly.
      const isBool = key === 'delayActive' || key === 'springsActive';
      const stored = isBool ? (value01 > 0.5 ? 100 : 0) : value01 * 100;
      onUpdateParameter(key, stored);
    },
    [onUpdateParameter],
  );

  // Pull the RMS snapshot directly off the live effect instance. We look it
  // up every frame via ToneEngine.getMasterEffectNode(effectId) rather than
  // caching — the instance pointer changes if the user removes + re-adds
  // the effect.
  const getRMSSnapshot = useCallback(() => {
    const engine = useAudioStore.getState().toneEngineInstance;
    const node = engine?.getMasterEffectNode(effect.id);
    if (node instanceof AelapseEffect) {
      return node.getRMSSnapshot();
    }
    return null;
  }, [effect.id]);

  return (
    <div className="flex flex-col items-center w-full" style={{ minHeight: 620 }}>
      <div className="w-full" style={{ height: 620 }}>
        <AelapseHardwareUI
          onUpdateParameter={handleParam}
          getRMSSnapshot={getRMSSnapshot}
        />
      </div>
    </div>
  );
};
