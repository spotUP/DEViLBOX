/**
 * usePatternPlayback - Pattern playback integration
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTrackerStore, useTransportStore, useInstrumentStore, useAutomationStore, useAudioStore } from '@stores';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getPatternScheduler } from '@engine/PatternScheduler';

export const usePatternPlayback = () => {
  const { patterns, currentPatternIndex, setCurrentPattern } = useTrackerStore();
  const { isPlaying, isLooping, bpm, setCurrentRow, setCurrentRowThrottled } = useTransportStore();
  const { instruments } = useInstrumentStore();
  const { automation } = useAutomationStore();
  const { masterEffects } = useAudioStore();

  const pattern = patterns[currentPatternIndex];
  const engine = getToneEngine();
  const scheduler = getPatternScheduler();

  // Use ref to track if we're currently advancing to avoid race conditions
  const isAdvancingRef = useRef(false);
  // Track timeout IDs for cleanup to prevent memory leaks
  const advancingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use ref to track current pattern index for callbacks (avoids stale closure)
  const currentPatternIndexRef = useRef(currentPatternIndex);
  useEffect(() => {
    currentPatternIndexRef.current = currentPatternIndex;
  }, [currentPatternIndex]);

  // Cleanup advancing timeouts on unmount
  useEffect(() => {
    return () => {
      if (advancingTimeoutRef.current) {
        clearTimeout(advancingTimeoutRef.current);
        advancingTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle pattern advancement when current pattern ends
  const handlePatternEnd = useCallback(() => {
    if (isAdvancingRef.current) return; // Prevent double-triggering
    isAdvancingRef.current = true;

    // Get the time when current pattern ends - next pattern should start here
    const patternEndTime = scheduler.getPatternEndTime();

    // Use ref to get CURRENT pattern index (not stale closure value)
    const actualCurrentIndex = currentPatternIndexRef.current;

    // Check for queued pattern from live mode
    const liveModeState = useLiveModeStore.getState();
    const pendingPatternIndex = liveModeState.pendingPatternIndex;
    const isLiveMode = liveModeState.isLiveMode;

    // If there's a queued pattern in live mode, switch to it
    if (isLiveMode && pendingPatternIndex !== null && pendingPatternIndex < patterns.length) {
      console.log(`[Playback] Live mode: Switching to queued pattern ${pendingPatternIndex} at time ${patternEndTime}s`);

      const queuedPattern = patterns[pendingPatternIndex];
      scheduler.schedulePattern(queuedPattern, instruments, (row) => {
        setCurrentRowThrottled(row, queuedPattern.length);
        if (row === 0) {
          setCurrentPattern(pendingPatternIndex);
        }
      }, patternEndTime);

      // Clear the queue
      liveModeState.clearQueue();
    } else if (isLooping) {
      // Loop current pattern - re-schedule the same pattern
      console.log(`[Playback] Looping current pattern ${actualCurrentIndex} at time ${patternEndTime}s`);

      const currentPattern = patterns[actualCurrentIndex];
      scheduler.schedulePattern(currentPattern, instruments, (row) => {
        setCurrentRowThrottled(row, currentPattern.length);
      }, patternEndTime);
      // Don't change pattern index - stay on current
    } else {
      const nextIndex = actualCurrentIndex + 1;

      if (nextIndex < patterns.length) {
        // Advance to next pattern - schedule at the exact end time for seamless transition
        console.log(`[Playback] Advancing to pattern ${nextIndex}/${patterns.length} at time ${patternEndTime}s`);

        // Schedule next pattern at the exact end time (before React state updates)
        const nextPattern = patterns[nextIndex];
        scheduler.schedulePattern(nextPattern, instruments, (row) => {
          setCurrentRowThrottled(row, nextPattern.length);
          // Update UI state when first row of new pattern plays
          if (row === 0) {
            setCurrentPattern(nextIndex);
          }
        }, patternEndTime);
      } else {
        // End of song - loop back to beginning
        console.log('[Playback] End of song, looping to beginning');
        const firstPattern = patterns[0];
        scheduler.schedulePattern(firstPattern, instruments, (row) => {
          setCurrentRowThrottled(row, firstPattern.length);
          // Update UI state when first row of new pattern plays
          if (row === 0) {
            setCurrentPattern(0);
          }
        }, patternEndTime);
      }
    }

    // Reset advancing flag after a short delay (with cleanup tracking)
    if (advancingTimeoutRef.current) clearTimeout(advancingTimeoutRef.current);
    advancingTimeoutRef.current = setTimeout(() => {
      isAdvancingRef.current = false;
      advancingTimeoutRef.current = null;
    }, 100);
  }, [patterns, instruments, isLooping, setCurrentPattern, setCurrentRowThrottled]);

  // Handle pattern break (Dxx command) - advance to next pattern
  const handlePatternBreak = useCallback((targetRow: number) => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;

    // Use ref to get CURRENT pattern index (not stale closure value)
    const actualCurrentIndex = currentPatternIndexRef.current;
    const nextIndex = actualCurrentIndex + 1;
    const patternEndTime = scheduler.getPatternEndTime();
    console.log(`[Playback] Pattern break to next pattern at time ${patternEndTime}s, target row ${targetRow}`);

    if (nextIndex < patterns.length) {
      const nextPattern = patterns[nextIndex];
      scheduler.schedulePattern(nextPattern, instruments, (row) => {
        setCurrentRowThrottled(row, nextPattern.length);
        if (row === 0) setCurrentPattern(nextIndex);
      }, patternEndTime);
    } else if (isLooping) {
      const firstPattern = patterns[0];
      scheduler.schedulePattern(firstPattern, instruments, (row) => {
        setCurrentRowThrottled(row, firstPattern.length);
        if (row === 0) setCurrentPattern(0);
      }, patternEndTime);
    } else {
      engine.stop();
      scheduler.clearSchedule();
    }

    if (advancingTimeoutRef.current) clearTimeout(advancingTimeoutRef.current);
    advancingTimeoutRef.current = setTimeout(() => {
      isAdvancingRef.current = false;
      advancingTimeoutRef.current = null;
    }, 100);
  }, [patterns, instruments, isLooping, setCurrentPattern, setCurrentRowThrottled]);

  // Handle position jump (Bxx command) - jump to specific song position
  const handlePositionJump = useCallback((position: number) => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;

    const patternEndTime = scheduler.getPatternEndTime();
    console.log(`[Playback] Position jump to pattern ${position} at time ${patternEndTime}s`);

    if (position < patterns.length) {
      const targetPattern = patterns[position];
      scheduler.schedulePattern(targetPattern, instruments, (row) => {
        setCurrentRowThrottled(row, targetPattern.length);
        if (row === 0) setCurrentPattern(position);
      }, patternEndTime);
    } else if (isLooping) {
      const firstPattern = patterns[0];
      scheduler.schedulePattern(firstPattern, instruments, (row) => {
        setCurrentRowThrottled(row, firstPattern.length);
        if (row === 0) setCurrentPattern(0);
      }, patternEndTime);
    } else {
      engine.stop();
      scheduler.clearSchedule();
    }

    if (advancingTimeoutRef.current) clearTimeout(advancingTimeoutRef.current);
    advancingTimeoutRef.current = setTimeout(() => {
      isAdvancingRef.current = false;
      advancingTimeoutRef.current = null;
    }, 100);
  }, [patterns, instruments, isLooping, setCurrentPattern, setCurrentRowThrottled]);

  // Keep automation in sync during playback
  // This ensures automation changes are applied even after playback has started
  useEffect(() => {
    if (isPlaying && hasStartedRef.current) {
      console.log('[Playback] Syncing automation data during playback:', {
        hasAutomation: Object.keys(automation).length > 0,
        patternIds: Object.keys(automation),
      });
      scheduler.setAutomation(automation);
      // Also update the automation player directly
      const automationPlayer = scheduler['automationPlayer'];
      if (automationPlayer) {
        automationPlayer.setAutomationData(automation);
      }
    }
  }, [automation, isPlaying]);

  // Sync BPM changes
  useEffect(() => {
    engine.setBPM(bpm);
  }, [bpm]);

  // Sync master effects
  useEffect(() => {
    engine.rebuildMasterEffects(masterEffects);
  }, [masterEffects]);

  // Sync channel settings when pattern changes
  useEffect(() => {
    if (pattern) {
      pattern.channels.forEach((channel, idx) => {
        // Set channel volume (convert 0-100 to dB)
        const volumeDb = channel.volume > 0 ? -60 + (channel.volume / 100) * 60 : -Infinity;
        engine.setChannelVolume(idx, volumeDb);
        engine.setChannelPan(idx, channel.pan);
      });
      // Update mute/solo states (handles solo logic)
      engine.updateMuteStates(pattern.channels.map(ch => ({ muted: ch.muted, solo: ch.solo })));
    }
  }, [pattern]);

  // Track if we've started playback (to avoid re-scheduling on pattern changes)
  const hasStartedRef = useRef(false);

  // Handle playback start/stop - only schedules initial pattern, callbacks handle transitions
  useEffect(() => {
    if (isPlaying && pattern && !hasStartedRef.current) {
      // Start playback - schedule initial pattern
      console.log(`[Playback] Starting playback at pattern ${currentPatternIndex}: ${pattern.name}`);
      hasStartedRef.current = true;

      // Set automation data
      scheduler.setAutomation(automation);

      // Set pattern callbacks for song advancement
      scheduler.setOnPatternEnd(handlePatternEnd);
      scheduler.setOnPatternBreak(handlePatternBreak);
      scheduler.setOnPositionJump(handlePositionJump);

      // Schedule initial pattern at time 0
      scheduler.schedulePattern(pattern, instruments, (row) => {
        setCurrentRowThrottled(row, pattern.length);
      }, 0);

      // Start transport
      engine.start().catch((err) => {
        console.error('Failed to start transport:', err);
      });
    } else if (!isPlaying && hasStartedRef.current) {
      // Stop playback
      console.log('[Playback] Stopping playback');
      hasStartedRef.current = false;
      engine.stop();
      scheduler.clearSchedule();
      scheduler.setOnPatternEnd(null);
      scheduler.setOnPatternBreak(null);
      scheduler.setOnPositionJump(null);
      setCurrentRow(0);
    }

    return () => {
      // Cleanup on unmount
      if (!isPlaying) {
        scheduler.clearSchedule();
        scheduler.setOnPatternEnd(null);
        scheduler.setOnPatternBreak(null);
        scheduler.setOnPositionJump(null);
      }
    };
  }, [isPlaying, pattern, instruments, automation, handlePatternEnd, handlePatternBreak, handlePositionJump, setCurrentRow, setCurrentRowThrottled, currentPatternIndex]);

  return {
    isPlaying,
  };
};
