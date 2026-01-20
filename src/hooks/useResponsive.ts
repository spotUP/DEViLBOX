import { useContext } from 'react';
import { ResponsiveContext, type ResponsiveContextValue } from '../contexts/ResponsiveContextCore';

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
