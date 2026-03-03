/**
 * ComposerProfile — Displays a C64 SID composer's profile from the DeepSID database.
 * Shows photo, bio, country, handles, notable works, active years, links, etc.
 */

import React from 'react';
import {
  Globe, Music, Calendar, Star, ExternalLink, User, Briefcase, Tag,
} from 'lucide-react';
import type { ComposerProfile as ComposerData } from '@/lib/sid/composerApi';
import { getComposerPhotoUrl } from '@/lib/sid/composerApi';

interface ComposerProfileProps {
  composer: ComposerData;
}

export const ComposerProfile: React.FC<ComposerProfileProps> = ({ composer }) => {
  const photoUrl = getComposerPhotoUrl(composer.photoUrl);
  const birthYear = composer.born ? parseInt(composer.born.slice(0, 4)) : null;
  const deathYear = composer.died ? parseInt(composer.died.slice(0, 4)) : null;
  const currentAge = birthYear && !deathYear
    ? new Date().getFullYear() - birthYear
    : null;
  const deathAge = birthYear && deathYear ? deathYear - birthYear : null;

  // Group tags by type
  const genreTags = composer.tags.filter(t => t.type === 'GENRE');
  const prodTags = composer.tags.filter(t => t.type === 'PRODUCTION');

  return (
    <div className="space-y-3">
      {/* Profile Card */}
      <div className="flex gap-3 bg-blue-950/30 border border-blue-800/40 rounded-lg p-3">
        {/* Photo */}
        <div className="shrink-0 w-20 h-20 rounded overflow-hidden bg-blue-900/30 border border-blue-800/30">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={composer.name}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-8 h-8 text-blue-800/50" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="text-sm font-bold text-blue-200 truncate">{composer.name}</h3>
          {composer.handles.length > 0 && (
            <p className="text-xs text-blue-300/70 truncate">
              aka {composer.handles.join(', ')}
            </p>
          )}
          {composer.country && (
            <div className="flex items-center gap-1.5 text-xs text-blue-300/60">
              <Globe className="w-3 h-3" />
              <span className="truncate">{composer.country}</span>
            </div>
          )}
          {(birthYear || deathYear) && (
            <div className="flex items-center gap-1.5 text-xs text-blue-300/60">
              <Calendar className="w-3 h-3" />
              <span>
                {birthYear ? `b. ${birthYear}` : ''}
                {deathYear ? ` — d. ${deathYear}` : ''}
                {currentAge ? ` (age ${currentAge})` : ''}
                {deathAge ? ` (age ${deathAge})` : ''}
              </span>
            </div>
          )}
          {composer.notable && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400/80">
              <Star className="w-3 h-3" />
              <span className="truncate">{composer.notable}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-3 text-xs text-text-muted px-1">
        <div className="flex items-center gap-1.5">
          <Music className="w-3 h-3 text-blue-400/60" />
          <span>{composer.tuneCount} tune{composer.tuneCount !== 1 ? 's' : ''}</span>
        </div>
        {composer.activeYears.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-blue-400/60" />
            <span>
              {composer.activeYears[0]}–{composer.activeYears[composer.activeYears.length - 1]}
            </span>
          </div>
        )}
        {composer.csdbId && (
          <a
            href={`https://csdb.dk/${composer.csdbType}/?id=${composer.csdbId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-400/80 hover:text-blue-300 ml-auto"
          >
            CSDb <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Players Used */}
      {composer.players.length > 0 && (
        <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded p-2.5 space-y-1.5">
          <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5">
            <Music className="w-3 h-3" /> Players Used
          </h4>
          <div className="space-y-0.5">
            {composer.players.slice(0, 8).map((p) => (
              <div key={p.player} className="flex items-center justify-between text-xs">
                <span className="text-text-primary truncate mr-2">{p.player}</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-1.5 bg-blue-500/60 rounded-full"
                    style={{
                      width: `${Math.max(8, (p.cnt / composer.players[0].cnt) * 80)}px`,
                    }}
                  />
                  <span className="text-text-muted w-6 text-right">{p.cnt}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {(genreTags.length > 0 || prodTags.length > 0) && (
        <div className="flex flex-wrap gap-1 px-1">
          {genreTags.map(t => (
            <span key={t.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-purple-900/30 text-purple-300/80 border border-purple-800/30 rounded">
              <Tag className="w-2.5 h-2.5" />{t.name}
            </span>
          ))}
          {prodTags.map(t => (
            <span key={t.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-green-900/30 text-green-300/80 border border-green-800/30 rounded">
              {t.name}
            </span>
          ))}
        </div>
      )}

      {/* Employment / Career */}
      {composer.employment.length > 0 && (
        <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded p-2.5 space-y-1">
          <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5">
            <Briefcase className="w-3 h-3" /> Career
          </h4>
          {composer.employment.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-text-primary truncate mr-2">{e.company}</span>
              <span className="text-text-muted shrink-0">{e.years}</span>
            </div>
          ))}
        </div>
      )}

      {/* Links */}
      {composer.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {composer.links.map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-blue-900/20 text-blue-300/80 border border-blue-800/30 rounded hover:bg-blue-900/40 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />{link.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
