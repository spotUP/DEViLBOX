/**
 * SubsongSelector - Dropdown for switching between Furnace subsongs
 * Displays when a .fur file with multiple subsongs is imported
 */

import React, { useCallback, useMemo } from 'react';
import { useTrackerStore, useTransportStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { Music2 } from 'lucide-react';
import { notify } from '@stores/useNotificationStore';
import type { Pattern, TrackerCell } from '@typedefs';
import { EMPTY_CELL } from '@typedefs';

/** ID generator for unique pattern/channel IDs */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const SubsongSelector: React.FC = React.memo(() => {
  const { patterns, currentPatternIndex, loadPatterns, setPatternOrder } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex,
      loadPatterns: state.loadPatterns,
      setPatternOrder: state.setPatternOrder,
    }))
  );

  const { setBPM, setSpeed } = useTransportStore(
    useShallow((state) => ({
      setBPM: state.setBPM,
      setSpeed: state.setSpeed,
    }))
  );

  // Get subsong metadata from the first pattern's import metadata
  const pattern = patterns[currentPatternIndex];
  const furnaceData = pattern?.importMetadata?.furnaceData;

  // Memoize arrays to prevent re-render loops
  const subsongNames = useMemo(() => furnaceData?.subsongNames || [], [furnaceData?.subsongNames]);
  const allSubsongs = useMemo(() => furnaceData?.allSubsongs || [], [furnaceData?.allSubsongs]);

  const handleSubsongChange = useCallback(
    (newSubsongIndex: number) => {
      if (!furnaceData) return;
      const currentSubsong = furnaceData.currentSubsong ?? 0;
      if (newSubsongIndex === currentSubsong) return;

      // Convert raw pattern cells to full Pattern objects
      const convertPatternCells = (patternCells: unknown[][][], subsongIdx: number): Pattern[] => {
        return patternCells.map((patternChannels, patIdx) => {
          const patternLength = Math.max(...patternChannels.map((ch) => (ch as TrackerCell[]).length));
          const channels = (patternChannels as TrackerCell[][]).map((rows, chIdx) => {
            const paddedRows = [...rows];
            while (paddedRows.length < patternLength) {
              paddedRows.push({ ...EMPTY_CELL });
            }
            return {
              id: generateId('channel'),
              name: `Channel ${chIdx + 1}`,
              rows: paddedRows.slice(0, patternLength),
              muted: false,
              solo: false,
              collapsed: false,
              volume: 80,
              pan: 0,
              instrumentId: null,
              color: null,
            };
          });

          return {
            id: generateId('pattern'),
            name: `Subsong ${subsongIdx} Pattern ${patIdx}`,
            length: patternLength,
            channels,
            importMetadata: pattern?.importMetadata, // Preserve import metadata
          };
        });
      };

      // Load subsong data
      if (newSubsongIndex === 0) {
        // Primary subsong is already the main patterns - just restore if needed
        notify.success(`Switched to: ${subsongNames[0]}`);
        useTrackerStore.setState((state) => {
          const firstPattern = state.patterns[0];
          if (firstPattern?.importMetadata?.furnaceData) {
            firstPattern.importMetadata.furnaceData.currentSubsong = 0;
          }
        });
      } else {
        // Find the subsong data
        const subsongData = allSubsongs.find((s: { subsongIndex: number }) => s.subsongIndex === newSubsongIndex);

        if (!subsongData) {
          notify.error(`Subsong ${newSubsongIndex} data not found`);
          return;
        }

        // Convert raw pattern cells to Pattern objects
        const newPatterns = convertPatternCells(subsongData.patterns, newSubsongIndex);

        // Load new subsong patterns
        loadPatterns(newPatterns);

        // Update pattern order
        setPatternOrder(subsongData.patternOrderTable || Array.from({ length: subsongData.ordersLen || 1 }, (_, i) => i));

        // Update BPM and speed
        setBPM(subsongData.initialBPM || 120);
        setSpeed(subsongData.initialSpeed || 6);

        // Update currentSubsong marker in new patterns
        useTrackerStore.setState((state) => {
          const firstPattern = state.patterns[0];
          if (firstPattern?.importMetadata?.furnaceData) {
            firstPattern.importMetadata.furnaceData.currentSubsong = newSubsongIndex;
          }
        });

        notify.success(`Switched to: ${subsongNames[newSubsongIndex] || `Subsong ${newSubsongIndex + 1}`}`);
      }
    },
    [pattern, furnaceData, subsongNames, allSubsongs, loadPatterns, setPatternOrder, setBPM, setSpeed]
  );

  // Only show if there are multiple subsongs
  if (!furnaceData || !furnaceData.subsongCount || furnaceData.subsongCount <= 1) {
    return null;
  }

  const currentSubsong = furnaceData.currentSubsong ?? 0;

  return (
    <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-dark-border">
      <Music2 size={14} className="shrink-0 text-accent-primary" />
      <span className="text-[10px] text-text-secondary font-medium">SUBSONG:</span>
      <select
        value={currentSubsong}
        onChange={(e) => handleSubsongChange(Number(e.target.value))}
        className="px-2 py-1 text-xs bg-dark-bgSecondary text-text-primary border border-dark-border rounded hover:bg-dark-bgHover transition-colors cursor-pointer outline-none"
        title="Select subsong (Furnace multi-song module)"
      >
        {subsongNames.map((name: string, idx: number) => (
          <option key={idx} value={idx}>
            {idx + 1}. {name || `Subsong ${idx + 1}`}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-text-muted">
        ({currentSubsong + 1}/{furnaceData.subsongCount})
      </span>
    </div>
  );
});

SubsongSelector.displayName = 'SubsongSelector';
