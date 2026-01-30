/**
 * LogoAnimation - Displays the Up Rough logo SVG animation
 * Theme-aware, click to skip to next visualizer
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useThemeStore } from '@stores/useThemeStore';

interface LogoAnimationProps {
  height?: number;
  onComplete?: () => void;
}

// The SVG animation is 12 seconds, but it starts hiding at ~87% (10.4s)
// Stop at 10 seconds to freeze the logo before it disappears
const ANIMATION_STOP_MS = 10000;

export const LogoAnimation: React.FC<LogoAnimationProps> = ({
  height = 100,
  onComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [key, _setKey] = useState(0); // Used for animation restart (disabled - now skips instead)
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs for animation state to avoid stale closure issues
  const animationCompleteRef = useRef(false);

  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Load SVG content
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
  const pauseAnimations = useCallback(() => {
    if (!svgContainerRef.current) return;

    const svg = svgContainerRef.current.querySelector('svg');
    if (svg) {
      const allElements = svg.querySelectorAll('*');
      allElements.forEach(el => {
        (el as HTMLElement).style.animationPlayState = 'paused';
      });
      svg.style.animationPlayState = 'paused';
    }
  }, []);


  // Reset animation state when key changes (animation restarts)
  useEffect(() => {
    animationCompleteRef.current = false;

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set timer to pause animation before it ends (and hides the logo)
    timerRef.current = setTimeout(() => {
      pauseAnimations();
      animationCompleteRef.current = true;
      // Notify parent that animation is complete (can skip to next visualizer)
      onComplete?.();
    }, ANIMATION_STOP_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [key, pauseAnimations, onComplete]);


  // Simple color animation (no audio-reactive effects)
  const animate = useCallback(() => {
    if (!svgContainerRef.current) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const container = svgContainerRef.current;
    const baseColor = isCyanTheme ? '#00ffff' : '#00d4aa';

    // Just set the base color, no effects
    container.style.color = baseColor;
    container.style.transform = '';
    container.style.filter = '';

    animationRef.current = requestAnimationFrame(animate);
  }, [isCyanTheme]);

  // Start/stop animation loop
  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [animate]);

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
    onComplete?.();
  };

  const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
  const defaultColor = isCyanTheme ? '#00ffff' : '#00d4aa';

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center rounded-md border border-dark-border overflow-hidden"
      style={{
        height: `${height}px`,
        backgroundColor: bgColor,
      }}
      onClick={handleClick}
      title="Click to skip"
    >
      {svgContent ? (
        <div
          ref={svgContainerRef}
          key={key}
          className="flex items-center justify-center"
          style={{
            height: '100%',
            width: '100%',
            color: defaultColor,
            transformOrigin: 'center center',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      ) : (
        <span className="text-text-muted text-sm">Loading...</span>
      )}
    </div>
  );
};
