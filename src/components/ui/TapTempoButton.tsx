/**
 * TapTempoButton - "Tap" button that shows the BPM tapped out on it.
 *
 * Display only: it never changes a song's tempo or a deck's beat grid. The
 * calculation (2-8 taps averaged, reset after 2 s idle) is useTapTempo's.
 * `tapRef` receives the tap function so a keyboard key can drive the same
 * button later without a second calculator.
 */
import React from 'react';
import { Button } from './Button';
import { useTapTempo } from '@/hooks/useTapTempo';

export interface TapTempoButtonProps {
  /** Receives the tap function (null on unmount) for a future keyboard binding. */
  tapRef?: React.MutableRefObject<(() => void) | null>;
  className?: string;
}

export const TapTempoButton: React.FC<TapTempoButtonProps> = ({ tapRef, className = '' }) => {
  const { bpm, isActive, tap } = useTapTempo();

  React.useEffect(() => {
    if (!tapRef) return;
    tapRef.current = tap;
    return () => { tapRef.current = null; };
  }, [tapRef, tap]);

  return (
    <Button
      variant={isActive && bpm !== null ? 'primary' : 'default'}
      size="sm"
      onClick={tap}
      className={`tabular-nums shrink-0 ${className}`}
      title="Tap along with the beat to read its BPM (display only, changes nothing)"
    >
      {isActive && bpm !== null ? `Tap ${bpm}` : 'Tap'}
    </Button>
  );
};
