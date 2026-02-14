/**
 * VSTBridge synth registrations (lazy-loaded)
 *
 * VSTBridge synths are already registered via vstbridge/synth-registry.ts.
 * This file bridges them into the SynthRegistry so they participate in
 * the unified dispatch. The actual SYNTH_REGISTRY entries (VSTBridgeDescriptor)
 * are the source of truth for VSTBridge-specific config (wasmDir, etc).
 */

import { SynthRegistry } from '../SynthRegistry';
import type { SynthDescriptor } from '../SynthDescriptor';
import { SYNTH_REGISTRY as VST_SYNTH_REGISTRY } from '../../vstbridge/synth-registry';
import { VSTBridgeSynth } from '../../vstbridge/VSTBridgeSynth';

// Bridge all VSTBridge synths into SynthRegistry
// Skip IDs already registered (e.g. OBXd is handled by misc.ts via direct JUCE WASM)
for (const [id, vstDesc] of VST_SYNTH_REGISTRY.entries()) {
  if (SynthRegistry.has(id)) continue;
  SynthRegistry.register({
    id,
    name: vstDesc.name,
    category: 'wasm',
    loadMode: 'lazy',
    sharedInstance: true,
    useSynthBus: true,
    volumeOffsetDb: vstDesc.volumeOffsetDb ?? 0,
    controlsComponent: vstDesc.panelComponent,
    commands: vstDesc.commands,
    create: (config) => {
      return new VSTBridgeSynth(vstDesc, config);
    },
    onTriggerRelease: (synth, _note, time) => {
      (synth as any).triggerRelease(time);
      return true;
    },
  } as SynthDescriptor);
}
