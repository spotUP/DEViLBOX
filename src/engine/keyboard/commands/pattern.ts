/**
 * Pattern Commands - Pattern navigation and management
 */

import { useTrackerStore } from '@stores/useTrackerStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Go to next pattern
 */
export function nextPattern(): boolean {
  const { currentPatternIndex, patterns, setCurrentPattern } = useTrackerStore.getState();
  
  if (currentPatternIndex < patterns.length - 1) {
    setCurrentPattern(currentPatternIndex + 1);
    useUIStore.getState().setStatusMessage(`Pattern ${currentPatternIndex + 2}/${patterns.length}`, false, 1000);
    return true;
  }
  
  return true; // Still consume the key even if at end
}

/**
 * Go to previous pattern
 */
export function prevPattern(): boolean {
  const { currentPatternIndex, setCurrentPattern } = useTrackerStore.getState();
  
  if (currentPatternIndex > 0) {
    setCurrentPattern(currentPatternIndex - 1);
    const { patterns } = useTrackerStore.getState();
    useUIStore.getState().setStatusMessage(`Pattern ${currentPatternIndex}/${patterns.length}`, false, 1000);
    return true;
  }
  
  return true;
}
