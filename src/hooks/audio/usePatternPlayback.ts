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
  const { isPlaying, isLooping, bpm, setCurrentRow } = useTransportStore();
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
        setCurrentRow(row, queuedPattern.length);
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
        setCurrentRow(row, currentPattern.length);
      }, patternEndTime);
      // Don't change pattern index - stay on current
    } else {
      const nextIndex = actualCurrentIndex + 1;

      if (nextIndex < patterns.length) {
        // Advance to next pattern
        console.log(`[Playback] Advancing to pattern ${nextIndex}/${patterns.length} at time ${patternEndTime}s`);

        const nextPattern = patterns[nextIndex];
        scheduler.schedulePattern(nextPattern, instruments, (row) => {
          setCurrentRow(row, nextPattern.length);
          if (row === 0) {
            // Use store directly to avoid stale state in callback
            useTrackerStore.getState().setCurrentPattern(nextIndex);
          }
        }, patternEndTime);
      } else {
        // End of song - ALWAYS loop back to beginning in DEViLBOX
        console.log('[Playback] End of song, looping to beginning');
        const firstPattern = patterns[0];
        scheduler.schedulePattern(firstPattern, instruments, (row) => {
          setCurrentRow(row, firstPattern.length);
          if (row === 0) {
            useTrackerStore.getState().setCurrentPattern(0);
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
  }, [patterns, instruments, isLooping, setCurrentPattern, setCurrentRow, scheduler]);

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
        setCurrentRow(row, nextPattern.length);
        if (row === 0) useTrackerStore.getState().setCurrentPattern(nextIndex);
      }, patternEndTime);
    } else {
      // ALWAYS loop back to beginning in DEViLBOX
      const firstPattern = patterns[0];
      scheduler.schedulePattern(firstPattern, instruments, (row) => {
        setCurrentRow(row, firstPattern.length);
        if (row === 0) useTrackerStore.getState().setCurrentPattern(0);
      }, patternEndTime);
    }

    if (advancingTimeoutRef.current) clearTimeout(advancingTimeoutRef.current);
    advancingTimeoutRef.current = setTimeout(() => {
      isAdvancingRef.current = false;
      advancingTimeoutRef.current = null;
    }, 100);
  }, [patterns, instruments, isLooping, setCurrentPattern, setCurrentRow, scheduler, engine]);

  // Handle position jump (Bxx command) - jump to specific song position
  const handlePositionJump = useCallback((position: number) => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;

    const patternEndTime = scheduler.getPatternEndTime();
    console.log(`[Playback] Position jump to pattern ${position} at time ${patternEndTime}s`);

    if (position < patterns.length) {
      const targetPattern = patterns[position];
      scheduler.schedulePattern(targetPattern, instruments, (row) => {
        setCurrentRow(row, targetPattern.length);
        if (row === 0) useTrackerStore.getState().setCurrentPattern(position);
      }, patternEndTime);
    } else {
      // ALWAYS loop back to beginning in DEViLBOX
      const firstPattern = patterns[0];
      scheduler.schedulePattern(firstPattern, instruments, (row) => {
        setCurrentRow(row, firstPattern.length);
        if (row === 0) useTrackerStore.getState().setCurrentPattern(0);
      }, patternEndTime);
    }

    if (advancingTimeoutRef.current) clearTimeout(advancingTimeoutRef.current);
    advancingTimeoutRef.current = setTimeout(() => {
      isAdvancingRef.current = false;
      advancingTimeoutRef.current = null;
    }, 100);
  }, [patterns, instruments, isLooping, setCurrentPattern, setCurrentRow, scheduler, engine]);

  // Keep automation in sync during playback
  // This ensures automation changes are applied even after playback has started
  useEffect(() => {
    if (isPlaying && playbackStartedRef.current) {
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
  }, [automation, isPlaying, scheduler]);

  // Sync BPM changes
  useEffect(() => {
    engine.setBPM(bpm);
  }, [bpm, engine]);

  // Sync master effects
  useEffect(() => {
    engine.rebuildMasterEffects(masterEffects);
  }, [masterEffects, engine]);

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
  }, [pattern, engine]);

  // Track if we've started playback (to avoid re-scheduling on pattern changes)
  const playbackStartedRef = useRef(false);

  // Start playback
  useEffect(() => {
    if (isPlaying && pattern && !playbackStartedRef.current) {
      // Start playback - schedule initial pattern
      console.log(`[Playback] Starting playback at pattern ${currentPatternIndex}: ${pattern.name}`);
      
      // Set pattern callbacks for song advancement FIRST
      scheduler.setOnPatternEnd(handlePatternEnd);
      scheduler.setOnPatternBreak(handlePatternBreak);
      scheduler.setOnPositionJump(handlePositionJump);

      // Set automation data
      scheduler.setAutomation(automation);

      // Schedule initial pattern at time 0
      scheduler.schedulePattern(pattern, instruments, (row) => {
        setCurrentRow(row, pattern.length);
      }, 0);

      // Start transport
      engine.start().then(() => {
        playbackStartedRef.current = true;
      }).catch((err) => {
        console.error('Failed to start transport:', err);
      });
    }
  }, [isPlaying, pattern, instruments, automation, handlePatternEnd, handlePatternBreak, handlePositionJump, setCurrentRow, currentPatternIndex, scheduler, engine]);

  // Stop playback
  useEffect(() => {
    if (!isPlaying && playbackStartedRef.current) {
      // Stop playback
      console.log('[Playback] Stopping playback');
      
      engine.stop();
      scheduler.clearSchedule();
      scheduler.setOnPatternEnd(null);
      scheduler.setOnPatternBreak(null);
      scheduler.setOnPositionJump(null);
      setCurrentRow(0);
      playbackStartedRef.current = false;
    }
  }, [isPlaying, scheduler, engine, setCurrentRow]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      scheduler.clearSchedule();
      scheduler.setOnPatternEnd(null);
      scheduler.setOnPatternBreak(null);
      scheduler.setOnPositionJump(null);
    };
  }, [scheduler]);

  return {
    isPlaying,
  };
};
