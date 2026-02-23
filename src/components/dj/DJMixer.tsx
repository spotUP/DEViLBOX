/**
 * DJMixer - Center mixer panel composing all mixer sub-components
 *
 * Layout (top to bottom):
 *   1. EQ(A) | VU(A) | Filter(A) | Filter(B) | VU(B) | EQ(B)
 *   2. ChannelStrip(A) | gap | ChannelStrip(B)
 *   3. Crossfader
 *   4. Master | CueSection
 */

import React from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { MixerEQ } from '@/components/dj/MixerEQ';
import { MixerFilter } from '@/components/dj/MixerFilter';
import { MixerVUMeter } from '@/components/dj/MixerVUMeter';
import { MixerChannelStrip } from '@/components/dj/MixerChannelStrip';
import { MixerCrossfader } from '@/components/dj/MixerCrossfader';
import { MixerTransition } from '@/components/dj/MixerTransition';
import { MixerMaster } from '@/components/dj/MixerMaster';
import { MixerCueSection } from '@/components/dj/MixerCueSection';

export const DJMixer: React.FC = () => {
  const thirdDeck = useDJStore((s) => s.thirdDeckActive);

  return (
    <div
      className="
        flex flex-col items-center gap-2 p-2
        bg-dark-bg border border-dark-border rounded-lg h-full
      "
    >
      {/* Row 1: Filters */}
      <div className="flex items-center justify-center gap-4 w-full border-b border-dark-border pb-2">
        <MixerFilter deckId="A" />
        <MixerFilter deckId="B" />
        {thirdDeck && <MixerFilter deckId="C" />}
      </div>

      {/* Row 2: EQ + VU meters */}
      <div className="flex items-end justify-center gap-1 w-full border-b border-dark-border pb-2">
        <MixerEQ deckId="A" />

        {/* Center VU meters — aligned to bottom, tall */}
        <div className="flex gap-1 items-end mx-0.5">
          <MixerVUMeter deckId="A" />
          <MixerVUMeter deckId="B" />
          {thirdDeck && <MixerVUMeter deckId="C" />}
        </div>

        <MixerEQ deckId="B" />
        {thirdDeck && <MixerEQ deckId="C" />}
      </div>

      {/* Row 2: Channel strips */}
      <div className="flex items-start justify-center gap-4 w-full border-b border-dark-border pb-2">
        <MixerChannelStrip deckId="A" />
        <div className="w-px bg-dark-borderLight self-stretch" />
        <MixerChannelStrip deckId="B" />
        {thirdDeck && (
          <>
            <div className="w-px bg-dark-borderLight self-stretch" />
            <MixerChannelStrip deckId="C" />
          </>
        )}
      </div>

      {/* Row 3: Crossfader (A↔B only; Deck C is thru) */}
      <div className="w-full border-b border-dark-border pb-2">
        <MixerCrossfader />
      </div>

      {/* Row 3.5: Transition controls */}
      <div className="w-full border-b border-dark-border pb-2">
        <MixerTransition />
      </div>

      {/* Row 4: Master + Cue */}
      <div className="flex items-center justify-center gap-2 w-full">
        <MixerMaster />
        <div className="w-px bg-dark-borderLight self-stretch" />
        <MixerCueSection />
      </div>
    </div>
  );
};
