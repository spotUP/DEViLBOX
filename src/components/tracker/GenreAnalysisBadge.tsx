/**
 * GenreAnalysisBadge — Compact genre/mood display for tracker toolbar
 *
 * Shows analysis state and results:
 * - Capturing: progress bar
 * - Analyzing: spinner
 * - Ready: Genre • Mood badge
 */

import React from 'react';
import { useTrackerAnalysisDisplay } from '@/hooks/useTrackerAnalysis';
import { Disc, Sparkles, Zap, Music2 } from 'lucide-react';

// ── Mood Icons ───────────────────────────────────────────────────────────────

const moodIcons: Record<string, typeof Zap> = {
  Energetic: Zap,
  Chill: Sparkles,
  Dark: Music2,
  Happy: Sparkles,
  Melancholic: Music2,
  Aggressive: Zap,
  Calm: Sparkles,
};

// ── Component ────────────────────────────────────────────────────────────────

export const GenreAnalysisBadge: React.FC = React.memo(() => {
  const { isCapturing, isAnalyzing, isReady, progress, genre, bpm, musicalKey } = useTrackerAnalysisDisplay();
  
  // Nothing to show
  if (!isCapturing && !isAnalyzing && !isReady) {
    return null;
  }
  
  // Capturing - show progress
  if (isCapturing) {
    return (
      <div
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-dark-bgSecondary text-text-secondary text-[10px] font-bold font-mono border border-dark-border"
        title={`Capturing audio... ${Math.round(progress)}%`}
      >
        <Disc size={12} className="animate-spin" />
        <div className="w-16 h-1 bg-dark-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }
  
  // Analyzing - show spinner
  if (isAnalyzing) {
    return (
      <div
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-[10px] font-bold font-mono border border-accent-primary/40"
        title="Analyzing genre..."
      >
        <Sparkles size={12} className="animate-pulse" />
        <span>ANALYZING</span>
      </div>
    );
  }
  
  // Ready - show results
  if (isReady && genre) {
    const MoodIcon = moodIcons[genre.mood] || Music2;
    const energyPercent = Math.round(genre.energy * 100);
    
    // Format: "Techno • Energetic" or just "Electronic"
    const label = genre.subgenre || genre.primary;
    
    // BPM and key info
    const detailParts: string[] = [];
    if (bpm && bpm > 0) detailParts.push(`${Math.round(bpm)} BPM`);
    if (musicalKey) detailParts.push(musicalKey);
    const detailText = detailParts.join(' • ');
    
    return (
      <div
        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary text-[10px] font-bold font-mono border border-accent-primary/40 cursor-default"
        title={`${genre.primary} › ${genre.subgenre || '?'}\nMood: ${genre.mood} (${genre.confidence > 0.7 ? 'High' : genre.confidence > 0.4 ? 'Med' : 'Low'} confidence)\nEnergy: ${energyPercent}% • Danceability: ${Math.round(genre.danceability * 100)}%\n${detailText}`}
      >
        <MoodIcon size={12} />
        <span>{label}</span>
        <span className="opacity-50">•</span>
        <span className="opacity-70">{genre.mood}</span>
        {/* Energy bar */}
        <div className="w-8 h-1 bg-dark-border rounded-full overflow-hidden ml-1">
          <div
            className="h-full bg-accent-primary transition-all"
            style={{ width: `${energyPercent}%` }}
          />
        </div>
      </div>
    );
  }
  
  return null;
});

GenreAnalysisBadge.displayName = 'GenreAnalysisBadge';
