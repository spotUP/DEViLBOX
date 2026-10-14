/**
 * DJMixer - Center mixer panel composing all mixer sub-components
 *
 * Layout (top to bottom):
 *   1. Filter+EQ(A) | Fader(A) | VU(A) VU(B) | Fader(B) | Filter+EQ(B)
 *   2. Crossfader
 *   3. Transition controls
 *   4. Master | CueSection
 *   5. Broadcast (collapsed)
 */

import React, { useState, useRef } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { MixerFilterKnob, MixerEQBandKnob } from '@/components/dj/MixerEQ';
import { MixerVUMeter } from '@/components/dj/MixerVUMeter';
import { MixerChannelStrip } from '@/components/dj/MixerChannelStrip';
import { MixerCrossfader } from '@/components/dj/MixerCrossfader';
import { MixerMaster } from '@/components/dj/MixerMaster';
import { MixerCueSection } from '@/components/dj/MixerCueSection';
import { Button } from '@components/ui/Button';
import { AnchoredPopover } from '@components/ui/AnchoredPopover';
import { useDJLayoutContext } from '@/components/dj/DJLayoutContext';
import { DJMixerExtras, MixerFxWetRow, MixerCamelotRow, MixerTransitionRow, MixerBroadcastRow } from '@/components/dj/DJMixerExtras';

export const DJMixer: React.FC = () => {
  const thirdDeck = useDJStore((s) => s.thirdDeckActive);
  const layout = useDJLayoutContext();
  const popover = layout.mixer.extras === 'popover';
  const [showExtras, setShowExtras] = useState(false);
  const moreRef = useRef<HTMLSpanElement>(null);
  return (
    <div
      className={`flex flex-col items-center bg-dark-bg border border-dark-border rounded-lg h-full w-fit ${
        layout.mixer.compact ? 'gap-1 p-1' : 'gap-2 p-2'
      }`}
    >
      {/* Row 1: Knob columns | Faders | VUs — knobs horizontal, faders/VUs full height */}
      <div className="flex items-stretch justify-center gap-1.5 w-full border-b border-dark-border pb-2" data-dj-band="knobs" data-dj-budget={layout.budgets.knobs}>
        {/* Deck A knobs — stacked vertically, kill buttons on outside (left) */}
        <div className="flex flex-col items-center gap-0.5">
          <MixerFilterKnob deckId="A" />
          <MixerEQBandKnob deckId="A" band="high" label="HI" side="left" />
          <MixerEQBandKnob deckId="A" band="mid" label="MID" side="left" />
          <MixerEQBandKnob deckId="A" band="low" label="LO" side="left" />
        </div>

        {/* Deck A fader — stretches full height */}
        <MixerChannelStrip deckId="A" stretch />

        {/* Center VU meters — stretch full height */}
        <div className="flex gap-1 items-stretch">
          <MixerVUMeter deckId="A" stretch />
          <MixerVUMeter deckId="B" stretch />
          {thirdDeck && <MixerVUMeter deckId="C" stretch />}
        </div>

        {/* Deck B fader — stretches full height */}
        <MixerChannelStrip deckId="B" stretch />

        {/* Deck B knobs — stacked vertically, kill buttons on outside (right) */}
        <div className="flex flex-col items-center gap-0.5">
          <MixerFilterKnob deckId="B" />
          <MixerEQBandKnob deckId="B" band="high" label="HI" side="right" />
          <MixerEQBandKnob deckId="B" band="mid" label="MID" side="right" />
          <MixerEQBandKnob deckId="B" band="low" label="LO" side="right" />
        </div>

        {thirdDeck && (
          <>
            <MixerChannelStrip deckId="C" stretch />
            <div className="flex flex-col items-center gap-0.5">
              <MixerFilterKnob deckId="C" />
              <MixerEQBandKnob deckId="C" band="high" label="HI" side="right" />
              <MixerEQBandKnob deckId="C" band="mid" label="MID" side="right" />
              <MixerEQBandKnob deckId="C" band="low" label="LO" side="right" />
            </div>
          </>
        )}
      </div>

      {/* Row 2: Crossfader (A-B only; Deck C is thru). Behind a More button the extras open in a popover. */}
      <div className="flex items-center w-full border-b border-dark-border pb-2" data-dj-band="crossfader" data-dj-budget={layout.budgets.crossfader}>
        <div className="flex-1 min-w-0">
          <MixerCrossfader />
        </div>
        {popover && (
          <span ref={moreRef} className="shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setShowExtras((v) => !v)} title="Camelot wheel, transitions and broadcast">
              More
            </Button>
          </span>
        )}
      </div>

      {popover ? (
        <AnchoredPopover open={showExtras} onClose={() => setShowExtras(false)} anchorRef={moreRef} placement="below" className="w-72">
          <div className="flex flex-col items-center gap-2 p-2 bg-dark-bg border border-dark-border rounded-lg">
            <DJMixerExtras />
          </div>
        </AnchoredPopover>
      ) : (
        <>
          <MixerCamelotRow />
          <MixerTransitionRow />
        </>
      )}

      {/* Row 3.5: FX Wet - master dub bus return level, visible when the bus is on (in the popover once the layout is compact) */}
      {layout.mixer.fxWet === 'inline' && <MixerFxWetRow />}

      {/* Row 4: Master + Cue */}
      <div className="flex items-center justify-center gap-2 w-full" data-dj-band="masterCue" data-dj-budget={layout.budgets.masterCue}>
        <MixerMaster />
        <div className="w-px bg-dark-borderLight self-stretch" />
        <MixerCueSection />
      </div>

      {!popover && <MixerBroadcastRow />}
    </div>
  );
};
