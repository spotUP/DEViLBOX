/**
 * SIDPlayerTab — Displays info about the SID player/editor used to create a tune.
 * Fetches player metadata from the DeepSID API.
 */

import React, { useState, useEffect } from 'react';
import { Play, User, Calendar, FileText, Loader2 } from 'lucide-react';

interface SIDPlayerTabProps {
  playerName: string | null;
  className?: string;
}

interface PlayerInfo {
  title?: string;
  developer?: string;
  yearFrom?: number;
  yearTo?: number;
  description?: string;
  features?: string[];
}

export const SIDPlayerTab: React.FC<SIDPlayerTabProps> = ({
  playerName,
  className,
}) => {
  const [playerInfo, setPlayerInfo] = useState<PlayerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerName) {
      setPlayerInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/deepsid/player/${encodeURIComponent(playerName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPlayerInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [playerName]);

  if (!playerName) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-text-muted ${className ?? ''}`}>
        <Play className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No player information</p>
        <p className="text-xs mt-1">Player data is not available for this tune</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className ?? ''}`}>
        <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-text-muted ${className ?? ''}`}>
        <p className="text-sm text-accent-error">Failed to load player info</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full overflow-y-auto p-3 space-y-3 ${className ?? ''}`}>
      {/* Player title */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Play className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-text-primary">
            {playerInfo?.title ?? playerName}
          </h3>
        </div>

        {/* Developer */}
        {playerInfo?.developer && (
          <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
            <User className="w-3 h-3 text-blue-400/60" />
            <span className="text-text-secondary">{playerInfo.developer}</span>
          </div>
        )}

        {/* Year range */}
        {(playerInfo?.yearFrom || playerInfo?.yearTo) && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Calendar className="w-3 h-3 text-blue-400/60" />
            <span className="text-text-secondary">
              {playerInfo.yearFrom && playerInfo.yearTo
                ? `${playerInfo.yearFrom} – ${playerInfo.yearTo}`
                : playerInfo.yearFrom ?? playerInfo.yearTo}
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      {playerInfo?.description && (
        <div className="flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Description</span>
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
              {playerInfo.description}
            </p>
          </div>
        </div>
      )}

      {/* Features */}
      {playerInfo?.features && playerInfo.features.length > 0 && (
        <div className="border-t border-dark-border pt-3">
          <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1.5">Features</span>
          <div className="flex flex-wrap gap-1">
            {playerInfo.features.map((feat, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-dark-bgSecondary text-text-muted border border-dark-border"
              >
                {feat}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
