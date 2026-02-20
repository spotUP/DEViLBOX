/**
 * DJMixer - Center mixer panel composing all mixer sub-components
 *
 * Layout (top to bottom):
 *   1. EQ(A) | Filter(A) | Filter(B) | EQ(B)
 *   2. ChannelStrip(A) | gap | ChannelStrip(B)
 *   3. Crossfader
 *   4. Master | CueSection
 */

import React from 'react';
import { MixerEQ } from '@/components/dj/MixerEQ';
import { MixerFilter } from '@/components/dj/MixerFilter';
import { MixerChannelStrip } from '@/components/dj/MixerChannelStrip';
import { MixerCrossfader } from '@/components/dj/MixerCrossfader';
import { MixerMaster } from '@/components/dj/MixerMaster';
import { MixerCueSection } from '@/components/dj/MixerCueSection';

export const DJMixer: React.FC = () => {
  return (
    <div
      className="
        flex flex-col items-center gap-2 p-2
        bg-dark-bg border border-dark-border rounded-lg h-full
      "
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.01) 3px, rgba(255,255,255,0.01) 4px)',
      }}
    >
      {/* Row 1: EQ + Filters */}
      <div className="flex items-start justify-center gap-1 w-full border-b border-dark-border pb-2">
        <MixerEQ deckId="A" />
        <MixerFilter deckId="A" />

        {/* Center divider */}
        <div className="w-px bg-dark-borderLight self-stretch mx-0.5" />

        <MixerFilter deckId="B" />
        <MixerEQ deckId="B" />
      </div>

      {/* Row 2: Channel strips */}
      <div className="flex items-start justify-center gap-4 w-full border-b border-dark-border pb-2">
        <MixerChannelStrip deckId="A" />
        <div className="w-px bg-dark-borderLight self-stretch" />
        <MixerChannelStrip deckId="B" />
      </div>

      {/* Row 3: Crossfader */}
      <div className="w-full border-b border-dark-border pb-2">
        <MixerCrossfader />
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
