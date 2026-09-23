/**
 * Driving a controller's button lamps from the deck's state.
 *
 * The surface has no RGB, so it cannot show which move a button carries — but
 * it can show whether that move is ON, and that is the part that changes while
 * you play. See `controllerFeedback.ts` for what each state means and why a
 * hold blinks where a toggle is steady.
 *
 * This hook is the wiring only: it works out which buttons exist on the layer
 * in front of the performer, asks the pure code what each lamp should be, and
 * sends the difference.
 */

import { useEffect, useRef } from 'react';
import { getMIDIManager } from '@/midi/MIDIManager';
import { getDJControllerMapper } from '@/midi/DJControllerMapper';
import {
  lampDiff,
  lampMessage,
  allLampsOff,
  type DeckLampState,
  type LampState,
  type MappedButton,
} from '@/midi/controllerFeedback';

/**
 * Which of the preset's note mappings belong to the layer on screen.
 *
 * A two-layer device describes every button twice, at different notes, and
 * lighting both layers at once would light buttons the performer cannot see.
 * The X-Touch's Layer B notes are its Layer A notes plus 55, so the layer a
 * button belongs to is decided by which half of the range it falls in.
 */
const LAYER_B_NOTE_FLOOR = 71;

function buttonsForLayer(layer: 'A' | 'B'): MappedButton[] {
  const preset = getDJControllerMapper().getPreset();
  if (!preset?.noteMappings) return [];

  return preset.noteMappings
    .filter((m) => {
      const isLayerB = m.note >= LAYER_B_NOTE_FLOOR;
      return layer === 'B' ? isLayerB : !isLayerB;
    })
    .map((m) => ({
      channel: m.channel,
      note: m.note,
      target: 'param' in m ? m.param : m.action,
    }));
}

/**
 * Find the port that talks back to the controller.
 *
 * Matched on the preset's own name rather than a hardcoded device string, so
 * adding a controller preset does not also mean editing this.
 */
function outputForPreset(): MIDIOutput | null {
  const preset = getDJControllerMapper().getPreset();
  if (!preset) return null;
  const words = preset.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;
  return getMIDIManager().findOutputByName(
    (name) => words.some((w) => name.toLowerCase().includes(w)),
  );
}

/**
 * Light the surface to match the deck.
 *
 * `enabled` exists so the deck can stop driving lamps when the bus is off —
 * a dark surface is the honest signal that nothing will sound.
 */
export function useControllerLamps(state: DeckLampState, layer: 'A' | 'B', enabled = true): void {
  /** What was last sent, so only changes go out. */
  const sent = useRef<Map<string, LampState>>(new Map());

  useEffect(() => {
    const output = outputForPreset();
    if (!output) return;

    const buttons = buttonsForLayer(layer);
    if (buttons.length === 0) return;

    if (!enabled) {
      for (const command of allLampsOff(buttons)) output.send(lampMessage(command));
      sent.current = new Map();
      return;
    }

    const { commands, next } = lampDiff(buttons, state, sent.current);
    for (const command of commands) output.send(lampMessage(command));
    sent.current = next;
  }, [state, layer, enabled]);

  // Leaving the deck must not leave lamps lit on the hardware.
  useEffect(() => () => {
    const output = outputForPreset();
    if (!output) return;
    for (const command of allLampsOff(buttonsForLayer(layer))) {
      output.send(lampMessage(command));
    }
  }, [layer]);
}
