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

// Map JUCE string param IDs (from window._aelapseParamIds) to DEViLBOX
// store key names. This is more reliable than index-based mapping because
// JUCE's AudioProcessorParameterGroup can reorder param indices.
const JUCE_ID_TO_STORE_KEY: Record<string, string> = {
  'delay_active':     'delayActive',
  'delay_drywet':     'delayDryWet',
  'delay_seconds':    'delayTime',
  'delay_feedback':   'delayFeedback',
  'delay_cutoff_low': 'delayCutLow',
  'delay_cutoff_hi':  'delayCutHi',
  'delay_saturation': 'delaySaturation',
  'delay_drift':      'delayDrift',
  'delay_mode':       'delayMode',
  'springs_active':   'springsActive',
  'springs_drywet':   'springsDryWet',
  'springs_width':    'springsWidth',
  'springs_length':   'springsLength',
  'springs_decay':    'springsDecay',
  'springs_damp':     'springsDamp',
  'springs_shape':    'springsShape',
  'springs_tone':     'springsTone',
  'springs_scatter':  'springsScatter',
  'springs_chaos':    'springsChaos',
};

const BOOL_PARAMS = new Set(['delayActive', 'springsActive']);
const CHOICE_PARAMS = new Set(['delayMode']);

export const AelapseEditor: React.FC<VisualEffectEditorProps> = ({
  effect,
  onUpdateParameter,
}) => {
  // JUCE knob → DSP (direct) + store (for persistence).
  // The direct DSP path ensures JUCE preset changes are audible immediately,
  // even if the store → EffectParameterEngine diff path doesn't trigger.
  const handleParam = useCallback(
    (juceIndex: number, value01: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paramIds = (window as any)._aelapseParamIds as string[] | undefined;
      if (!paramIds || juceIndex < 0 || juceIndex >= paramIds.length) return;

      const juceId = paramIds[juceIndex];
      const key = JUCE_ID_TO_STORE_KEY[juceId];
      if (!key) return;

      // Direct DSP path: forward the 0..1 value to the live effect
      // instance immediately, bypassing the store round-trip.
      const engine = useAudioStore.getState().toneEngineInstance;
      const node = engine?.getMasterEffectNode(effect.id);
      if (node instanceof AelapseEffect) {
        node.forwardJuceParam(juceIndex, value01);
      }

      // Store path: persist the value for save/load.
      let stored: number;
      if (BOOL_PARAMS.has(key)) {
        stored = value01 > 0.5 ? 100 : 0;
      } else if (CHOICE_PARAMS.has(key)) {
        stored = Math.round(value01 * 100);
      } else {
        stored = value01 * 100;
      }
      onUpdateParameter(key, stored);
    },
    [onUpdateParameter, effect.id],
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
