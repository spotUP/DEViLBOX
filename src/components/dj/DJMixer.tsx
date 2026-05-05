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

import React, { useState, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { MixerFilterKnob, MixerEQBandKnob } from '@/components/dj/MixerEQ';
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
import { useDrumPadStore } from '@/stores/useDrumPadStore';

export const DJMixer: React.FC = () => {
  const thirdDeck = useDJStore((s) => s.thirdDeckActive);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const dubBusEnabled = useDrumPadStore((s) => s.dubBus.enabled);
  const returnGain    = useDrumPadStore((s) => s.dubBus.returnGain);

  const handleReturnGainChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useDrumPadStore.getState().setDubBus({ returnGain: Number(e.target.value) });
  }, []);

  return (
    <div
      className="
        flex flex-col items-center gap-2 p-2
        bg-dark-bg border border-dark-border rounded-lg h-full
      "
    >
      {/* Row 1: Knob columns | Faders | VUs — knobs horizontal, faders/VUs full height */}
      <div className="flex items-stretch justify-center gap-1.5 w-full border-b border-dark-border pb-2">
        {/* Deck A knobs — stacked vertically, kill buttons on outside (left) */}
        <div className="flex flex-col items-center gap-0.5">
          <MixerFilterKnob deckId="A" />
          <MixerEQBandKnob deckId="A" band="high" label="HI" color="#00d4ff" side="left" />
          <MixerEQBandKnob deckId="A" band="mid" label="MID" color="#cccccc" side="left" />
          <MixerEQBandKnob deckId="A" band="low" label="LO" color="#ff8800" side="left" />
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
          <MixerEQBandKnob deckId="B" band="high" label="HI" color="#00d4ff" side="right" />
          <MixerEQBandKnob deckId="B" band="mid" label="MID" color="#cccccc" side="right" />
          <MixerEQBandKnob deckId="B" band="low" label="LO" color="#ff8800" side="right" />
        </div>

        {thirdDeck && (
          <>
            <MixerChannelStrip deckId="C" stretch />
            <div className="flex flex-col items-center gap-0.5">
              <MixerFilterKnob deckId="C" />
              <MixerEQBandKnob deckId="C" band="high" label="HI" color="#00d4ff" side="right" />
              <MixerEQBandKnob deckId="C" band="mid" label="MID" color="#cccccc" side="right" />
              <MixerEQBandKnob deckId="C" band="low" label="LO" color="#ff8800" side="right" />
            </div>
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

      {/* Row 3.5: FX Wet — master dub bus return level, visible when bus is on */}
      {dubBusEnabled && (
        <div className="flex items-center gap-2 w-full border-b border-dark-border pb-2">
          <span className="text-text-muted text-[9px] font-mono shrink-0 w-10 text-right">FX WET</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={returnGain}
            onChange={handleReturnGainChange}
            className="flex-1 accent-accent-highlight cursor-pointer"
            title={`FX wet level: ${(returnGain * 100).toFixed(0)}%`}
          />
          <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
            {(returnGain * 100).toFixed(0)}%
          </span>
        </div>
      )}

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
