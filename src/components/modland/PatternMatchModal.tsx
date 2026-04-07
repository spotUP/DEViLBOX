/**
 * PatternMatchModal.tsx
 * 
 * Shows remixes/covers that share the same melody (pattern hash).
 * Triggered when user clicks "Find Similar Tunes" button.
 */

import React, { useEffect } from 'react';
import { X, Music, Download, ExternalLink } from 'lucide-react';
import { usePatternMatchModal } from '@stores/usePatternMatchModal';
import { findPatternMatches } from '@/lib/modlandApi';
import { extractMetadata } from '@/lib/modland/ModlandMetadata';
import { useModalClose } from '@hooks/useDialogKeyboard';

export const PatternMatchModal: React.FC = () => {
  const { 
    isOpen, 
    patternHash, 
    originalFile,
    matches, 
    loading,
    setMatches, 
    closeModal 
  } = usePatternMatchModal();

  useModalClose({ isOpen, onClose: closeModal });

  // Fetch pattern matches when modal opens
  useEffect(() => {
    if (isOpen && patternHash) {
      findPatternMatches(parseInt(patternHash, 10))
        .then((results) => {
          // Filter out the original file if present
          const filtered = originalFile 
            ? results.filter(r => r.song_id !== originalFile.song_id)
            : results;
          setMatches(filtered);
        })
        .catch((error) => {
          console.error('[PatternMatchModal] Failed to fetch matches:', error);
          setMatches([]);
        });
    }
  }, [isOpen, patternHash, originalFile, setMatches]);

  if (!isOpen) return null;

  const handleDownload = (file: typeof matches[0]) => {
    // Open download URL in new tab
    window.open(file.url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[80vh] bg-ft2-bg border-2 border-ft2-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ft2-border bg-ft2-rowEven">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-ft2-highlight" />
            <h2 className="text-ft2-text text-sm font-bold tracking-wide">
              FIND SIMILAR TUNES
            </h2>
          </div>
          <button
            onClick={closeModal}
            className="text-ft2-textDim hover:text-ft2-text transition-colors focus:outline-none"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Info */}
          <div className="text-ft2-textDim text-[10px] font-mono leading-relaxed">
            <p>
              These files share the same melody (pattern hash) with the loaded module.
              They may be remixes, covers, or variations by different composers.
            </p>
            {originalFile && (
              <p className="mt-2 text-ft2-text">
                <span className="text-ft2-highlight">Original:</span>{' '}
                {extractMetadata(originalFile).title}
              </p>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-ft2-textDim text-xs font-mono animate-pulse">
                Searching Modland database...
              </div>
            </div>
          )}

          {/* No matches */}
          {!loading && matches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <Music className="w-12 h-12 text-ft2-textDim opacity-50" />
              <div className="text-ft2-textDim text-xs font-mono text-center">
                No similar tunes found in the Modland database.
                <br />
                This melody appears to be unique!
              </div>
            </div>
          )}

          {/* Matches list */}
          {!loading && matches.length > 0 && (
            <div className="space-y-2">
              <div className="text-ft2-text text-[10px] font-mono font-bold mb-2">
                {matches.length} similar tune{matches.length !== 1 ? 's' : ''} found:
              </div>

              {matches.map((match) => {
                const meta = extractMetadata(match);

                return (
                  <div
                    key={match.song_id}
                    className="flex items-start gap-3 p-3 bg-ft2-rowEven border border-ft2-border hover:border-ft2-highlight transition-colors group"
                  >
                    <Music className="w-4 h-4 text-ft2-textDim mt-0.5 flex-shrink-0" />
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-ft2-text text-[11px] font-mono font-bold truncate">
                        {meta.title}
                      </div>
                      <div className="text-ft2-textDim text-[9px] font-mono truncate">
                        by {meta.artist}
                      </div>
                      <div className="text-ft2-textDim text-[9px] font-mono truncate mt-1">
                        {meta.format} • {match.url.split('/').slice(-2).join('/')}
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDownload(match)}
                        className="p-1.5 bg-ft2-highlight text-ft2-bg hover:bg-ft2-text transition-colors focus:outline-none"
                        title="Download from Modland"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-transparent border border-ft2-border text-ft2-text hover:bg-ft2-highlight hover:text-ft2-bg hover:border-ft2-highlight transition-colors focus:outline-none"
                        title="Open in Modland"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-ft2-border bg-ft2-rowEven">
          <div className="text-ft2-textDim text-[9px] font-mono">
            Pattern Hash: {patternHash}
          </div>
          <button
            onClick={closeModal}
            className="px-3 py-1.5 bg-transparent border border-ft2-border text-ft2-text text-[10px] font-mono hover:bg-ft2-highlight hover:text-ft2-bg hover:border-ft2-highlight transition-colors focus:outline-none"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
