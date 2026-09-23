/**
 * ControllerShapedDeck — the dub deck, arranged the way the hardware is.
 *
 * "my idea is that the dub deck in devilbox should match my hw controller
 * layoutwize" (2026-09-23). The deck keeps ITS OWN LOOK — the same move
 * buttons in the same colours, the same faders — and only the ARRANGEMENT
 * changes: button row 1 of the deck sits where button row 1 of the controller
 * sits, the eight channel sends stand in a row of faders, the select row runs
 * underneath them.
 *
 * What this deliberately is NOT: the schematic from the MIDI mapper dialog.
 * That drawing exists to answer "which knob is CC10" and is built for reading,
 * not for playing. A first attempt reused it here and the deck stopped looking
 * like the deck, which is the whole thing that was asked for — the layout was
 * meant to change, the design was not.
 *
 * Every gesture calls the deck's own handlers, passed in through `api`. None
 * of the interaction logic is re-implemented: two shapes of one deck that each
 * fired moves their own way would drift apart move by move, and the first
 * symptom would be a hold that never releases in one shape and does in the
 * other.
 *
 * Which control plays what is decided in `deckShape.ts`, which is pure and
 * tested. This file is presentation and wiring.
 */

import React, { useCallback, useMemo } from 'react';
import { Fader } from '@components/controls/Fader';
import type { ControllerLayout, ControlDescriptor } from '@/midi/controllerLayouts';
import { getPresetById } from '@/midi/djControllerPresets';
import { useMIDIPresetStore } from '@/stores/useMIDIPresetStore';
import { colorClasses } from './moveButtonStyle';
import {
  buildDeckBindings,
  isDeckInert,
  type ControlDeckBinding,
  type DeckMove,
  type DeckTarget,
} from './deckShape';

/**
 * The deck's own handlers, passed in rather than re-created.
 *
 * Exactly the set the generic deck's buttons call — including
 * `holdButtonProps`, so a hold on the controller shape is the same pointer
 * gesture, with the same four ways out of a held state, as a hold on the
 * generic deck.
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
  setArmed: (armed: boolean) => void;
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
  armed: boolean;
  busEnabled: boolean;
  /** Is this move firing — on this channel when one is named. */
  isFiring: (moveId: string, channelId?: number) => boolean;
  /** Keys are `${moveId}:${channelId ?? 'g'}`, as the deck keeps them. */
  heldMoves: ReadonlySet<string>;
  toggledMoves: ReadonlySet<string>;
  activeRatePreset: string | null;
  api: DubDeckControlApi;
}

/**
 * The layer indicators are program-change pseudo-controls with negative
 * numbers. On the hardware they are what you press to change bank; on screen
 * they do the same job. Recognised by id, because that is all the descriptor
 * gives them.
 */
const LAYER_BUTTON_IDS: Readonly<Record<string, 'A' | 'B'>> = {
  'layer-a': 'A',
  'layer-b': 'B',
};

/** One grid unit. The panel is `layout.width` of these across. */
const UNIT_REM = 1.15;

/** Footprint in grid units. Controls sit two apart, so two is the default. */
const footprint = (c: ControlDescriptor) => ({
  w: c.w ?? (c.type === 'fader' ? 1 : 2),
  h: c.h ?? (c.type === 'fader' ? 4 : 2),
});

/** The caption a control carries when the deck has nothing to put there. */
const inertCaption = (c: ControlDescriptor) => c.label ?? '';

export const ControllerShapedDeck: React.FC<ControllerShapedDeckProps> = ({
  layout,
  layer,
  onLayerChange,
  moves,
  channelSends,
  armed,
  busEnabled,
  isFiring,
  heldMoves,
  toggledMoves,
  activeRatePreset,
  api,
}) => {
  const overrides = useMIDIPresetStore(
    useCallback((s) => s.overrides[layout.id], [layout.id]),
  );

  const bindings = useMemo(
    () => buildDeckBindings({
      layout,
      layer,
      preset: getPresetById(layout.id),
      overrides: overrides ?? {},
      moves,
    }),
    [layout, layer, overrides, moves],
  );

  const hasLayerB = useMemo(
    () => layout.controls.some((c) => c.layer === 'B'),
    [layout],
  );

  /** The controls on screen: this layer, plus anything that has no layer. */
  const visible = useMemo(
    () => layout.controls.filter((c) => !c.layer || c.layer === layer),
    [layout, layer],
  );

  /**
   * Is the move on this control active right now?
   *
   * The deck keeps held moves under `${moveId}:${channelId ?? 'g'}`, toggles
   * under the bare move id, and the rate group under a single active id. Read
   * exactly as the generic deck reads them, so a lit button means the same
   * thing in both shapes.
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

  /** A latched control gets the same ring the generic deck gives it. */
  const isLatched = useCallback((t: DeckTarget): boolean => (
    t.kind === 'move' && (
      (t.move.interaction === 'toggle' && toggledMoves.has(t.move.moveId)) ||
      (t.move.interaction === 'rate' && activeRatePreset === t.move.moveId)
    )
  ), [toggledMoves, activeRatePreset]);

  /**
   * Render one control as the deck's own button.
   *
   * A hold gets the pointer gesture; a trigger, toggle and rate preset get a
   * click — the same split, made the same way, as the rows in `DubDeckStrip`.
   */
  const renderButton = (target: DeckTarget) => {
    const active = isActive(target);
    const latched = isLatched(target);
    const cls = colorClasses(
      target.kind === 'move' ? target.move.color : 'accent-error',
      active,
      'sm',
    ) + ' w-full h-full flex items-center justify-center text-center leading-tight' +
      (latched ? ' ring-2 ring-offset-1 ring-offset-dark-bgSecondary ring-white/70' : '');

    if (target.kind === 'armed') {
      return (
        <button
          className={cls}
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

  /** A control the deck cannot drive: drawn, named, and quiet. */
  const renderInert = (control: ControlDescriptor, binding: ControlDeckBinding) => {
    const named = binding.turn ?? binding.press;
    const caption = inertCaption(control) || (named ? named.target.replace(/^(dub|dj)\./, '') : '');
    return (
      <div
        className="w-full h-full rounded border border-dark-border bg-dark-bg/40 flex items-center justify-center px-0.5 text-[9px] font-mono text-text-muted text-center leading-none overflow-hidden"
        title={named ? `${named.target} — driven by the hardware, not from here` : `${control.id} — nothing assigned`}
      >
        {caption}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 pb-1.5">
      {/* The panel's own header: which hardware this is, and its LAYER switch
          — the one control that changes what every other control means. */}
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-text-muted">
          {layout.manufacturer} {layout.name}
        </span>
        {hasLayerB && (
          <div className="flex items-center gap-1">
            <span className="text-text-muted">Layer</span>
            {(['A', 'B'] as const).map((l) => (
              <button
                key={l}
                className={
                  'px-2 py-0.5 rounded border text-[10px] font-bold ' +
                  (layer === l
                    ? 'bg-accent-primary text-text-inverse border-accent-primary'
                    : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:border-accent-primary')
                }
                onClick={() => onLayerChange(l)}
                title={`Layer ${l} — the controller's own LAYER switch; every control sends a different address`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The panel. A grid of the descriptor's own units, so a control lands
          where it lands on the hardware. It scrolls sideways rather than
          squeezing: a panel narrower than the device stops being the device. */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${layout.width}, minmax(0, 1fr))`,
            gridAutoRows: `${UNIT_REM}rem`,
            minWidth: `${layout.width * UNIT_REM}rem`,
          }}
        >
          {visible.map((control) => {
            const { w, h } = footprint(control);
            const place: React.CSSProperties = {
              gridColumn: `${control.x + 1} / span ${w}`,
              gridRow: `${control.y + 1} / span ${h}`,
            };

            // The layer indicators switch the bank, here as on the device.
            const layerTarget = LAYER_BUTTON_IDS[control.id];
            if (layerTarget) {
              return (
                <div key={control.id} style={place}>
                  <button
                    className={
                      'w-full h-full rounded border text-[10px] font-bold ' +
                      (layer === layerTarget
                        ? 'bg-accent-primary text-text-inverse border-accent-primary'
                        : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary hover:border-accent-primary')
                    }
                    onClick={() => onLayerChange(layerTarget)}
                    title={`Layer ${layerTarget}`}
                  >
                    {control.label ?? `Layer ${layerTarget}`}
                  </button>
                </div>
              );
            }

            const binding = bindings[control.id] ?? {};

            // A fader whose turn rides a channel send is a channel send.
            if (control.type === 'fader' && binding.turn?.kind === 'channelSend') {
              const channelId = binding.turn.channelId;
              return (
                <div key={control.id} style={place} className="flex flex-col items-center justify-end">
                  <Fader
                    value={channelSends[channelId] ?? 0}
                    onChange={(v) => api.setChannelSend(channelId, v)}
                    size="sm"
                    fillHeight
                    color="accent-primary"
                    disabled={!busEnabled}
                    title={`Channel ${channelId + 1} dub send`}
                  />
                  <span className="text-[9px] font-mono text-text-muted leading-none pt-0.5">
                    {channelId + 1}
                  </span>
                </div>
              );
            }

            if (isDeckInert(binding)) {
              return (
                <div key={control.id} style={place}>
                  {renderInert(control, binding)}
                </div>
              );
            }

            // Everything else plays what its PRESS does — an encoder's push
            // included, which is where the echo-rate presets live.
            const target = binding.press ?? binding.turn;
            if (!target) {
              return <div key={control.id} style={place}>{renderInert(control, binding)}</div>;
            }
            return (
              <div key={control.id} style={place}>
                {renderButton(target) ?? renderInert(control, binding)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
