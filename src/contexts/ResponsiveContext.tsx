import { type ReactNode } from 'react';
import { useBreakpoint, useIsTouchDevice } from '@hooks/useBreakpoint';
import { ResponsiveContext, type ResponsiveContextValue } from './ResponsiveContextCore';

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

export { ResponsiveContext };
export default ResponsiveContext;
