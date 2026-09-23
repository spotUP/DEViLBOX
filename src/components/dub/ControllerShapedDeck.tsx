/**
 * ControllerShapedDeck — the dub deck laid out as the performer's controller.
 *
 * "the dub deck in devilbox should match my hw controller layoutwize"
 * (2026-09-23). Every physical control appears where the descriptor says it
 * is, drawn with the control DEViLBOX already uses for that job: an encoder is
 * a `Knob`, a fader is a `Fader`, a button is the deck's own move button in
 * the deck's own colour. Nothing here is a picture of a device — they are the
 * working controls, in the device's arrangement.
 *
 * The arrangement is read from `controllerLayouts.ts`, which reports:
 *
 *   enc-top    8 encoders x 0..14  y 0      faders    9 faders  x 0..16  y 8
 *   btn-row1-3 8 buttons  x 0..14  y 2/4/6  select    9 buttons x 0..16  y 13
 *   enc-right  8 encoders x 18..20 y 0..6   transport 8 buttons x 18..20 y 9..15
 *
 * A previous version of this file rendered only the controls that carried a
 * dub MOVE. That dropped all nine faders — including the master, which is why
 * it went missing from the right-hand end — dropped the transport, and drew
 * all sixteen encoders as their push-buttons, so the panel had no knobs on it
 * at all. The layout was never the problem; the renderer was throwing three
 * quarters of the device away.
 *
 * Every gesture calls the deck's own handlers, passed in through `api`. None
 * of the interaction logic is re-implemented: two shapes of one deck that each
 * fired moves their own way would drift apart move by move, and the first
 * symptom would be a hold that never releases in one shape and does in the
 * other.
 */

import React, { useCallback, useMemo } from 'react';
import { Button } from '@components/ui/Button';
import { Knob } from '@components/controls/Knob';
import { Fader } from '@components/controls/Fader';
import type { ControllerLayout, ControlDescriptor } from '@/midi/controllerLayouts';
import { getPresetById } from '@/midi/djControllerPresets';
import { DUB_BUS_PARAMS } from '@/midi/performance/parameterRouter';
import { useMIDIPresetStore } from '@/stores/useMIDIPresetStore';
import { colorClasses } from './moveButtonStyle';
import {
  buildDeckBindings,
  deckControls,
  type ControlDeckBinding,
  type DeckMove,
  type DeckTarget,
} from './deckShape';

/**
 * The deck's own handlers, passed in rather than re-created.
 *
 * Exactly the set the deck's own controls call — including `holdButtonProps`,
 * so a hold here is the same pointer gesture, with the same four ways out of a
 * held state, as a hold in the deck's own layout.
 */
export interface DubDeckControlApi {
  fireTrigger: (moveId: string, channelId?: number) => void;
  holdButtonProps: (moveId: string, channelId?: number) => {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onLostPointerCapture: () => void;
  };
  handleToggle: (moveId: string) => void;
  handleRatePreset: (moveId: string) => void;
  setChannelSend: (channelId: number, value: number) => void;
  /** The deck's master send — scales every channel at once. */
  setMasterSend: (value: number) => void;
  setArmed: (armed: boolean) => void;
  /** Write one dub bus setting, in its own units. */
  setBusParam: (field: string, value: number) => void;
}

interface ControllerShapedDeckProps {
  layout: ControllerLayout;
  /** Which hardware layer is on screen — the device's own LAYER switch. */
  layer: 'A' | 'B';
  onLayerChange: (layer: 'A' | 'B') => void;
  /** The deck's move tables, indexed by `buildDeckMoveIndex`. */
  moves: ReadonlyMap<string, DeckMove>;
  /** Current dub send per channel, for the faders to show and ride. */
  channelSends: readonly number[];
  masterSend: number;
  /** Live dub bus settings, for the knobs to show. */
  busSettings: Readonly<Record<string, number | undefined>>;
  armed: boolean;
  busEnabled: boolean;
  /** Is this move firing — on this channel when one is named. */
  isFiring: (moveId: string, channelId?: number) => boolean;
  /** Keys are `${moveId}:${channelId ?? 'g'}`, as the deck keeps them. */
  heldMoves: ReadonlySet<string>;
  toggledMoves: ReadonlySet<string>;
  activeRatePreset: string | null;
  /**
   * The deck's own channel strip, drawn beneath the panel.
   *
   * The panel used to draw its own bare faders and a row of Mute buttons where
   * the hardware's faders are. That is accurate to the device but a downgrade
   * from what the deck has: the real cards carry the role and filter selects,
   * the reverb and sweep sends, all nine per-channel ops and the send readout
   * — "it looks like our old ones have more functionality? replace the bare
   * ones with our old ones" (2026-09-23).
   *
   * Passed in rather than rebuilt, so there is exactly one channel card in
   * DEViLBOX and both layouts show the same one.
   */
  channelStrip?: React.ReactNode;
  /**
   * One channel strip, drawn to fill the column it is given.
   *
   * The device is nine columns wide below the encoders — eight channels and
   * the master — and a column holds the button above, the fader, and the mute
   * below. So a strip has to be exactly as wide as the button over it, which
   * only holds if both sit in the same grid. "the channel slider boxes and the
   * buttons needs to be equally wide for the layout to work... think 9 columns.
   * the 9:th for the master slider" (2026-09-23).
   */
  renderChannelStrip?: (channelId: number, widthClass: string) => React.ReactNode;
  /** The ninth column: the master send. */
  renderMasterStrip?: (widthClass: string) => React.ReactNode;
  api: DubDeckControlApi;
}

/**
 * The layer indicators are program-change pseudo-controls with negative MIDI
 * numbers — they send nothing, and on the device they are what you press to
 * change bank.
 *
 * They are NOT drawn in the panel. They sit at y 15, two rows below the select
 * row, and nothing else on the device is that far down — so drawing them added
 * two full-width grid rows that were blank across all eighteen left-hand
 * columns, a band of nothing under the whole fader bank ("there is a big empty
 * space under the channel faders", 2026-09-23). The panel header carries the
 * same Layer switch, so nothing is lost by leaving them out.
 */
const LAYER_BUTTON_IDS: ReadonlySet<string> = new Set(['layer-a', 'layer-b']);

/**
 * Controls the panel does not draw at all.
 *
 * The transport block — rew, fwd, loop, rec, stop, play, and the two layer
 * indicators — carries no dub move: none of it is this deck's to fire, and
 * DEViLBOX's transport is in the toolbar above. On the device it sits at rows
 * 10 to 16, to the RIGHT of the fader bank, so drawing it opened seven grid
 * rows that were empty across all eighteen left-hand columns and left a tall
 * band of nothing between the button rows and the channel cards.
 *
 * Same fault the layer indicators had, and the same answer: a control that
 * plays nothing does not get to set the height of the panel.
 */
const SKIPPED_GROUPS: ReadonlySet<string> = new Set(['transport']);

/**
 * Minimum height of one grid unit.
 *
 * A MINIMUM, not a height. An encoder cell is two units on the device but has
 * to hold a caption, a 40 px knob and its push button; at any fixed unit small
 * enough to keep the panel compact, that content overflowed into the row below
 * and the right-hand knobs printed straight over the buttons beside them
 * ("overlapping knobs", 2026-09-23). Letting a row grow to its content costs
 * nothing where nothing needs the room, and no pixel guess can go stale.
 */
const UNIT_REM = 1.6;

/** Past this much movement the gesture was a turn, not a press. */
const TURN_SLOP = 4;

/**
 * A readable name for a target this deck does not own.
 *
 * Full words, as every DEViLBOX label is: `dj.deckA.filter` reads "Deck A
 * Filter", not the path.
 */
function foreignLabel(target: string): string {
  return target
    .replace(/^(dj|dub|param)\./, '')
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ControllerShapedDeck: React.FC<ControllerShapedDeckProps> = ({
  layout,
  layer,
  onLayerChange,
  moves,
  channelSends,
  masterSend,
  busSettings,
  armed,
  busEnabled,
  isFiring,
  heldMoves,
  toggledMoves,
  activeRatePreset,
  channelStrip,
  renderChannelStrip,
  renderMasterStrip,
  api,
}) => {
  /** Where a press on a knob started, so a turn is not mistaken for a press. */
  const pressOrigin = React.useRef<{ x: number; y: number } | null>(null);

  const overrides = useMIDIPresetStore(
    useCallback((s) => s.overrides[layout.id], [layout.id]),
  );

  const placements = useMemo(() => {
    const bindings = buildDeckBindings({
      layout,
      layer,
      preset: getPresetById(layout.id),
      overrides: overrides ?? {},
      moves,
    });
    return deckControls(layout, layer, bindings);
  }, [layout, layer, overrides, moves]);

  /**
   * The rectangle the fader bank and its select row occupy.
   *
   * The channel strip replaces both, so it has to span from the top of the
   * faders to the bottom of the select row, across every column they use.
   */
  const faderZone = useMemo(() => {
    const zone = placements.filter(
      (p) => p.control.type === 'fader' || p.control.group === 'select',
    );
    if (zone.length === 0) return null;
    return {
      x0: Math.min(...zone.map((p) => p.control.x)),
      x1: Math.max(...zone.map((p) => p.control.x + p.w)),
      y0: Math.min(...zone.map((p) => p.control.y)),
      y1: Math.max(...zone.map((p) => p.control.y + p.h)),
      ids: new Set(zone.map((p) => p.control.id)),
    };
  }, [placements]);

  const hasLayerB = useMemo(
    () => layout.controls.some((c) => c.layer === 'B'),
    [layout],
  );

  /**
   * Is the move on this control active right now?
   *
   * The deck keeps held moves under `${moveId}:${channelId ?? 'g'}`, toggles
   * under the bare move id, and the rate group under a single active id. Read
   * exactly as the deck's own layout reads them, so a lit button means the
   * same thing in both.
   */
  const isActive = useCallback((t: DeckTarget): boolean => {
    switch (t.kind) {
      case 'move': {
        const key = `${t.move.moveId}:${t.channelId ?? 'g'}`;
        switch (t.move.interaction) {
          case 'toggle': return toggledMoves.has(t.move.moveId) || heldMoves.has(key) || isFiring(t.move.moveId, t.channelId);
          case 'rate':   return activeRatePreset === t.move.moveId;
          default:       return heldMoves.has(key) || isFiring(t.move.moveId, t.channelId);
        }
      }
      case 'armed': return armed;
      default: return false;
    }
  }, [toggledMoves, heldMoves, isFiring, activeRatePreset, armed]);

  /** A latched control gets the same ring the deck's own layout gives it. */
  const isLatched = useCallback((t: DeckTarget): boolean => (
    t.kind === 'move' && (
      (t.move.interaction === 'toggle' && toggledMoves.has(t.move.moveId)) ||
      (t.move.interaction === 'rate' && activeRatePreset === t.move.moveId)
    )
  ), [toggledMoves, activeRatePreset]);

  /**
   * Pressing a knob, the way pressing the encoder works.
   *
   * A hold move holds for as long as the knob is held; a trigger, toggle or
   * rate preset fires on release. Either way a movement of more than
   * `TURN_SLOP` px means the hand was TURNING, so nothing fires — otherwise
   * every tweak of the bus tone would also throw an echo.
   */
  const pressGesture = (move: DeckMove) => {
    if (move.interaction === 'hold') {
      const hold = api.holdButtonProps(move.moveId);
      return {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          pressOrigin.current = { x: e.clientX, y: e.clientY };
          hold.onPointerDown(e as unknown as React.PointerEvent<HTMLButtonElement>);
        },
        onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
          hold.onPointerUp(e as unknown as React.PointerEvent<HTMLButtonElement>);
        },
        onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
          hold.onPointerCancel(e as unknown as React.PointerEvent<HTMLButtonElement>);
        },
      };
    }
    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        pressOrigin.current = { x: e.clientX, y: e.clientY };
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const from = pressOrigin.current;
        pressOrigin.current = null;
        if (!from) return;
        if (Math.abs(e.clientX - from.x) > TURN_SLOP || Math.abs(e.clientY - from.y) > TURN_SLOP) return;
        if (!busEnabled) return;
        if (move.interaction === 'toggle') api.handleToggle(move.moveId);
        else if (move.interaction === 'rate') api.handleRatePreset(move.moveId);
        else api.fireTrigger(move.moveId);
      },
    };
  };

  /** A button, built exactly as the deck's own layout builds it. */
  const renderButton = (target: DeckTarget, compact: boolean) => {
    const size = compact ? 'sm' : 'md';

    if (target.kind === 'armed') {
      return (
        <button
          className={
            colorClasses('accent-error', armed, size) +
            ' w-full h-full' + (armed ? ' ring-2 ring-offset-1 ring-offset-dark-bgSecondary ring-white/70' : '')
          }
          onClick={() => api.setArmed(!armed)}
          title={`Record Arm — ${armed ? 'armed, click to disarm' : 'click to arm'}`}
        >
          {armed ? 'Armed' : 'Arm'}
        </button>
      );
    }
    if (target.kind !== 'move') return null;

    const { move, channelId } = target;
    const caption = channelId === undefined ? move.label : `${move.label} ${channelId + 1}`;
    const where = channelId === undefined ? '' : ` — channel ${channelId + 1}`;
    const title = `${caption} — ${move.title}${where}`;
    const cls = colorClasses(move.color, isActive(target), size) + ' w-full h-full' +
      (isLatched(target) ? ' ring-2 ring-offset-1 ring-offset-dark-bgSecondary ring-white/70' : '');

    if (move.interaction === 'hold') {
      return (
        <button
          className={cls}
          {...api.holdButtonProps(move.moveId, channelId)}
          title={`${title} (press-and-hold)`}
          disabled={!busEnabled}
        >
          {caption}
        </button>
      );
    }
    return (
      <button
        className={cls}
        onClick={() => {
          if (move.interaction === 'toggle') api.handleToggle(move.moveId);
          else if (move.interaction === 'rate') api.handleRatePreset(move.moveId);
          else api.fireTrigger(move.moveId, channelId);
        }}
        title={title}
        disabled={!busEnabled}
      >
        {caption}
      </button>
    );
  };

  /**
   * An encoder: ONE control that turns and presses, as on the device.
   *
   * It used to draw a separate button beneath every knob for the push half.
   * There is no such button on the hardware — "the knobs+button combo here is
   * made up, the controller has only knobs there" (2026-09-23) — and inventing
   * one doubled the height of every encoder row and pushed the whole right
   * block out of shape.
   *
   * The push is still reachable, because it is still a real gesture on a real
   * control: pressing the knob fires it, exactly as pressing the encoder does.
   * A press is distinguished from a turn by movement — a drag of more than a
   * few pixels is a turn and fires nothing.
   */
  const renderEncoder = (binding: ControlDeckBinding) => {
    const turn = binding.turn;
    const def = turn?.kind === 'busParam' ? DUB_BUS_PARAMS[turn.target] : undefined;
    const press = binding.press;

    const move = press?.kind === 'move' ? press.move : undefined;
    const pressTitle = move
      ? ` · press: ${move.label} — ${move.title}`
      : '';

    return (
      <div
        className="flex flex-col items-center justify-start h-full min-h-0"
        {...(move ? pressGesture(move) : {})}
      >
        {def ? (
          /* Exactly how the instrument and synth editors use a knob —
             `SampleEnhancerPanel` and the rest pass `label`, `unit`, a size and
             a colour variable, and let the component draw its own caption and
             readout. An earlier version here passed `hideValue` and drew its
             own caption, which is why this panel looked unlike the rest of
             DEViLBOX: a lone label above a knob with no value under it. */
          <Knob
            value={busSettings[def.field] ?? def.min}
            min={def.min}
            max={def.max}
            onChange={(v) => api.setBusParam(def.field, v)}
            label={def.label}
            unit={def.unit}
            size="sm"
            color="var(--color-accent)"
            disabled={!busEnabled}
            paramKey={turn?.target}
            title={`${def.label}${def.unit ? ` (${def.unit})` : ''}${pressTitle}`}
          />
        ) : (
          /* An encoder the dub deck cannot drive — three of the X-Touch's
             right-hand knobs turn DJ parameters (`dj.crossfader`,
             `dj.deckA.filter`, `dj.deckB.filter`), which belong to the DJ
             view. It still has to occupy a knob's full box, CAPTION INCLUDED:
             drawn as a bare circle it was shorter than its neighbours and sat
             at the wrong height in the row ("3 empty knobs that are
             misaligned", 2026-09-23). */
          <>
            <div className="knob-label" style={{ fontSize: 9 }}>
              {turn ? foreignLabel(turn.target) : 'Unassigned'}
            </div>
            <div
              className="w-10 h-10 rounded-full border border-dashed border-dark-border bg-dark-bg/40 opacity-60"
              title={turn
                ? `${turn.target} — this knob drives the DJ view, not the dub bus`
                : 'Encoder — nothing assigned'}
            />
          </>
        )}
      </div>
    );
  };

  /**
   * A fader: a channel's dub send, or — at the right-hand end — the master.
   *
   * The hardware's ninth fader sends DJ master volume, which is not this
   * deck's to move, so on screen it is the deck's MASTER SEND: the same
   * control the deck's master card carries, in the place the hand expects it.
   */
  const renderFader = (binding: ControlDeckBinding) => {
    const isMaster = binding.turn?.kind !== 'channelSend';
    const channelId = binding.turn?.kind === 'channelSend' ? binding.turn.channelId : -1;
    const value = isMaster ? masterSend : (channelSends[channelId] ?? 0);

    return (
      <div className="flex flex-col items-center h-full min-h-0">
        <div className="flex-1 min-h-0 flex items-stretch">
          <Fader
            value={value}
            onChange={(v) => (isMaster ? api.setMasterSend(v) : api.setChannelSend(channelId, v))}
            // The same size the deck's channel cards use, so a dub send is the
            // same control wherever the deck draws it.
            size="md"
            fillHeight
            color={isMaster ? 'accent-highlight' : 'accent-primary'}
            disabled={!busEnabled}
            doubleClickValue={1}
            paramKey={isMaster ? undefined : `dub.channelSend.ch${channelId}`}
            title={isMaster
              ? `Master dub send — ${Math.round(value * 100)}%. Scales every channel at once.`
              : `Channel ${channelId + 1} dub send — ${Math.round(value * 100)}%`}
          />
        </div>
      </div>
    );
  };

  /** A control with nothing for this deck to drive: present, named, quiet. */
  const renderInert = (control: ControlDescriptor, binding: ControlDeckBinding) => {
    const named = binding.press ?? binding.turn;
    return (
      <div
        className="w-full h-full rounded border border-dark-border bg-dark-bg/30 flex items-center justify-center px-0.5 text-[9px] font-mono text-text-muted text-center leading-none overflow-hidden"
        title={named ? `${named.target} — driven by the hardware, not from here` : `${control.id} — nothing assigned`}
      >
        {control.label ?? ''}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 pb-1.5 border-b border-dark-border">
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-text-muted">{layout.manufacturer} {layout.name}</span>
        {hasLayerB && (
          <div className="flex items-center gap-1">
            <span className="text-text-muted">Layer</span>
            {/* A plain action, so it is the design system's Button rather than
                a hand-rolled one. The MOVE buttons below are not: they carry
                the deck's own colour-per-move language from `moveButtonStyle`,
                which is shared across both of the deck's layouts. */}
            {(['A', 'B'] as const).map((l) => (
              <Button
                key={l}
                variant={layer === l ? 'primary' : 'default'}
                size="sm"
                onClick={() => onLayerChange(l)}
                title={`Layer ${l} — the controller's own LAYER switch; every control sends a different address`}
              >
                {l}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* The panel. Columns are the descriptor's own units, so the proportions
          are the device's: the wide left block, the fader bank with the master
          at its right-hand end, the narrow encoder and transport block beside
          them. It scrolls sideways rather than squeezing — a panel narrower
          than the device stops being the device. */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${layout.width}, minmax(0, 1fr))`,
            gridAutoRows: `minmax(${UNIT_REM}rem, auto)`,
            minWidth: `${layout.width * 2.1}rem`,
          }}
        >
          {placements.map(({ control, binding, w, h }) => {
            const place: React.CSSProperties = {
              gridColumn: `${control.x + 1} / span ${w}`,
              gridRow: `${control.y + 1} / span ${h}`,
            };

            if (LAYER_BUTTON_IDS.has(control.id)) return null;
            if (control.group && SKIPPED_GROUPS.has(control.group)) return null;
            // A fader column IS a channel strip. The strip fills the column,
            // so it is exactly as wide as the button above it and the mute
            // below it — which is what makes the nine columns line up.
            if (control.type === 'fader' && renderChannelStrip) {
              const bound = binding.turn;
              const node = bound?.kind === 'channelSend'
                ? renderChannelStrip(bound.channelId, 'w-full')
                : renderMasterStrip?.('w-full');
              return node ? <div key={control.id} style={place}>{node}</div> : null;
            }
            // Without a strip renderer the whole bank falls back to the deck's
            // own row, placed once across the fader zone.
            if (channelStrip && faderZone?.ids.has(control.id)) return null;

            if (control.type === 'fader') {
              return <div key={control.id} style={place}>{renderFader(binding)}</div>;
            }
            if (control.type === 'encoder') {
              return <div key={control.id} style={place}>{renderEncoder(binding)}</div>;
            }

            const target = binding.press ?? binding.turn;
            const button = target ? renderButton(target, false) : null;
            return (
              <div key={control.id} style={place}>
                {button ?? renderInert(control, binding)}
              </div>
            );
          })}
        </div>
      </div>

      {/* The deck's own strip row, ONLY when the panel is not placing strips
          in their fader columns itself. With `renderChannelStrip` supplied the
          columns carry them, and drawing the row too would be a second copy of
          every channel.

          The original note, kept because it is why the fallback exists: */}
      {/* The channel strip, under the panel rather than inside it.
          It was placed in the fader zone, where the hardware's faders are, and
          that cannot work: a channel card is 224 px wide and a channel strip
          on this device is two of twenty-two grid units, so five cards
          overflowed into the transport block and the panel grew a horizontal
          scrollbar ("its super chaotic atm", 2026-09-23). The panel keeps what
          carries muscle memory — the knobs, the three button rows, the encoder
          block — and the cards get the room they need beneath it. */}
      {!renderChannelStrip && channelStrip}
    </div>
  );
};
