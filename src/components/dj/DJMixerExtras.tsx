/**
 * DJMixerExtras - the mixer's secondary rows: Camelot harmonic-mix wheel, the
 * transition controls and the broadcast tools.
 *
 * DJMixer draws the three rows inline (in their own places) while the mixer column
 * has the height, and behind a "More" button in a popover once the layout gives way
 * (layout.mixer.extras === 'popover'). Same row components either way.
 */

import React, { useCallback, useState } from 'react';
import { useDrumPadStore } from '@/stores/useDrumPadStore';
import { CamelotWheel } from '@/components/dj/CamelotWheel';
import { MixerTransition } from '@/components/dj/MixerTransition';
import { DJSetRecordButton } from '@/components/dj/DJSetRecordButton';
import { DJMicControl } from '@/components/dj/DJMicControl';
import { DJVideoExport } from '@/components/dj/DJVideoExport';
import { DJStreamControl } from '@/components/dj/DJStreamControl';
import { useDJLayoutContext } from '@/components/dj/DJLayoutContext';

/** FX WET - the master dub bus return level; drawn only while the bus is on. */
export const MixerFxWetRow: React.FC = () => {
  const layout = useDJLayoutContext();
  const dubBusEnabled = useDrumPadStore((s) => s.dubBus.enabled);
  const returnGain = useDrumPadStore((s) => s.dubBus.returnGain);
  const handleReturnGainChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useDrumPadStore.getState().setDubBus({ returnGain: Number(e.target.value) });
  }, []);
  if (!dubBusEnabled) return null;
  return (
    <div className="flex items-center gap-2 w-full border-b border-dark-border pb-2" data-dj-band="fxWet" data-dj-budget={layout.budgets.fxWet}>
      <span className="text-text-muted text-[9px] font-mono shrink-0 w-10 text-right">FX WET</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={returnGain}
        onChange={handleReturnGainChange}
        className="flex-1 accent-accent-primary cursor-pointer"
        title={`FX wet level: ${(returnGain * 100).toFixed(0)}%`}
      />
      <span className="text-text-secondary text-[9px] font-mono tabular-nums w-7 text-right shrink-0">
        {(returnGain * 100).toFixed(0)}%
      </span>
    </div>
  );
};

export const MixerCamelotRow: React.FC = () => {
  const layout = useDJLayoutContext();
  return (
    <div className="flex items-center justify-center w-full border-b border-dark-border pb-2" data-dj-band="camelot" data-dj-budget={layout.budgets.camelot}>
      <CamelotWheel size={layout.mixer.camelotWheel} />
    </div>
  );
};

export const MixerTransitionRow: React.FC = () => {
  const layout = useDJLayoutContext();
  return (
    <div className="w-full border-b border-dark-border pb-2" data-dj-band="transition" data-dj-budget={layout.budgets.transition}>
      <MixerTransition />
    </div>
  );
};

/** Broadcast toggle - collapsed by default. */
export const MixerBroadcastRow: React.FC = () => {
  const layout = useDJLayoutContext();
  const [showBroadcast, setShowBroadcast] = useState(false);
  return (
    <div className="flex items-center justify-center gap-2 w-full pt-2 border-t border-dark-border flex-wrap" data-dj-band="broadcast" data-dj-budget={layout.budgets.broadcast}>
      <button
        onClick={() => setShowBroadcast((v) => !v)}
        className={`px-2 py-0.5 text-xs font-mono rounded border transition-colors ${
          showBroadcast
            ? 'bg-accent-primary/20 border-accent-primary/60 text-accent-primary'
            : 'bg-dark-bgSecondary border-dark-border text-text-secondary hover:text-text-primary'
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
  );
};

/** All three, for the popover that holds them once the mixer column is short. */
export const DJMixerExtras: React.FC = () => {
  const layout = useDJLayoutContext();
  return (
    <>
      <MixerCamelotRow />
      <MixerTransitionRow />
      {/* FX WET joins them once the mixer is compact (it is inline above that) */}
      {layout.mixer.fxWet === 'popover' && <MixerFxWetRow />}
      <MixerBroadcastRow />
    </>
  );
};
