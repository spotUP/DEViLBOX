/**
 * Switching Auto Dub and the Dub Bus on and off - one rule for every switch.
 *
 * Auto Dub performs on the dub bus; a performer with no bus does nothing. So
 * switching Auto Dub on switches the bus on (owner, 2026-10-08: "if auto dub
 * is turned on in the dj view turn on the dub bus" - the DJ view had an Auto
 * Dub button and no bus switch), and switching the bus off stops Auto Dub
 * (it went on muting channels after the bus was off). The Dub Deck strip,
 * the DJ view's Auto Dub panel and the MCP all call these.
 */
import { useDubStore } from '@/stores/useDubStore';
import { useDrumPadStore } from '@/stores/useDrumPadStore';

/** Auto Dub on (and the bus with it) or off. */
export function setAutoDubPower(on: boolean): void {
  if (on && !useDrumPadStore.getState().dubBus.enabled) {
    // Keep the chosen character preset, so the preset menu does not flip to Custom.
    const { characterPreset } = useDrumPadStore.getState().dubBus;
    useDrumPadStore.getState().setDubBus({ enabled: true, characterPreset });
  }
  useDubStore.getState().setAutoDubEnabled(on);
}

/** The Dub Bus on or off; off also stops Auto Dub. */
export function setDubBusPower(on: boolean): void {
  if (!on && useDubStore.getState().autoDubEnabled) useDubStore.getState().setAutoDubEnabled(false);
  useDrumPadStore.getState().setDubBus({ enabled: on });
}
