/**
 * LogoAnimation - Displays the Up Rough logo SVG animation
 * Theme-aware with accent color glow
 * Used as an intro before other visualizers
 */

import React, { useEffect, useRef, useState } from 'react';
import { useThemeStore } from '@stores/useThemeStore';

interface LogoAnimationProps {
  height?: number;
  onComplete?: () => void;
}

const INTRO_DURATION_MS = 11000;

export const LogoAnimation: React.FC<LogoAnimationProps> = ({
  height = 100,
  onComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const { currentThemeId } = useThemeStore();
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  const bgColor = isCyanTheme ? '#030808' : '#0a0a0b';
  const accentColor = isCyanTheme ? 'rgba(0, 255, 255, 0.5)' : 'rgba(0, 212, 170, 0.5)';

  // Load SVG content
  useEffect(() => {
    const basePath = import.meta.env.BASE_URL || '/';
    fetch(`${basePath}assets/up-rough-logo.svg`)
      .then(res => res.text())
      .then(text => {
        setSvgContent(text);
      })
      .catch(err => {
        console.error('Failed to load logo animation:', err);
      });
  }, []);

  // Force animation restart after SVG is inserted
  useEffect(() => {
    if (!svgContent || !containerRef.current) return;

    // Wait for next frame to ensure DOM is updated
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReady(true);
      });
    });
  }, [svgContent]);

  // Call onComplete after animation finishes
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!ready) return;

    const timer = setTimeout(() => {
      onCompleteRef.current?.();
    }, INTRO_DURATION_MS);

    return () => clearTimeout(timer);
  }, [ready]);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center rounded-md border border-dark-border overflow-hidden"
      style={{
        height: `${height}px`,
        backgroundColor: bgColor,
      }}
    >
      {svgContent && ready ? (
        <div
          className="flex items-center justify-center"
          style={{
            height: '100%',
            width: '100%',
            transform: 'scale(2.7)',
            filter: `drop-shadow(0 0 2px ${accentColor}) drop-shadow(0 0 4px ${accentColor})`,
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      ) : (
        <span className="text-text-muted text-sm">Loading...</span>
      )}
    </div>
  );
};
