/**
 * MIDIContextRouter - Context-aware MIDI routing based on active view
 *
 * Lightweight helper that existing handlers (useMIDIStore, ButtonMapManager)
 * query to decide whether to route MIDI messages to tracker or DJ subsystems.
 */

import { useUIStore } from '../stores/useUIStore';

export type MIDIContext = 'tracker' | 'dj' | 'global';

/** Get the current MIDI routing context based on activeView */
export function getMIDIContext(): MIDIContext {
  const { activeView } = useUIStore.getState();
  if (activeView === 'dj') return 'dj';
  return 'tracker'; // tracker + arrangement both use tracker context
}

/** Check if DJ mode is active for MIDI routing */
export function isDJContext(): boolean {
  return useUIStore.getState().activeView === 'dj';
}
