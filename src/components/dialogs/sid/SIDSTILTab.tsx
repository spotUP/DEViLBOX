/**
 * SIDSTILTab — Enhanced STIL (SID Tune Information List) display.
 * Fetches from DeepSID API and shows per-subtune metadata, comments, and lyrics.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, ChevronLeft, ChevronRight, Music, User, FileText, Loader2 } from 'lucide-react';

interface SIDSTILTabProps {
  hvscPath: string | null;
  currentSubsong: number;
  totalSubsongs: number;
  className?: string;
}

interface STILEntry {
  title?: string;
  author?: string;
  artist?: string;
  comment?: string[];
  name?: string;
}

interface FileInfo {
  stil?: STILEntry[];
  lyrics?: string;
  // Additional fields from the API
  title?: string;
  author?: string;
  copyright?: string;
}

export const SIDSTILTab: React.FC<SIDSTILTabProps> = ({
  hvscPath,
  currentSubsong,
  totalSubsongs,
  className,
}) => {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewSubsong, setViewSubsong] = useState(currentSubsong);

  // Sync with external subsong changes
  useEffect(() => {
    setViewSubsong(currentSubsong);
  }, [currentSubsong]);

  // Fetch file info from DeepSID
  useEffect(() => {
    if (!hvscPath) {
      setFileInfo(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/deepsid/file-by-path?path=${encodeURIComponent(hvscPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setFileInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [hvscPath]);

  const goToPrev = useCallback(() => {
    setViewSubsong((s) => Math.max(0, s - 1));
  }, []);

  const goToNext = useCallback(() => {
    setViewSubsong((s) => Math.min(totalSubsongs - 1, s + 1));
  }, [totalSubsongs]);

  // Get current subtune's STIL entry
  const stilEntries = fileInfo?.stil ?? [];
  const currentSTIL: STILEntry | undefined = stilEntries[viewSubsong] ?? stilEntries[0];

  if (!hvscPath) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-text-muted ${className ?? ''}`}>
        <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No HVSC path available</p>
        <p className="text-xs mt-1">Load a SID file from the HVSC collection</p>
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
        <p className="text-sm text-accent-error">Failed to load STIL info</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      {/* Subtune navigation */}
      {totalSubsongs > 1 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-border">
          <button
            onClick={goToPrev}
            disabled={viewSubsong <= 0}
            className="p-1 rounded hover:bg-dark-bgHover disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-text-muted" />
          </button>
          <span className="text-xs text-text-muted">
            Subtune {viewSubsong + 1} / {totalSubsongs}
          </span>
          <button
            onClick={goToNext}
            disabled={viewSubsong >= totalSubsongs - 1}
            className="p-1 rounded hover:bg-dark-bgHover disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      )}

      {/* STIL Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {currentSTIL ? (
          <>
            {currentSTIL.title && (
              <div className="flex items-start gap-2">
                <Music className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block">Title</span>
                  <span className="text-sm text-text-primary">{currentSTIL.title}</span>
                </div>
              </div>
            )}

            {(currentSTIL.author || currentSTIL.artist) && (
              <div className="flex items-start gap-2">
                <User className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block">
                    {currentSTIL.artist ? 'Artist' : 'Author'}
                  </span>
                  <span className="text-sm text-text-primary">
                    {currentSTIL.artist ?? currentSTIL.author}
                  </span>
                </div>
              </div>
            )}

            {currentSTIL.comment && currentSTIL.comment.length > 0 && (
              <div className="flex items-start gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block">Comment</span>
                  <div className="space-y-1">
                    {currentSTIL.comment.map((line, i) => (
                      <p key={i} className="text-xs text-text-secondary leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <MessageSquare className="w-6 h-6 mb-2 opacity-30" />
            <p className="text-xs">No STIL entry for this subtune</p>
          </div>
        )}

        {/* Lyrics section */}
        {fileInfo?.lyrics && (
          <div className="border-t border-dark-border pt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[10px] uppercase tracking-wider text-text-muted">Lyrics</span>
            </div>
            <pre className="text-xs text-text-secondary font-mono leading-relaxed bg-dark-bgSecondary/50 rounded p-2.5 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {fileInfo.lyrics}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
