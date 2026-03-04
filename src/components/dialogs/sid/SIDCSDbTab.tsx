/**
 * SIDCSDbTab — CSDb (Commodore Scene Database) integration.
 * Shows scener profile, groups, and releases from CSDb API.
 */

import React, { useState, useEffect } from 'react';
import { ExternalLink, Users, Award, Loader2, Database } from 'lucide-react';

interface SIDCSDbTabProps {
  csdbId: number | null;
  composerName: string | null;
  className?: string;
}

interface CSDbGroup {
  id: number;
  name: string;
}

interface CSDbRelease {
  id: number;
  name: string;
  type?: string;
  year?: string;
  event?: string;
}

interface CSDbScener {
  handle?: string;
  groups?: CSDbGroup[];
  releases?: CSDbRelease[];
}

export const SIDCSDbTab: React.FC<SIDCSDbTabProps> = ({
  csdbId,
  composerName,
  className,
}) => {
  const [scener, setScener] = useState<CSDbScener | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!csdbId) {
      setScener(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`https://csdb.dk/webservice/?type=scener&id=${csdbId}&output=json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        // CSDb API returns nested structure
        const s = data?.Scener;
        setScener({
          handle: s?.Handle,
          groups: (s?.Group ?? []).map((g: any) => ({
            id: Number(g?.ID ?? 0),
            name: g?.Name ?? 'Unknown',
          })),
          releases: (s?.Release ?? []).map((r: any) => ({
            id: Number(r?.ID ?? 0),
            name: r?.Name ?? 'Unknown',
            type: r?.Type,
            year: r?.ReleaseYear,
            event: r?.ReleasedAt,
          })),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [csdbId]);

  const csdbProfileUrl = csdbId
    ? `https://csdb.dk/scener/?id=${csdbId}`
    : composerName
      ? `https://csdb.dk/search/?seinession=all&search=${encodeURIComponent(composerName)}&Go.x=0&Go.y=0`
      : null;

  if (!csdbId && !composerName) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-text-muted ${className ?? ''}`}>
        <Database className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No CSDb information</p>
        <p className="text-xs mt-1">Composer has no linked CSDb profile</p>
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

  if (error || (!scener && csdbId)) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-text-muted ${className ?? ''}`}>
        {error && <p className="text-sm text-accent-error mb-2">Failed to load CSDb data</p>}
        {csdbProfileUrl && (
          <a
            href={csdbProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-accent-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            View on CSDb
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full overflow-y-auto p-3 space-y-3 ${className ?? ''}`}>
      {/* Profile header */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-medium text-text-primary">
              {scener?.handle ?? composerName ?? 'Unknown'}
            </h3>
          </div>
          {csdbProfileUrl && (
            <a
              href={csdbProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              CSDb
            </a>
          )}
        </div>
      </div>

      {/* Groups */}
      {scener?.groups && scener.groups.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-text-muted">Groups</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scener.groups.map((group) => (
              <a
                key={group.id}
                href={`https://csdb.dk/group/?id=${group.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-2 py-0.5 rounded bg-dark-bgSecondary text-accent-primary hover:underline border border-dark-border"
              >
                {group.name}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Releases */}
      {scener?.releases && scener.releases.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Award className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Releases ({scener.releases.length})
            </span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {scener.releases.map((release) => (
              <a
                key={release.id}
                href={`https://csdb.dk/release/?id=${release.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-dark-bgSecondary/50 hover:bg-dark-bgHover transition-colors group"
              >
                <span className="text-xs text-text-primary truncate group-hover:text-accent-primary">
                  {release.name}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {release.type && (
                    <span className="text-[10px] text-text-muted">{release.type}</span>
                  )}
                  {release.year && (
                    <span className="text-[10px] text-text-muted font-mono">{release.year}</span>
                  )}
                  {release.event && (
                    <span className="text-[10px] text-blue-400/60 truncate max-w-[100px]">{release.event}</span>
                  )}
                  <ExternalLink className="w-2.5 h-2.5 text-text-muted opacity-0 group-hover:opacity-100" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Fallback direct link when no data fetched */}
      {!scener && csdbProfileUrl && (
        <div className="flex flex-col items-center py-4">
          <a
            href={csdbProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-accent-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            View {composerName ?? 'profile'} on CSDb
          </a>
        </div>
      )}
    </div>
  );
};
