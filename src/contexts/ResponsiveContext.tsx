/**
 * ResponsiveContext - App-wide responsive state provider
 * Shares breakpoint information throughout the component tree
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useBreakpoint, useIsTouchDevice, type BreakpointState } from '@hooks/useBreakpoint';

interface ResponsiveContextValue extends BreakpointState {
  isTouch: boolean;
}

const ResponsiveContext = createContext<ResponsiveContextValue | null>(null);

interface ResponsiveProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the app to provide responsive context
 */
export function ResponsiveProvider({ children }: ResponsiveProviderProps) {
  const breakpointState = useBreakpoint();
  const isTouch = useIsTouchDevice();

  const value: ResponsiveContextValue = {
    ...breakpointState,
    isTouch,
  };

  return (
    <ResponsiveContext.Provider value={value}>
      {children}
    </ResponsiveContext.Provider>
  );
}

/**
 * Hook to access responsive context
 * Must be used within a ResponsiveProvider
 */
export function useResponsive(): ResponsiveContextValue {
  const context = useContext(ResponsiveContext);

  if (!context) {
    throw new Error('useResponsive must be used within a ResponsiveProvider');
  }

  return context;
}

/**
 * Hook to access responsive context with fallback
 * Safe to use outside of ResponsiveProvider (returns defaults)
 */
export function useResponsiveSafe(): ResponsiveContextValue {
  const context = useContext(ResponsiveContext);

  if (!context) {
    // Return desktop defaults if no provider
    return {
      breakpoint: 'desktop',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      width: 1024,
      isTouch: false,
    };
  }

  return context;
}

export default ResponsiveContext;
