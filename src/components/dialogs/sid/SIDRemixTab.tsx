/**
 * SIDRemixTab — Remix64 and RKO (Remix.Kwed.Org) cross-references.
 * Search for remixes of SID tunes on both major C64 remix databases.
 */

import React from 'react';
import { ExternalLink, Headphones, Search } from 'lucide-react';

interface SIDRemixTabProps {
  composerName: string | null;
  tuneName: string | null;
  className?: string;
}

const REMIX64_BASE = 'https://remix64.com';
const RKO_BASE = 'https://remix.kwed.org';

export const SIDRemixTab: React.FC<SIDRemixTabProps> = ({
  composerName,
  tuneName,
  className,
}) => {
  const remix64ComposerUrl = composerName
    ? `${REMIX64_BASE}/search?q=${encodeURIComponent(composerName)}`
    : null;

  const remix64TuneUrl = tuneName
    ? `${REMIX64_BASE}/search?q=${encodeURIComponent(tuneName)}`
    : null;

  const rkoComposerUrl = composerName
    ? `${RKO_BASE}/search.php?search_id=${encodeURIComponent(composerName)}`
    : null;

  const rkoTuneUrl = tuneName
    ? `${RKO_BASE}/search.php?search_id=${encodeURIComponent(tuneName)}`
    : null;

  const hasAnySearch = composerName || tuneName;

  return (
    <div className={`flex flex-col h-full p-3 space-y-4 ${className ?? ''}`}>
      {/* Header */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <Headphones className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-text-primary">SID Remixes</h3>
        </div>
        <p className="text-xs text-text-muted">
          Find remixes and covers of C64 SID tunes
        </p>
      </div>

      {hasAnySearch ? (
        <div className="space-y-3">
          {/* Remix64 section */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1.5">Remix64</span>
            <div className="space-y-1.5">
              {remix64ComposerUrl && (
                <a
                  href={remix64ComposerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-3 py-2 rounded bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border transition-colors group"
                >
                  <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-primary" />
                  <span className="text-xs text-text-primary flex-1 truncate">
                    Composer: {composerName}
                  </span>
                  <ExternalLink className="w-3 h-3 text-text-muted shrink-0" />
                </a>
              )}
              {remix64TuneUrl && (
                <a
                  href={remix64TuneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-3 py-2 rounded bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border transition-colors group"
                >
                  <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-primary" />
                  <span className="text-xs text-text-primary flex-1 truncate">
                    Tune: {tuneName}
                  </span>
                  <ExternalLink className="w-3 h-3 text-text-muted shrink-0" />
                </a>
              )}
            </div>
          </div>

          {/* RKO section */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1.5">Remix.Kwed.Org</span>
            <div className="space-y-1.5">
              {rkoComposerUrl && (
                <a
                  href={rkoComposerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-3 py-2 rounded bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border transition-colors group"
                >
                  <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-primary" />
                  <span className="text-xs text-text-primary flex-1 truncate">
                    Composer: {composerName}
                  </span>
                  <ExternalLink className="w-3 h-3 text-text-muted shrink-0" />
                </a>
              )}
              {rkoTuneUrl && (
                <a
                  href={rkoTuneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-3 py-2 rounded bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border transition-colors group"
                >
                  <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-primary" />
                  <span className="text-xs text-text-primary flex-1 truncate">
                    Tune: {tuneName}
                  </span>
                  <ExternalLink className="w-3 h-3 text-text-muted shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-text-muted">
          <Headphones className="w-8 h-8 mb-2 opacity-30" />
          <p className="text-sm">No search data available</p>
          <p className="text-xs mt-1">Load a SID with composer or title info</p>
        </div>
      )}

      {/* Site links */}
      <div className="border-t border-dark-border pt-3 mt-auto">
        <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1.5">Browse</span>
        <div className="flex flex-wrap gap-3">
          <a
            href={REMIX64_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Remix64
          </a>
          <a
            href={RKO_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Remix.Kwed.Org
          </a>
        </div>
      </div>
    </div>
  );
};
