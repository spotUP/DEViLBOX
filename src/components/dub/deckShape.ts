/**
 * The dub deck's SHAPE, and what each of a controller's controls does on it.
 *
 * Asked for on 2026-09-23: "the dub deck in devilbox should match my hw
 * controller layoutwize". The deck redraws into the physical layout of the
 * controller in front of the performer — the eight toggles really are one row
 * of eight buttons, the sends really are the eight faders — so the screen and
 * the hands agree about where a thing is. The generic deck stays, and stays
 * the default, because most people have no controller at all.
 *
 * Everything here is PURE and data-driven, for two reasons. The obvious one
 * is that `DubDeckStrip` cannot be mounted in a test (it pulls the live
 * WebAudio stack), so the only way to prove which control fires which move is
 * to keep that decision out of the component. The second is that the answer
 * must come from the SAME factory preset the hardware is driven by: if this
 * file held its own opinion about which button is Wobble, the screen and the
 * controller would disagree the first time the preset changed, and the whole
 * point of the shape is that they cannot.
 *
 * The interaction model — trigger, hold, toggle, rate — is likewise not
 * decided here. It is read out of the deck's own `GLOBAL_MOVES` /
 * `CHANNEL_OPS` tables, passed in by the caller, so a move that becomes a
 * hold in the generic deck becomes a hold in the controller shape in the same
 * commit. ("ghost should no be a toggle it should be a hold", 2026-09-22, was
 * one table edit; it must never become two.)
 */

import type { ControllerLayout, ControlDescriptor } from '@/midi/controllerLayouts';
import type { DJControllerPreset } from '@/midi/djControllerPresets';
import type { ControlAssignment, ControllerOverrides } from '@/stores/useMIDIPresetStore';
import type { MoveColor } from './moveButtonStyle';

// ============================================================================
// WHICH SHAPE
// ============================================================================

/** The stored preference. A layout id picks that controller's shape. */
export type DeckShapePreference = 'automatic' | 'generic' | (string & {});

/** The shape actually drawn. */
export type ResolvedDeckShape =
  | { kind: 'generic' }
  | { kind: 'controller'; layout: ControllerLayout };

export interface DeckShapeOption {
  id: DeckShapePreference;
  label: string;
}

/**
 * The picker's entries: follow the hardware, the generic deck, then every
 * controller we have a physical descriptor for.
 *
 * "Automatic" is first and is the default, so plugging a supported controller
 * in is enough — but it is an entry like any other, so a performer who wants
 * the generic deck with the controller connected (or the X-Touch shape with
 * nothing plugged in, to plan a set) can say so and be obeyed.
 */
export function listDeckShapeOptions(
  layouts: ReadonlyMap<string, ControllerLayout>,
): DeckShapeOption[] {
  const options: DeckShapeOption[] = [
    { id: 'automatic', label: 'Automatic — follow the connected controller' },
    { id: 'generic', label: 'Generic Deck' },
  ];
  layouts.forEach((layout, id) => {
    options.push({ id, label: `${layout.manufacturer} ${layout.name}` });
  });
  return options;
}

/**
 * Which shape to draw.
 *
 * `automatic` follows the active controller preset, and falls back to the
 * generic deck when nothing is connected or the connected thing has no
 * physical descriptor yet — a preset without a layout is common (there are
 * nine DJ presets and three layouts), and it must degrade to the deck that
 * always works rather than to an empty panel.
 *
 * An explicit choice that names a layout we no longer have also falls back,
 * so an old persisted value cannot strand the performer with no deck.
 */
export function resolveDeckShape(
  preference: DeckShapePreference,
  activePresetId: string | null,
  layouts: ReadonlyMap<string, ControllerLayout>,
): ResolvedDeckShape {
  if (preference === 'generic') return { kind: 'generic' };
  const wanted = preference === 'automatic' ? activePresetId : preference;
  if (!wanted) return { kind: 'generic' };
  const layout = layouts.get(wanted);
  return layout ? { kind: 'controller', layout } : { kind: 'generic' };
}

// ============================================================================
// WHAT EACH CONTROL DOES
// ============================================================================

/** How the deck plays a move. Mirrors the deck's own four move rows. */
export type DeckInteraction = 'trigger' | 'hold' | 'toggle' | 'rate';

export interface DeckMove {
  moveId: string;
  /**
   * The deck's own colour token for this move.
   *
   * Carried through rather than re-decided per shape: a move's colour is a
   * property of the move, and a second shape picking its own would be a
   * second deck (see `moveButtonStyle.ts`).
   */
  color: MoveColor;
  /** The deck's own short name for it — 'Wobble', not 'tapeWobble'. */
  label: string;
  /** The deck's own description, shown on hover exactly as on the buttons. */
  title: string;
  interaction: DeckInteraction;
}

/** The shape of a row in the deck's `GLOBAL_MOVES` table. */
export interface GlobalMoveRow {
  label: string;
  title: string;
  moveId: string;
  color: MoveColor;
  kind: 'trigger' | 'hold';
  group: 'click' | 'hold' | 'toggle' | 'rate';
}

/** The shape of a row in the deck's `CHANNEL_OPS` table. */
export interface ChannelOpRow {
  label: string;
  title: string;
  moveId: string;
  color: MoveColor;
  kind: 'trigger' | 'hold';
}

/**
 * Index the deck's two move tables by move id.
 *
 * The GROUP decides the interaction for a global, not the kind: `STOP!` is
 * `kind: 'hold'` and sits in the HOLD row, but the rate presets are also
 * `kind: 'hold'` and are played as a radio group — click to snap, click again
 * to restore. The row a button sits in IS the promise the deck makes about
 * how it behaves, so that is what carries over to the controller shape.
 */
export function buildDeckMoveIndex(
  globals: readonly GlobalMoveRow[],
  channelOps: readonly ChannelOpRow[],
): Map<string, DeckMove> {
  const index = new Map<string, DeckMove>();
  for (const op of channelOps) {
    index.set(op.moveId, {
      moveId: op.moveId,
      label: op.label,
      title: op.title,
      color: op.color,
      interaction: op.kind,
    });
  }
  for (const move of globals) {
    index.set(move.moveId, {
      moveId: move.moveId,
      label: move.label,
      title: move.title,
      color: move.color,
      interaction: move.group === 'click' ? 'trigger' : move.group,
    });
  }
  return index;
}

/** What one address on a control does, once resolved against the deck. */
export type DeckTarget =
  /** A dub move, optionally scoped to one channel (`dub.channelMute.ch3`). */
  | { kind: 'move'; target: string; move: DeckMove; channelId?: number }
  /** A channel's dub send — the thing a fader rides. */
  | { kind: 'channelSend'; target: string; channelId: number }
  /** The recording arm. */
  | { kind: 'armed'; target: string }
  /**
   * A continuous dub bus parameter (`dub.returnGain`, `dub.hpfCutoff`, …).
   *
   * Named and shown, but not driven from the diagram in this pass: the 0..1
   * normalisation for these lives in the MIDI router's own transform table,
   * and a second copy of it here is exactly the duplication that makes two
   * controls disagree about what 0.5 means. The BUS tab owns them with real
   * faders, and the hardware knob itself drives them through the router.
   */
  | { kind: 'busParam'; target: string }
  /** A DJ parameter or a transport action — real, but not the deck's to fire. */
  | { kind: 'foreign'; target: string };

export interface ControlDeckBinding {
  /** What turning or sliding this control does (its CC address). */
  turn?: DeckTarget;
  /** What pressing it does (its note, or an encoder's separate push note). */
  press?: DeckTarget;
}

const CHANNEL_SEND_PREFIX = 'dub.channelSend.ch';

/**
 * Read a target path the way the MIDI router reads it.
 *
 * Deliberately the same grammar as `parameterRouter.parseDubMoveParam`:
 * `dub.<moveId>` global, `dub.<moveId>.ch<N>` per channel. If the two ever
 * disagreed, a button would light up for one channel and act on another.
 */
export function classifyDeckTarget(
  target: string,
  moves: ReadonlyMap<string, DeckMove>,
): DeckTarget {
  if (target.startsWith(CHANNEL_SEND_PREFIX)) {
    const channelId = Number.parseInt(target.slice(CHANNEL_SEND_PREFIX.length), 10);
    if (Number.isFinite(channelId) && channelId >= 0) {
      return { kind: 'channelSend', target, channelId };
    }
    return { kind: 'foreign', target };
  }
  if (target === 'dub.armed') return { kind: 'armed', target };
  if (!target.startsWith('dub.')) return { kind: 'foreign', target };

  const parts = target.slice(4).split('.');
  const move = moves.get(parts[0]);
  if (!move) return { kind: 'busParam', target };
  const channelMatch = parts[1]?.match(/^ch(\d+)$/);
  return channelMatch
    ? { kind: 'move', target, move, channelId: Number.parseInt(channelMatch[1], 10) }
    : { kind: 'move', target, move };
}

/** The factory preset's CC entry for this control, if it has one. */
function presetTurnTarget(control: ControlDescriptor, preset: DJControllerPreset): string | null {
  if (control.midi.type !== 'cc') return null;
  const mapping = preset.ccMappings.find(
    (m) => m.channel === control.midi.channel && m.cc === control.midi.number,
  );
  return mapping?.param ?? null;
}

/** The factory preset's note entry for this control, if it has one. */
function presetPressTarget(control: ControlDescriptor, preset: DJControllerPreset): string | null {
  const { midi } = control;
  const note = midi.type === 'note' ? midi.number : midi.pushNote;
  if (note === undefined) return null;
  const channel = midi.type === 'note' ? midi.channel : (midi.pushChannel ?? midi.channel);
  const mapping = preset.noteMappings.find((m) => m.channel === channel && m.note === note);
  if (!mapping) return null;
  return 'action' in mapping ? mapping.action : mapping.param;
}

/**
 * Bind every control on one layer to what the deck will do with it.
 *
 * An encoder gets BOTH halves: the X-Touch's top row turns the bus tone and
 * its pushes fire the echo-rate presets, and the mapper diagram has always
 * shown only one of the two because it keeps a single assignment per control.
 * The deck needs both or half the moves on the surface are unreachable.
 *
 * User overrides sit on top, and go to the half that matches the control: a
 * button's override is always a press; a fader's or encoder's is a turn
 * unless it names an ACTION, which a continuous control cannot send.
 */
export function buildDeckBindings(params: {
  layout: ControllerLayout;
  layer: 'A' | 'B';
  preset: DJControllerPreset | null;
  overrides: ControllerOverrides;
  moves: ReadonlyMap<string, DeckMove>;
}): Record<string, ControlDeckBinding> {
  const { layout, layer, preset, overrides, moves } = params;
  const bindings: Record<string, ControlDeckBinding> = {};

  for (const control of layout.controls) {
    // One layer at a time — a two-layer device describes each physical
    // control twice, and drawing both would stack them on one position.
    if (control.layer && control.layer !== layer) continue;

    const binding: ControlDeckBinding = {};
    if (preset) {
      const turn = presetTurnTarget(control, preset);
      if (turn) binding.turn = classifyDeckTarget(turn, moves);
      const press = presetPressTarget(control, preset);
      if (press) binding.press = classifyDeckTarget(press, moves);
    }

    const override: ControlAssignment | undefined = overrides[control.id];
    if (override) {
      const isButton = control.type === 'button' || control.type === 'pad';
      const resolved = classifyDeckTarget(override.target, moves);
      if (isButton || override.kind === 'action') binding.press = resolved;
      else binding.turn = resolved;
    }

    bindings[control.id] = binding;
  }

  return bindings;
}

/**
 * The caption for a control in deck shape.
 *
 * The deck's own short label, because that is the word the performer already
 * associates with the move from the generic deck — and the channel number
 * when the target names one, because eight buttons all reading "Mute" tell
 * you nothing about which channel you are about to kill (the same fault the
 * mapper diagram had before `controlLabel.ts`).
 */
export function deckControlLabel(binding: ControlDeckBinding): string {
  const target = binding.press ?? binding.turn;
  if (!target) return '';
  switch (target.kind) {
    case 'move':
      return target.channelId === undefined
        ? target.move.label
        : `${target.move.label} ${target.channelId + 1}`;
    case 'channelSend':
      return `Send ${target.channelId + 1}`;
    case 'armed':
      return 'Record Arm';
    case 'busParam':
    case 'foreign':
      return target.target;
  }
}

/** True when nothing on this control is the dub deck's to drive. */
export function isDeckInert(binding: ControlDeckBinding): boolean {
  const drivable = (t: DeckTarget | undefined): boolean =>
    t !== undefined && (t.kind === 'move' || t.kind === 'channelSend' || t.kind === 'armed');
  return !drivable(binding.press) && !drivable(binding.turn);
}

// ============================================================================
// EVERY CONTROL, WHERE THE HARDWARE PUTS IT
// ============================================================================

/**
 * One physical control, with whatever the deck will do with it.
 *
 * Earlier versions of this returned only the controls that carried a MOVE, so
 * the renderer silently dropped all nine faders, all eight transport buttons,
 * and drew each of the sixteen encoders as its push-button — seventeen
 * controls missing and every knob turned into a button. The device's own
 * report of itself says the descriptor was right all along:
 *
 *   enc-top    8 encoders x 0..14  y 0      faders    9 faders  x 0..16  y 8
 *   btn-row1-3 8 buttons  x 0..14  y 2/4/6  select    9 buttons x 0..16  y 13
 *   enc-right  8 encoders x 18..20 y 0..6   transport 8 buttons x 18..20 y 9..15
 *
 * So the placement step no longer filters anything. What a control DOES is the
 * renderer's business; where it is, and whether it is a knob or a fader, is
 * the descriptor's.
 */
export interface DeckControlPlacement {
  control: ControlDescriptor;
  binding: ControlDeckBinding;
  /** Footprint in grid units, with the descriptor's defaults applied. */
  w: number;
  h: number;
}

export function deckControls(
  layout: ControllerLayout,
  layer: 'A' | 'B',
  bindings: Record<string, ControlDeckBinding>,
): DeckControlPlacement[] {
  const placed: DeckControlPlacement[] = [];
  for (const control of layout.controls) {
    if (control.layer && control.layer !== layer) continue;
    placed.push({
      control,
      binding: bindings[control.id] ?? {},
      w: control.w ?? 2,
      h: control.h ?? (control.type === 'fader' ? 4 : 2),
    });
  }
  return placed;
}
