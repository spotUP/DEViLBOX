import { createContext } from 'react';
import type { BreakpointState } from '@hooks/useBreakpoint';

export interface ResponsiveContextValue extends BreakpointState {
  isTouch: boolean;
}

export const ResponsiveContext = createContext<ResponsiveContextValue | null>(null);
