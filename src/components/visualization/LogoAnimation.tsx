/**
 * LogoAnimation - Displays the Up Rough logo SVG animation
 * Theme-aware, click to skip to next visualizer
 */

import React, { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@stores/useThemeStore';

interface LogoAnimationProps {
  height?: number;
  onComplete?: () => void;
}

// The SVG animation is 12 seconds, but it starts hiding at ~87% (10.4s)
// Stop at 10 seconds to freeze the logo before it disappears
const ANIMATION_STOP_MS = 10000;

const LogoAnimationComponent: React.FC<LogoAnimationProps> = ({
  height = 100,
  onComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep onComplete ref up to date without triggering re-renders
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Use refs for animation state to avoid stale closure issues
  const animationCompleteRef = useRef(false);

  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Load SVG content once on mount
  useEffect(() => {
    const basePath = import.meta.env.BASE_URL || '/';
    fetch(`${basePath}assets/up-rough-logo.svg`)
      .then(res => res.text())
      .then(text => {
        // Modify SVG colors to use currentColor for dynamic updates
        let modifiedSvg = text;
        modifiedSvg = modifiedSvg.replace(/stroke="#000"/g, 'stroke="currentColor"');
        modifiedSvg = modifiedSvg.replace(/stroke-width="0"/g, 'stroke-width="0" fill="currentColor"');
        setSvgContent(modifiedSvg);
      })
      .catch(err => {
        console.error('Failed to load logo animation:', err);
      });
  }, []);

  // Pause all CSS animations in the SVG
  const pauseAnimations = () => {
    if (!svgContainerRef.current) return;

    const svg = svgContainerRef.current.querySelector('svg');
    if (svg) {
      const allElements = svg.querySelectorAll('*');
      allElements.forEach(el => {
        (el as HTMLElement).style.animationPlayState = 'paused';
      });
      svg.style.animationPlayState = 'paused';
    }
  };

  // Set timer once on mount to pause animation before it ends
  useEffect(() => {
    animationCompleteRef.current = false;

    timerRef.current = setTimeout(() => {
      pauseAnimations();
      animationCompleteRef.current = true;
      onCompleteRef.current?.();
    }, ANIMATION_STOP_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Ref for isCyanTheme inside animation loop
  const isCyanThemeRef = useRef(isCyanTheme);
  useEffect(() => { isCyanThemeRef.current = isCyanTheme; }, [isCyanTheme]);

  // Start/stop animation loop - defined inside effect to avoid self-referencing
  useEffect(() => {
    const tick = () => {
      if (!svgContainerRef.current) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }

      const container = svgContainerRef.current;
      const baseColor = isCyanThemeRef.current ? '#00ffff' : '#00d4aa';

      container.style.color = baseColor;
      container.style.transform = 'scale(1.5)';
      container.style.filter = '';

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, []);

  // Skip animation on click (go to next visualizer)
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger parent's visualizer cycle
    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    // Cancel animation frame
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    // Skip to next visualizer
    onCompleteRef.current?.();
  };

  const defaultColor = isCyanTheme ? '#00ffff' : '#00d4aa';

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center overflow-hidden"
      style={{
        height: `${height}px`,
      }}
      onClick={handleClick}
      title="Click to skip"
    >
      {svgContent ? (
        <div
          ref={svgContainerRef}
          className="flex items-center justify-center"
          style={{
            height: '100%',
            width: '100%',
            color: defaultColor,
            transformOrigin: 'center center',
            transform: 'scale(1.5)',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      ) : (
        <span className="text-text-muted text-sm">Loading...</span>
      )}
    </div>
  );
};

// Wrap in React.memo to prevent unnecessary re-renders
export const LogoAnimation = React.memo(LogoAnimationComponent);