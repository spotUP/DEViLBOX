/**
 * DJCachePanel - Pre-render cache management UI for UADE modules
 *
 * Shows cache statistics, allows clearing cache, and displays
 * pre-render progress for background conversions.
 */

import React, { useState, useEffect } from 'react';
import { Database, Trash2, Loader2 } from 'lucide-react';
import { getCacheStats, clearAudioCache } from '@/engine/dj/DJAudioCache';

interface DJCachePanelProps {
  className?: string;
}

export const DJCachePanel: React.FC<DJCachePanelProps> = ({ className }) => {
  const [stats, setStats] = useState<{ sizeMB: number; entryCount: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadStats();
  }, []);

  const loadStats = async (): Promise<void> => {
    try {
      const data = await getCacheStats();
      setStats(data);
    } catch (err) {
      console.error('[DJCachePanel] Failed to load cache stats:', err);
    }
  };

  const handleClearCache = async (): Promise<void> => {
    if (!confirm('Clear all pre-rendered UADE audio cache? This cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      await clearAudioCache();
      await loadStats();
    } catch (err) {
      console.error('[DJCachePanel] Failed to clear cache:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!stats) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded ${className || ''}`}>
        <Loader2 size={14} className="animate-spin text-text-muted" />
        <span className="text-xs font-mono text-text-muted">Loading cache stats...</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 px-3 py-2 bg-dark-bgSecondary border border-dark-border rounded ${className || ''}`}>
      {/* Icon */}
      <Database size={14} className="text-text-muted" />

      {/* Stats */}
      <div className="flex-1 flex items-center gap-4 text-xs font-mono">
        <span className="text-text-secondary">
          <span className="text-text-primary font-bold">{stats.entryCount}</span>
          {' cached'}
        </span>
        <span className="text-text-secondary">
          <span className="text-text-primary font-bold">{stats.sizeMB.toFixed(1)}</span>
          {' MB'}
        </span>
      </div>

      {/* Clear button */}
      {stats.entryCount > 0 && (
        <button
          onClick={handleClearCache}
          disabled={loading}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono rounded
                     bg-dark-bgTertiary border border-dark-borderLight
                     hover:bg-red-900/20 hover:border-red-800/30 hover:text-red-400
                     text-text-muted transition-colors disabled:opacity-50"
          title="Clear cache"
        >
          {loading ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Trash2 size={10} />
          )}
          Clear
        </button>
      )}
    </div>
  );
};
