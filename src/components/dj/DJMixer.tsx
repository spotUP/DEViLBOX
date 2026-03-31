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

import React, { useState } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { MixerEQ } from '@/components/dj/MixerEQ';
import { MixerVUMeter } from '@/components/dj/MixerVUMeter';
import { MixerChannelStrip } from '@/components/dj/MixerChannelStrip';
import { MixerCrossfader } from '@/components/dj/MixerCrossfader';
import { MixerTransition } from '@/components/dj/MixerTransition';
import { MixerMaster } from '@/components/dj/MixerMaster';
import { MixerCueSection } from '@/components/dj/MixerCueSection';
import { DJSetRecordButton } from '@/components/dj/DJSetRecordButton';
import { DJMicControl } from '@/components/dj/DJMicControl';
import { DJVideoExport } from '@/components/dj/DJVideoExport';
import { DJStreamControl } from '@/components/dj/DJStreamControl';

export const DJMixer: React.FC = () => {
  const thirdDeck = useDJStore((s) => s.thirdDeckActive);
  const [showBroadcast, setShowBroadcast] = useState(false);

  return (
    <div
      className="
        flex flex-col items-center gap-2 p-2
        bg-dark-bg border border-dark-border rounded-lg h-full
      "
    >
      {/* Row 1: Filter+EQ | Fader | VUs | Fader | Filter+EQ — all stretch to same height */}
      <div className="flex items-stretch justify-center gap-1 w-full border-b border-dark-border pb-2">
        <MixerEQ deckId="A" />
        <MixerChannelStrip deckId="A" stretch />

        {/* Center VU meters — stretch full height */}
        <div className="flex gap-1 items-stretch mx-0.5">
          <MixerVUMeter deckId="A" stretch />
          <MixerVUMeter deckId="B" stretch />
          {thirdDeck && <MixerVUMeter deckId="C" stretch />}
        </div>

        <MixerChannelStrip deckId="B" stretch />
        <MixerEQ deckId="B" />
        {thirdDeck && (
          <>
            <MixerChannelStrip deckId="C" stretch />
            <MixerEQ deckId="C" />
          </>
        )}
      </div>

      {/* Row 2: Crossfader (A↔B only; Deck C is thru) */}
      <div className="w-full border-b border-dark-border pb-2">
        <MixerCrossfader />
      </div>

      {/* Row 3: Transition controls */}
      <div className="w-full border-b border-dark-border pb-2">
        <MixerTransition />
      </div>

      {/* Row 4: Master + Cue */}
      <div className="flex items-center justify-center gap-2 w-full">
        <MixerMaster />
        <div className="w-px bg-dark-borderLight self-stretch" />
        <MixerCueSection />
      </div>

      {/* Row 5: Broadcast toggle — collapsed by default */}
      <div className="flex items-center justify-center gap-2 w-full pt-2 border-t border-dark-border flex-wrap">
        <button
          onClick={() => setShowBroadcast(v => !v)}
          className={`px-2 py-0.5 text-xs font-mono rounded border transition-colors ${
            showBroadcast
              ? 'bg-red-900/40 border-red-700/60 text-red-300'
              : 'bg-dark-surface border-dark-border text-dark-textSecondary hover:text-dark-text'
          }`}
        >
          BROADCAST
        </button>
        {showBroadcast && (
          <>
            <DJSetRecordButton />
            <DJVideoExport />
            <DJStreamControl />
            <DJMicControl />
          </>
        )}
      </div>
    </div>
  );
};
