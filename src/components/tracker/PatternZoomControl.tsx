/**
 * PatternZoomControl - the zoom slider of a pattern view, with the Fit control
 * beside it. Presentation only: the host (tracker bar, DJ deck) owns the state.
 *
 * `scale` is the scale the pattern is drawn at NOW: while fit is on that is the
 * fit result, so the slider always shows what is on screen. Moving the slider
 * hands the size to the user (the host turns fit off); Fit hands it back.
 */
import React from 'react';
import { Fader } from '@components/controls/Fader';
import { Button } from '@components/ui/Button';
import { clampZoomPercent, ZOOM_MAX_PERCENT, ZOOM_MIN_PERCENT } from '@/lib/tracker/patternZoom';

export interface PatternZoomControlProps {
  /** The scale the pattern is drawn at now (1 = the base font). */
  scale: number;
  /** Whether fit all channels is on for this view. */
  fit: boolean;
  /** The slider moved (percent, 50-200). */
  onZoom: (percent: number) => void;
  /** Fit pressed: turn fit all channels back on. */
  onFit: () => void;
  className?: string;
}

export const PatternZoomControl: React.FC<PatternZoomControlProps> = ({ scale, fit, onZoom, onFit, className = '' }) => {
  const percent = clampZoomPercent(scale * 100);
  return (
    <div
      className={'flex items-center gap-1.5 select-none ' + className}
      title={fit ? 'Pattern zoom: fit all channels is on, the slider shows its result' : 'Pattern zoom'}
    >
      <span className="text-[9px] font-mono text-text-muted">Zoom</span>
      <Fader
        orientation="horizontal"
        size="sm"
        length={72}
        min={ZOOM_MIN_PERCENT}
        max={ZOOM_MAX_PERCENT}
        value={percent}
        onChange={onZoom}
        doubleClickValue={100}
        title={`Pattern zoom ${percent}%`}
      />
      <span className="text-[9px] font-mono text-text-secondary tabular-nums w-8 text-right">{percent}%</span>
      <Button
        variant={fit ? 'primary' : 'compact'}
        size="sm"
        onClick={onFit}
        aria-pressed={fit}
        title="Fit all channels: shrink the pattern so every channel is on screen"
      >
        Fit
      </Button>
    </div>
  );
};
