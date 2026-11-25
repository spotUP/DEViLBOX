/**
 * Waveform Studio P4: pick wave A and B and a step count; the host blends them
 * (appendMorphSequence) and writes the result as the instrument's wave macro.
 */
import React, { useState } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { Knob } from '@components/controls/Knob';
import { Button } from '@components/ui/Button';
import { chipLimitsLabel, WAVE_LIST_MAX, type ChipTarget } from './chipTargets';
import { maxMorphSteps } from './waveMorph';

export interface WaveMorphPanelProps {
  waveCount: number;
  target: ChipTarget;
  /** Most waves the list may hold: the list cap, or fewer when the chip plays fewer (Game Boy hUGEDriver: 16). */
  waveLimit?: number;
  onMorph: (a: number, b: number, steps: number) => void;
}

export const WaveMorphPanel: React.FC<WaveMorphPanelProps> = ({ waveCount, target, waveLimit = WAVE_LIST_MAX, onMorph }) => {
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [steps, setSteps] = useState(8);
  const options = Array.from({ length: waveCount }, (_, i) => ({ value: String(i), label: `Wave ${i}` }));
  const waveA = Math.min(a, waveCount - 1);
  const waveB = Math.min(b, waveCount - 1);
  const stepLimit = Math.min(32, maxMorphSteps(waveCount, waveLimit));
  const stepCount = Math.min(steps, stepLimit);
  const limitWhy = waveLimit < WAVE_LIST_MAX
    ? `this chip plays at most ${waveLimit} waves`
    : `the wave list holds at most ${waveLimit} waves`;
  const selectClass = 'bg-dark-bgTertiary border border-dark-borderLight rounded px-1 py-0.5 text-text-primary font-mono text-xs';

  return (
    <div className="flex flex-col gap-1 border border-dark-border rounded-lg p-2">
      <div className="text-[10px] font-mono text-text-muted">
        Wave morph: blends wave A into wave B, adds the in-between waves ({chipLimitsLabel(target)}) and writes them as the Wave macro
      </div>
      {waveCount < 2 ? (
        <div className="text-[10px] font-mono text-text-muted">Add a second wave to morph between two waves</div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-text-secondary">From</span>
          <CustomSelect value={String(waveA)} onChange={(v) => setA(parseInt(v))} options={options} className={selectClass} />
          <span className="text-[10px] font-mono text-text-secondary">To</span>
          <CustomSelect value={String(waveB)} onChange={(v) => setB(parseInt(v))} options={options} className={selectClass} />
          {stepLimit > 2 && (
            <Knob value={stepCount} min={2} max={stepLimit} step={1} onChange={(v) => setSteps(Math.round(v))} label="Steps" size="sm" />
          )}
          <Button variant="primary" size="sm" disabled={waveA === waveB || stepLimit <= 2} onClick={() => onMorph(waveA, waveB, stepCount)}>
            Write Wave Sequence
          </Button>
        </div>
      )}
      {waveCount >= 2 && stepLimit < 32 && (
        <div className="text-[10px] font-mono text-accent-warning">
          {stepLimit <= 2
            ? `No room for in-between waves: ${limitWhy} and the list has ${waveCount}`
            : `Steps limited to ${stepLimit}: ${limitWhy} and the list has ${waveCount}`}
        </div>
      )}
    </div>
  );
};
