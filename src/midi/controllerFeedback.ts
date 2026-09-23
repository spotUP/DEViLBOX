/**
 * Lighting a controller's buttons to show what the deck is doing.
 *
 * The X-Touch Compact has no RGB LEDs — confirmed against the device on
 * 2026-09-23 — so a button cannot show which move it carries. What it CAN show
 * is the only thing that changes while you play: whether the move is on.
 *
 * That is the half worth having. A latched toggle you cannot see is a toggle
 * you press twice; a hold whose button stays dark gives the hand no
 * confirmation the gesture landed. The screen already says all of this, but
 * the screen is not where your eyes are during a take.
 *
 * Deliberately NOT a colour system. `controlColor.ts` gives a move its hue on
 * screen and that is where hue belongs; a single-colour LED gets state and
 * nothing else.
 */

/**
 * What one button's lamp should be doing.
 *
 * Three states because that is what the hardware has: a button LED is off, on,
 * or flashing. Velocity carries it on the note the button itself sends.
 */
export type LampState = 'off' | 'on' | 'blink';

/**
 * Velocity for each state.
 *
 * The Mackie-style convention every X-Touch-class surface follows: 0 dark,
 * 1 flashing, 127 lit.
 */
export const LAMP_VELOCITY: Record<LampState, number> = {
  off: 0,
  blink: 1,
  on: 127,
};

/** One lamp instruction, ready to become a MIDI message. */
export interface LampCommand {
  channel: number;
  note: number;
  state: LampState;
}

/**
 * What the deck is doing, in the terms the deck already keeps.
 *
 * Passed in rather than read, so this stays pure and a test can drive it
 * without a store, a browser or a device.
 */
export interface DeckLampState {
  /** Move ids latched on. */
  toggled: ReadonlySet<string>;
  /** Keys as the deck keeps them: `${moveId}:${channelId ?? 'g'}`. */
  held: ReadonlySet<string>;
  /** The one rate preset that is active, if any. */
  activeRatePreset: string | null;
  /** Channels whose dub send is muted. */
  mutedChannels: ReadonlySet<number>;
  /** Is recording armed. */
  armed: boolean;
}

/** A button on the surface, and what it plays. */
export interface MappedButton {
  channel: number;
  note: number;
  /** The assignment target, e.g. `dub.ringMod` or `dub.channelMute.ch3`. */
  target: string;
}

/**
 * Should this button's lamp be lit?
 *
 * A toggle and a rate preset LATCH, so they are steady. A hold is momentary,
 * so it BLINKS while down — the difference tells the hand which kind of
 * gesture it is holding without looking at the screen.
 */
export function lampFor(target: string, state: DeckLampState): LampState {
  if (target === 'dub.armed') return state.armed ? 'on' : 'off';

  const CHANNEL_MUTE = 'dub.channelMute.ch';
  if (target.startsWith(CHANNEL_MUTE)) {
    const ch = Number.parseInt(target.slice(CHANNEL_MUTE.length), 10);
    return Number.isFinite(ch) && state.mutedChannels.has(ch) ? 'on' : 'off';
  }

  if (!target.startsWith('dub.')) return 'off';
  const [moveId, channelPart] = target.slice(4).split('.');

  if (state.activeRatePreset === moveId) return 'on';
  if (state.toggled.has(moveId)) return 'on';

  const channelMatch = channelPart?.match(/^ch(\d+)$/);
  const key = channelMatch ? `${moveId}:${channelMatch[1]}` : `${moveId}:g`;
  return state.held.has(key) ? 'blink' : 'off';
}

/**
 * Every lamp that needs changing, and nothing that does not.
 *
 * Diffed against what was last sent, because a surface with fifty buttons
 * refreshed on every render is a stream of MIDI nobody asked for — and on a
 * device that also sends, a flood of output can cost input latency.
 */
export function lampDiff(
  buttons: readonly MappedButton[],
  state: DeckLampState,
  previous: ReadonlyMap<string, LampState>,
): { commands: LampCommand[]; next: Map<string, LampState> } {
  const next = new Map<string, LampState>();
  const commands: LampCommand[] = [];

  for (const button of buttons) {
    const want = lampFor(button.target, state);
    const key = `${button.channel}:${button.note}`;
    next.set(key, want);
    if (previous.get(key) !== want) {
      commands.push({ channel: button.channel, note: button.note, state: want });
    }
  }
  return { commands, next };
}

/** One lamp command as the three bytes a note-on is. */
export function lampMessage(command: LampCommand): Uint8Array {
  return new Uint8Array([
    0x90 | (command.channel & 0x0F),
    command.note & 0x7F,
    LAMP_VELOCITY[command.state],
  ]);
}

/** Everything dark — for disconnect, so the surface does not keep stale lamps lit. */
export function allLampsOff(buttons: readonly MappedButton[]): LampCommand[] {
  return buttons.map((b) => ({ channel: b.channel, note: b.note, state: 'off' as const }));
}
