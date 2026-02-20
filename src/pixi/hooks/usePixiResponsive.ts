/**
 * usePixiResponsive — Responsive layout hook for PixiJS.
 * Returns breakpoint info for conditional layouts in the WebGL UI.
 */

import { useState, useEffect } from 'react';

export interface PixiResponsiveInfo {
  /** Is the viewport narrower than 768px? */
  isMobile: boolean;
  /** Is the viewport narrower than 1024px? */
  isTablet: boolean;
  /** Current viewport width */
  width: number;
  /** Current viewport height */
  height: number;
  /** Device pixel ratio */
  dpr: number;
}

export function usePixiResponsive(): PixiResponsiveInfo {
  const [info, setInfo] = useState<PixiResponsiveInfo>(() => getInfo());

  useEffect(() => {
    const handleResize = () => setInfo(getInfo());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return info;
}

function getInfo(): PixiResponsiveInfo {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    isMobile: width < 768,
    isTablet: width < 1024,
    width,
    height,
    dpr: window.devicePixelRatio || 1,
  };
}
