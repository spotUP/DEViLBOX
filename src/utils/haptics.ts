/**
 * Haptics - Vibration feedback for mobile devices
 * Provides tactile feedback for touch interactions
 */

/**
 * Check if the device supports vibration
 */
const isVibrationSupported = (): boolean => {
  return 'vibrate' in navigator;
};

/**
 * Trigger vibration with error handling
 */
const vibrate = (pattern: number | number[]): boolean => {
  if (!isVibrationSupported()) {
    return false;
  }

  try {
    return navigator.vibrate(pattern);
  } catch (error) {
    console.warn('Vibration failed:', error);
    return false;
  }
};

/**
 * Haptic feedback presets for different interaction types
 */
export const haptics = {
  /**
   * Light tap feedback (10ms)
   * Use for: button presses, key inputs, selection changes
   */
  light: (): boolean => {
    return vibrate(10);
  },

  /**
   * Medium tap feedback (20ms)
   * Use for: important actions, confirmations, mode changes
   */
  medium: (): boolean => {
    return vibrate(20);
  },

  /**
   * Heavy tap feedback (30ms)
   * Use for: critical actions, errors, long-press triggers
   */
  heavy: (): boolean => {
    return vibrate(30);
  },

  /**
   * Success pattern (10ms, pause 50ms, 10ms)
   * Use for: successful operations, completed tasks
   */
  success: (): boolean => {
    return vibrate([10, 50, 10]);
  },

  /**
   * Error pattern (20ms, pause 100ms, 20ms)
   * Use for: errors, invalid inputs, failed operations
   */
  error: (): boolean => {
    return vibrate([20, 100, 20]);
  },

  /**
   * Warning pattern (15ms, pause 75ms, 15ms, pause 75ms, 15ms)
   * Use for: warnings, important notifications
   */
  warning: (): boolean => {
    return vibrate([15, 75, 15, 75, 15]);
  },

  /**
   * Selection pattern (5ms, pause 30ms, 5ms)
   * Use for: item selection, cursor movement
   */
  selection: (): boolean => {
    return vibrate([5, 30, 5]);
  },

  /**
   * Soft impact (5ms)
   * Use for: subtle feedback, hover states (mobile)
   */
  soft: (): boolean => {
    return vibrate(5);
  },

  /**
   * Rigid impact (40ms)
   * Use for: maximum impact feedback, destructive actions
   */
  rigid: (): boolean => {
    return vibrate(40);
  },

  /**
   * Cancel any ongoing vibration
   */
  cancel: (): boolean => {
    return vibrate(0);
  },

  /**
   * Check if vibration is supported
   */
  isSupported: (): boolean => {
    return isVibrationSupported();
  },
};

export default haptics;
