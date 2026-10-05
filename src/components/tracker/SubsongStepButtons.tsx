/**
 * Previous / next subsong, for every song that has subsongs (Furnace, UADE
 * editable, SID, ActivisionPro, game-music-emu, ASAP, SNDH). Shown in the
 * FT2 toolbar and the scope view header; switches through the one subsong
 * switch (lib/tracker/subsongSwitch). Hidden when the song has one subsong.
 */
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useFormatStore } from '@stores/useFormatStore';
import { subsongStatus, stepTarget, stepSubsong } from '@/lib/tracker/subsongSwitch';

export interface SubsongStepButtonsProps { showCount?: boolean; className?: string }

export const SubsongStepButtons: React.FC<SubsongStepButtonsProps> = React.memo(({ showCount = true, className = '' }) => {
  const status = useFormatStore(useShallow((s) => subsongStatus(s)));
  if (!status || status.count <= 1) return null;
  return (
    <div className={`flex items-center gap-1 shrink-0 ${className}`}>
      <Button
        variant="ghost" size="sm"
        onClick={() => void stepSubsong(-1)}
        disabled={stepTarget(status, -1) === null}
        title="Previous subsong"
        aria-label="Previous subsong"
        icon={<ChevronLeft size={14} />}
      />
      {showCount && (
        <span className="text-[10px] font-mono text-text-secondary whitespace-nowrap" title="Subsong">
          Subsong {status.current + 1}/{status.count}
        </span>
      )}
      <Button
        variant="ghost" size="sm"
        onClick={() => void stepSubsong(1)}
        disabled={stepTarget(status, 1) === null}
        title="Next subsong"
        aria-label="Next subsong"
        icon={<ChevronRight size={14} />}
      />
    </div>
  );
});

SubsongStepButtons.displayName = 'SubsongStepButtons';
