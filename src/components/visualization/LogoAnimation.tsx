/**
 * LogoAnimation - Displays the Up Rough logo SVG animation
 * Theme-aware and audio-reactive after the draw animation completes
 * Plays the "outro" animation when music stops
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useThemeStore } from '@stores/useThemeStore';
import { useAudioStore, useTransportStore } from '@stores';

interface LogoAnimationProps {
  height?: number;
  onComplete?: () => void;
}

// The SVG animation is 12 seconds, but it starts hiding at ~87% (10.4s)
// Stop at 10 seconds to freeze the logo before it disappears
const ANIMATION_STOP_MS = 10000;

export const LogoAnimation: React.FC<LogoAnimationProps> = ({
  height = 100,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const animationRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Use refs for animation state to avoid stale closure issues
  const animationCompleteRef = useRef(false);
  const outroPlayedRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const scaleRef = useRef(1);
  const glowRef = useRef(0);
  const rotateRef = useRef(0);

  const { currentThemeId } = useThemeStore();
  const { analyserNode } = useAudioStore();
  const isPlaying = useTransportStore((state) => state.isPlaying);
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

  // Resume all CSS animations in the SVG (for outro)
  const resumeAnimations = useCallback(() => {
    if (!svgContainerRef.current) return;

    const svg = svgContainerRef.current.querySelector('svg');
    if (svg) {
      const allElements = svg.querySelectorAll('*');
      allElements.forEach(el => {
        (el as HTMLElement).style.animationPlayState = 'running';
      });
      svg.style.animationPlayState = 'running';
    }
  }, []);

  // Reset animation state when key changes (animation restarts)
  useEffect(() => {
    // Reset all animation state
    animationCompleteRef.current = false;
    outroPlayedRef.current = false;
    scaleRef.current = 1;
    glowRef.current = 0;
    rotateRef.current = 0;

    // Clear any existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set timer to pause animation before it ends (and hides the logo)
    timerRef.current = setTimeout(() => {
      pauseAnimations();
      animationCompleteRef.current = true;
    }, ANIMATION_STOP_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [key, pauseAnimations]);

  // Detect when music stops to play outro
  useEffect(() => {
    // Check for transition from playing to stopped
    if (wasPlayingRef.current && !isPlaying && animationCompleteRef.current && !outroPlayedRef.current) {
      // Music just stopped and we're in the "frozen" state - play the outro!
      outroPlayedRef.current = true;

      // Clear any audio-reactive styles
      if (svgContainerRef.current) {
        svgContainerRef.current.style.transform = '';
        svgContainerRef.current.style.filter = '';
      }

      // Resume the animation to play the outro (the exit animation)
      resumeAnimations();
    }

    wasPlayingRef.current = isPlaying;
  }, [isPlaying, resumeAnimations]);

  // Audio-reactive animation (only after draw animation completes)
  const animate = useCallback(() => {
    if (!svgContainerRef.current) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const container = svgContainerRef.current;
    const baseColor = isCyanTheme ? '#00ffff' : '#00d4aa';

    // Check if draw animation is still in progress or outro is playing
    if (!animationCompleteRef.current || outroPlayedRef.current) {
      // During draw/outro animation, just set the base color, no effects
      container.style.color = baseColor;
      if (!outroPlayedRef.current) {
        container.style.transform = '';
        container.style.filter = '';
      }
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    // --- Animation complete: apply audio-reactive effects ---

    let level = 0;

    if (analyserNode && isPlaying) {
      const waveform = analyserNode.getValue() as Float32Array;
      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < waveform.length; i++) {
        sum += waveform[i] * waveform[i];
      }
      level = Math.sqrt(sum / waveform.length);
    }

    // Smooth scale interpolation - pulse with the beat
    const targetScale = 1 + level * 0.25;
    scaleRef.current += (targetScale - scaleRef.current) * 0.4;

    // Glow intensity based on audio
    const targetGlow = level * 30;
    glowRef.current += (targetGlow - glowRef.current) * 0.3;

    // Subtle rotation wobble synced to audio
    if (isPlaying && level > 0.05) {
      rotateRef.current += (Math.random() - 0.5) * level * 3;
      rotateRef.current *= 0.9; // Decay back to center
    } else {
      rotateRef.current *= 0.95;
    }

    // Apply transforms
    container.style.transform = `scale(${scaleRef.current}) rotate(${rotateRef.current}deg)`;

    // Dynamic brightness and glow based on audio
    const brightness = 100 + level * 50;
    container.style.color = baseColor;
    container.style.filter = `brightness(${brightness}%) drop-shadow(0 0 ${glowRef.current}px ${baseColor})`;

    animationRef.current = requestAnimationFrame(animate);
  }, [analyserNode, isPlaying, isCyanTheme]);

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

  // Restart animation on click
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger parent's visualizer cycle
    // Reset styles immediately
    if (svgContainerRef.current) {
      svgContainerRef.current.style.transform = '';
      svgContainerRef.current.style.filter = '';
    }
    setKey(prev => prev + 1);
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
      title="Click to restart animation"
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
