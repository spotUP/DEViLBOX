/**
 * SIDGB64Tab — GameBase64 cross-references.
 * Link-based integration (no API) to search for C64 game music on GB64.
 */

import React from 'react';
import { ExternalLink, Gamepad2, Search } from 'lucide-react';

interface SIDGB64TabProps {
  composerName: string | null;
  tuneName: string | null;
  className?: string;
}

const GB64_BASE = 'https://gb64.com';

export const SIDGB64Tab: React.FC<SIDGB64TabProps> = ({
  composerName,
  tuneName,
  className,
}) => {
  const composerSearchUrl = composerName
    ? `${GB64_BASE}/search.php?a=4&f=2&id=0&d=18&h=0&r=20&search=${encodeURIComponent(composerName)}`
    : null;

  const tuneSearchUrl = tuneName
    ? `${GB64_BASE}/search.php?a=4&f=0&id=0&d=18&h=0&r=20&search=${encodeURIComponent(tuneName)}`
    : null;

  return (
    <div className={`flex flex-col h-full p-3 space-y-4 ${className ?? ''}`}>
      {/* Header */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <Gamepad2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-medium text-text-primary">GameBase64</h3>
        </div>
        <p className="text-xs text-text-muted">
          Cross-reference SID music with C64 game database
        </p>
      </div>

      {/* Search buttons */}
      <div className="space-y-2">
        {composerSearchUrl && (
          <a
            href={composerSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full px-3 py-2 rounded bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border transition-colors group"
          >
            <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-primary" />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-text-primary block truncate">
                Search by composer: {composerName}
              </span>
            </div>
            <ExternalLink className="w-3 h-3 text-text-muted shrink-0" />
          </a>
        )}

        {tuneSearchUrl && (
          <a
            href={tuneSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full px-3 py-2 rounded bg-dark-bgSecondary hover:bg-dark-bgHover border border-dark-border transition-colors group"
          >
            <Search className="w-3.5 h-3.5 text-text-muted group-hover:text-accent-primary" />
            <div className="flex-1 min-w-0">
              <span className="text-xs text-text-primary block truncate">
                Search by tune: {tuneName}
              </span>
            </div>
            <ExternalLink className="w-3 h-3 text-text-muted shrink-0" />
          </a>
        )}

        {!composerSearchUrl && !tuneSearchUrl && (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Gamepad2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No search data available</p>
            <p className="text-xs mt-1">Load a SID with composer or title info</p>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="border-t border-dark-border pt-3 mt-auto">
        <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1.5">Quick Links</span>
        <div className="flex flex-wrap gap-2">
          <a
            href={GB64_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            GB64 Homepage
          </a>
          <a
            href={`${GB64_BASE}/search.php`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            Advanced Search
          </a>
        </div>
      </div>
    </div>
  );
};
