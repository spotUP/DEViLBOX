/**
 * SineScroller - Classic demoscene sine wave text scroller with rainbow gradient
 */

import React, { useRef, useEffect, useState } from 'react';
import { getToneEngine } from '@engine/ToneEngine';
import { useTransportStore } from '@stores';

interface SineScrollerProps {
  height?: number;
  text?: string;
}

export const SineScroller: React.FC<SineScrollerProps> = ({ 
  height = 100,
  text = "*** GREETINGS FLIES OUT TO....     AEROSOL   AFRIKA   ANDROMEDA   ATE BIT   ATLANTIS   BLACK MAIDEN   BOOZE DESIGN   BOOZOHOLICS   BYTERAPERS   CENSOR DESIGN   DA JORMAS  DCS   DEKADENCE   DEPTH   DESIRE   DIVINE STYLERS   DUREX   ELCREW   ELUDE   EPHIDRENA   EPSILON DESIGN   FAIRLIGHT   FATZONE   FIT   FLUSH  FUNKTION   GENESIS PROJECT   HACK N TRADE   HAUJOBB   HARD BOYLING BOYS   HOAXERS   LFT  IMPURE ASCII 1940  INSANE   INSTINCT   IRIS  JOSSYSTEM   JUDAS   KESO   LA PAZ   LAXATIVE EFFECTS   LEMON  LOONIES     MAHONEY   MANKIND  MAWI   MOODS PLATEAU   NATURE  NONAMENO   NUKLEUS   OFFENCE  ONSALA SECTOR     ONSLAUGHT   OUTBREAK   OXYRON   PACIF!C   PANDA DESIGN   PARADOX   PERFOMERS   PLANET JAZZ   POWERLINE   RAZOR 1911   REALITY   RELAPSE  RNO   RESISTANCE SCARAB   SCENESAT   SCOOPEX   SHARE AND ENJOY   SHAPE   SIGFLUP   SPACEBALLS   STRUTS SUBSPACE   STYLE   THE ELECTRONIC KNIGHTS   THE BLACK LOTUS   THE GANG   TITAN   TPOLM   TRAKTOR   TRIAD   TRSI   TULOU   UK SCENE ALLSTARS   UNIQUE   UNSTABLE LABEL   Y-CREW   AND   ZENON ***"
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const scrollOffsetRef = useRef(0);
  const [width, setWidth] = useState(800);
  const { bpm, isPlaying } = useTransportStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const container = canvas.parentElement;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (newWidth > 0) setWidth(newWidth);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    let mounted = true;

    // Star field parameters
    interface Star {
      x: number;
      y: number;
      z: number;
      speed: number;
    }

    const numStars = 200;
    const stars: Star[] = [];
    
    // Initialize stars
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z: Math.random() * 1000,
        speed: 0.5 + Math.random() * 1.5
      });
    }

    // Sine scroller parameters (base values)
    const fontSize = Math.min(height * 0.4, 32);
    const charSpacing = fontSize * 0.6;
    const baseSineAmplitude = height * 0.2;
    const baseSineFrequency = 0.035;
    const baseScrollSpeed = 2;

    // BPM-synced scroll speed (scale based on BPM - 125 is baseline)
    const bpmFactor = isPlaying ? bpm / 125 : 1;
    const scrollSpeed = baseScrollSpeed * bpmFactor;

    // Rainbow gradient animation
    let gradientOffset = 0;
    let gradientAnimSpeed = 1;

    // Audio level smoothing
    let smoothedAudioLevel = 0;

    // Create repeating text
    const repeatingText = (text + "     ").repeat(5);

    const animate = () => {
      if (!mounted) return;

      if (document.hidden) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Get audio data for reactivity
      const engine = getToneEngine();
      const waveform = engine.getWaveform();
      
      let audioLevel = 0;
      if (waveform && waveform.length > 0 && isPlaying) {
        // Calculate RMS level
        const rms = Math.sqrt(waveform.reduce((sum, val) => sum + val * val, 0) / waveform.length);
        audioLevel = Math.min(1, rms * 10);
      }
      
      // Smooth audio level for less jittery animation
      smoothedAudioLevel += (audioLevel - smoothedAudioLevel) * 0.15;

      // Clear
      ctx.fillStyle = '#0a0a0b';
      ctx.fillRect(0, 0, width, height);

      // Draw star field
      const centerX = width / 2;
      const centerY = height / 2;
      
      for (const star of stars) {
        // Move star toward viewer (decrease z)
        star.z -= star.speed * (1 + smoothedAudioLevel * 1);
        
        // Reset star if it's behind the camera
        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * width * 2;
          star.y = (Math.random() - 0.5) * height * 2;
          star.z = 1000;
        }
        
        // Project 3D to 2D
        const scale = 200 / star.z;
        const x2d = centerX + star.x * scale;
        const y2d = centerY + star.y * scale;
        
        // Skip if off screen
        if (x2d < 0 || x2d > width || y2d < 0 || y2d > height) continue;
        
        // Size and brightness based on depth
        const size = Math.max(1, (1 - star.z / 1000) * 3);
        const brightness = Math.floor((1 - star.z / 1000) * 255);
        
        // Draw star with slight blue tint
        ctx.fillStyle = `rgb(${brightness * 0.8}, ${brightness * 0.9}, ${brightness})`;
        ctx.beginPath();
        ctx.arc(x2d, y2d, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Animate gradient offset with easing (sine wave) + audio reactivity
      const time = Date.now() / 1000;
      gradientAnimSpeed = 1 + smoothedAudioLevel * 0.8; // Rainbow moves faster with audio
      gradientOffset = Math.sin(time * 0.5 * gradientAnimSpeed) * height * 0.3;

      // Use constant sine parameters (no audio reactivity on position)
      const sineAmplitude = baseSineAmplitude;
      const sineFrequency = baseSineFrequency;

      // Update scroll
      scrollOffsetRef.current += scrollSpeed;
      if (scrollOffsetRef.current > charSpacing * (text.length + 5)) {
        scrollOffsetRef.current = 0;
      }

      // Draw text with sine wave
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textBaseline = 'middle';

      for (let i = 0; i < repeatingText.length; i++) {
        const char = repeatingText[i];
        if (char === ' ') continue;

        // Calculate position
        const x = width + (i * charSpacing) - scrollOffsetRef.current;
        
        // Skip if off screen (with margin)
        if (x < -charSpacing || x > width + charSpacing) continue;

        // Sine wave vertical offset (audio-reactive)
        const sinePhase = (scrollOffsetRef.current + (i * charSpacing)) * sineFrequency;
        const y = (height / 2) + Math.sin(sinePhase) * sineAmplitude;

        // Fixed rainbow gradient (stencil effect) - based on screen position, not character
        const gradient = ctx.createLinearGradient(0, gradientOffset, 0, height + gradientOffset);
        const hue1 = (time * 30 * gradientAnimSpeed) % 360; // Hue rotation speed reacts to audio
        gradient.addColorStop(0, `hsl(${hue1}, 100%, 60%)`);
        gradient.addColorStop(0.25, `hsl(${(hue1 + 60) % 360}, 100%, 70%)`);
        gradient.addColorStop(0.5, `hsl(${(hue1 + 120) % 360}, 100%, 70%)`);
        gradient.addColorStop(0.75, `hsl(${(hue1 + 180) % 360}, 100%, 70%)`);
        gradient.addColorStop(1, `hsl(${(hue1 + 240) % 360}, 100%, 60%)`);

        // Draw character with shadow for depth (audio-reactive glow)
        const charHue = (hue1 + (x * 0.3)) % 360;
        const glowIntensity = 10 + smoothedAudioLevel * 8; // Glow pulses with audio
        ctx.shadowColor = `hsla(${charHue}, 100%, 50%, ${0.5 + smoothedAudioLevel * 0.3})`;
        ctx.shadowBlur = glowIntensity;
        ctx.fillStyle = gradient;
        ctx.fillText(char, x, y);
        
        // Draw outline for classic look
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.strokeText(char, x, y);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      mounted = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height, text]);

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />
    </div>
  );
};
