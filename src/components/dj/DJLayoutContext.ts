/**
 * DJLayoutContext - carries the solved DJ layout (src/lib/dj/djLayout.ts) from
 * DJView to every band that sizes itself from it. Rendered outside DJView (a
 * deck on its own in a test, a storybook) the default is the roomy regular
 * layout, so a band never needs to guard for a missing provider.
 */

import { createContext, useContext } from 'react';
import { djLayout, type DjLayout } from '@/lib/dj/djLayout';

export const DEFAULT_DJ_LAYOUT: DjLayout = djLayout({
  width: 1920,
  height: 1000,
  deckCount: 2,
  deckC: null,
  waveformCount: 0,
  dubBusOn: false,
  pointer: 'fine',
});

export const DJLayoutContext = createContext<DjLayout>(DEFAULT_DJ_LAYOUT);

export function useDJLayoutContext(): DjLayout {
  return useContext(DJLayoutContext);
}
