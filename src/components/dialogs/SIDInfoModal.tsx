/**
 * SIDInfoModal — Big, rich modal showing all SID metadata + DeepSID composer data.
 * Two-column layout: left = SID file info + subsong selector, right = composer profile.
 * Below: discography, YouTube links, tags, player distribution, career, external links.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Cpu, Music, Clock, User, Disc, Hash, Globe, Calendar,
  Star, ExternalLink, Briefcase, Tag, Play, Youtube, ChevronDown, ChevronUp,
  MessageSquare,
} from 'lucide-react';
import { useTrackerStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { notify } from '@stores/useNotificationStore';
import { fetchComposerProfile, fetchComposerTunes, fetchFileInfoByPath, getComposerPhotoUrl } from '@/lib/sid/composerApi';
import type { ComposerProfile as ComposerData, DeepSIDFileInfo, ComposerTune } from '@/lib/sid/composerApi';

interface SIDInfoModalProps {
  onClose: () => void;
}

export const SIDInfoModal: React.FC<SIDInfoModalProps> = ({ onClose }) => {
  const { sidMetadata, setSidMetadata, songDBInfo } = useTrackerStore(
    useShallow((state) => ({
      sidMetadata: state.sidMetadata,
      setSidMetadata: state.setSidMetadata,
      songDBInfo: state.songDBInfo,
    }))
  );

  const [composer, setComposer] = useState<ComposerData | null>(null);
  const [composerLoading, setComposerLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<DeepSIDFileInfo | null>(null);
  const [tunes, setTunes] = useState<ComposerTune[]>([]);
  const [tunesTotal, setTunesTotal] = useState(0);
  const [showAllTunes, setShowAllTunes] = useState(false);

  const handleSubsongChange = useCallback(
    async (newIdx: number) => {
      if (!sidMetadata || newIdx === sidMetadata.currentSubsong) return;
      try {
        const { getTrackerReplayer } = await import('@engine/TrackerReplayer');
        const engine = getTrackerReplayer().getC64SIDEngine();
        if (engine) {
          engine.setSubsong(newIdx);
          setSidMetadata({ ...sidMetadata, currentSubsong: newIdx });
          notify.success(`SID Subsong ${newIdx + 1}/${sidMetadata.subsongs}`);
        }
      } catch {
        notify.error('Failed to switch SID subsong');
      }
    },
    [sidMetadata, setSidMetadata]
  );

  // Fetch composer profile
  useEffect(() => {
    if (!sidMetadata?.author) return;
    setComposerLoading(true);
    fetchComposerProfile({ author: sidMetadata.author })
      .then((result) => {
        if (result.found) setComposer(result);
      })
      .finally(() => setComposerLoading(false));
  }, [sidMetadata?.author]);

  // Fetch file info from DeepSID (for tags, YouTube, lengths)
  useEffect(() => {
    if (!sidMetadata?.title) return;
    // Try by author to find the file
    if (composer?.fullname && sidMetadata.title) {
      fetchFileInfoByPath(composer.fullname + '/' + sidMetadata.title.replace(/\s+/g, '_') + '.sid')
        .then(info => { if (info) setFileInfo(info); });
    }
  }, [composer?.fullname, sidMetadata?.title]);

  // Fetch discography
  useEffect(() => {
    if (!sidMetadata?.author) return;
    fetchComposerTunes({ author: sidMetadata.author, limit: 50 })
      .then(result => {
        setTunes(result.tunes);
        setTunesTotal(result.total);
      });
  }, [sidMetadata?.author]);

  if (!sidMetadata) return null;

  const chipLabel = sidMetadata.chipModel !== 'Unknown' ? `MOS ${sidMetadata.chipModel}` : 'Unknown';
  const clockLabel = sidMetadata.clockSpeed !== 'Unknown' ? sidMetadata.clockSpeed : 'Unknown';
  const chipCount = 1 + (sidMetadata.secondSID ? 1 : 0) + (sidMetadata.thirdSID ? 1 : 0);

  const durationMs = songDBInfo?.duration_ms;
  const durationStr = durationMs
    ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}`
    : null;

  const photoUrl = composer ? getComposerPhotoUrl(composer.photoUrl) : null;
  const birthYear = composer?.born ? parseInt(composer.born.slice(0, 4)) : null;
  const deathYear = composer?.died ? parseInt(composer.died.slice(0, 4)) : null;
  const currentAge = birthYear && !deathYear ? new Date().getFullYear() - birthYear : null;
  const deathAge = birthYear && deathYear ? deathYear - birthYear : null;

  const genreTags = composer?.tags.filter(t => t.type === 'GENRE') ?? [];
  const prodTags = composer?.tags.filter(t => t.type === 'PRODUCTION') ?? [];
  const fileTags = fileInfo?.tags ?? [];

  const youtubeLinks = fileInfo?.youtube ?? [];
  const displayTunes = showAllTunes ? tunes : tunes.slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-bgPrimary border border-blue-700/50 rounded-xl shadow-2xl shadow-blue-900/20 w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ═══ Header ═══ */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-blue-800/30 bg-gradient-to-r from-blue-950/40 to-purple-950/20 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-blue-100">SID File Info</h2>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-800/30 text-blue-300/80 font-mono">
              {sidMetadata.format}v{sidMetadata.version}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ═══ Content (scrollable) ═══ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-modern">

          {/* ─── Top Row: File Info + Composer Card ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Left: SID File Details */}
            <div className="space-y-4">
              {/* Title / Author / Copyright */}
              <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <Music className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-blue-100 truncate">{sidMetadata.title || 'Untitled'}</h3>
                    <p className="text-sm text-blue-300/80 truncate">{sidMetadata.author || 'Unknown'}</p>
                    {sidMetadata.copyright && (
                      <p className="text-xs text-text-muted truncate mt-0.5">{sidMetadata.copyright}</p>
                    )}
                  </div>
                </div>

                {/* Chip / Clock / Duration */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted border-t border-blue-800/20 pt-2">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-400/60" />
                    <span className="text-blue-300/80 font-medium">{chipLabel}{chipCount > 1 ? ` × ${chipCount}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400/60" />
                    <span className="text-blue-300/80">{clockLabel}</span>
                  </div>
                  {durationStr && (
                    <span className="text-blue-200 font-mono ml-auto text-sm">{durationStr}</span>
                  )}
                </div>
              </div>

              {/* Subsong Selector */}
              {sidMetadata.subsongs > 1 && (
                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-text-muted font-medium whitespace-nowrap">Subsong:</label>
                    {sidMetadata.subsongs > 20 ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="number"
                          min={1}
                          max={sidMetadata.subsongs}
                          value={sidMetadata.currentSubsong + 1}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(sidMetadata.subsongs, Number(e.target.value)));
                            handleSubsongChange(v - 1);
                          }}
                          className="w-20 text-sm bg-dark-bgPrimary border border-blue-800/40 rounded px-2 py-1 text-text-primary font-mono"
                        />
                        <span className="text-xs text-text-muted">of {sidMetadata.subsongs}</span>
                      </div>
                    ) : (
                      <select
                        value={sidMetadata.currentSubsong}
                        onChange={(e) => handleSubsongChange(Number(e.target.value))}
                        className="flex-1 text-sm bg-dark-bgPrimary border border-blue-800/40 rounded px-2 py-1 text-text-primary"
                      >
                        {Array.from({ length: sidMetadata.subsongs }, (_, i) => (
                          <option key={i} value={i}>
                            Subsong {i + 1}{i === sidMetadata.defaultSubsong ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* SongDB Album/Year Info */}
              {songDBInfo && (songDBInfo.album || songDBInfo.year) && (
                <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-3 space-y-1.5 text-xs">
                  {songDBInfo.album && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Album</span>
                      <span className="text-text-primary font-medium truncate ml-3">{songDBInfo.album}</span>
                    </div>
                  )}
                  {songDBInfo.year && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Year</span>
                      <span className="text-text-primary">{songDBInfo.year}</span>
                    </div>
                  )}
                  {songDBInfo.publishers?.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-text-muted">Group</span>
                      <span className="text-text-primary truncate ml-3">{songDBInfo.publishers.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* File-level Tags */}
              {fileTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {fileTags.map(t => (
                    <span key={t.name} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border ${
                      t.type === 'GENRE' ? 'bg-purple-900/30 text-purple-300/80 border-purple-800/30'
                        : 'bg-green-900/30 text-green-300/80 border-green-800/30'
                    }`}>
                      <Tag className="w-2.5 h-2.5" />{t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Composer Profile Card */}
            <div className="space-y-4">
              {composerLoading ? (
                <div className="flex items-center justify-center py-12 text-text-muted bg-blue-950/20 border border-blue-800/20 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span className="text-sm">Loading composer…</span>
                </div>
              ) : composer ? (
                <>
                  {/* Composer Bio Card */}
                  <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-4">
                    <div className="flex gap-4">
                      {/* Photo */}
                      <div className="shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-blue-900/30 border border-blue-800/30">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={composer.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-10 h-10 text-blue-800/50" />
                          </div>
                        )}
                      </div>

                      {/* Bio Info */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <h3 className="text-base font-bold text-blue-100">{composer.name}</h3>
                        {composer.handles.length > 0 && (
                          <p className="text-xs text-blue-300/70 truncate">
                            aka {composer.handles.join(', ')}
                          </p>
                        )}
                        {composer.country && (
                          <div className="flex items-center gap-1.5 text-xs text-blue-300/60">
                            <Globe className="w-3 h-3" />
                            <span>{composer.country}</span>
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
                          <div className="flex items-start gap-1.5 text-xs text-yellow-400/80">
                            <Star className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{composer.notable}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats Bar */}
                  <div className="flex items-center gap-4 text-xs text-text-muted px-1">
                    <div className="flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-blue-400/60" />
                      <span className="font-medium">{composer.tuneCount} tunes</span>
                    </div>
                    {composer.activeYears.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-400/60" />
                        <span>{composer.activeYears[0]}–{composer.activeYears[composer.activeYears.length - 1]}</span>
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

                  {/* Genre & Production Tags */}
                  {(genreTags.length > 0 || prodTags.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {genreTags.map(t => (
                        <span key={t.name} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-purple-900/30 text-purple-300/80 border border-purple-800/30 rounded">
                          <Tag className="w-2.5 h-2.5" />{t.name}
                        </span>
                      ))}
                      {prodTags.map(t => (
                        <span key={t.name} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-green-900/30 text-green-300/80 border border-green-800/30 rounded">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-text-muted text-sm bg-dark-bgSecondary/30 border border-dark-border/30 rounded-lg">
                  <User className="w-8 h-8 mx-auto mb-2 text-text-muted/30" />
                  <p>No composer profile found for "{sidMetadata.author}"</p>
                  <p className="text-xs mt-1 text-text-muted/60">
                    Profile data requires the DeepSID database.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ─── YouTube Links ─── */}
          {youtubeLinks.length > 0 && (
            <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-4">
              <h4 className="text-xs font-medium text-red-300/80 flex items-center gap-1.5 mb-3">
                <Youtube className="w-4 h-4" /> YouTube Performances
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {youtubeLinks.map((yt, i) => (
                  <a
                    key={i}
                    href={`https://www.youtube.com/watch?v=${yt.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-red-900/10 border border-red-800/20 rounded hover:bg-red-900/20 transition-colors group"
                  >
                    <Play className="w-3.5 h-3.5 text-red-400 group-hover:text-red-300" />
                    <span className="text-xs text-red-200/80 group-hover:text-red-100 truncate">
                      {yt.channel || `Performance ${i + 1}`}
                      {yt.subtune > 0 ? ` (sub ${yt.subtune})` : ''}
                    </span>
                    <ExternalLink className="w-3 h-3 text-red-400/40 ml-auto shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* ─── Bottom Row: Players + Career + Discography ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

            {/* Players Used */}
            {composer && composer.players.length > 0 && (
              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5 mb-3">
                  <Cpu className="w-3.5 h-3.5" /> SID Players Used
                </h4>
                <div className="space-y-1">
                  {composer.players.slice(0, 10).map((p) => (
                    <div key={p.player} className="flex items-center justify-between text-xs">
                      <span className="text-text-primary truncate mr-2">{p.player}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div
                          className="h-1.5 bg-blue-500/60 rounded-full"
                          style={{ width: `${Math.max(8, (p.cnt / composer.players[0].cnt) * 60)}px` }}
                        />
                        <span className="text-text-muted w-6 text-right font-mono">{p.cnt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Career / Employment */}
            {composer && composer.employment.length > 0 && (
              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5 mb-3">
                  <Briefcase className="w-3.5 h-3.5" /> Career
                </h4>
                <div className="space-y-1.5">
                  {composer.employment.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-text-primary truncate mr-2">{e.company}</span>
                      <span className="text-text-muted shrink-0 font-mono">{e.years}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* External Links */}
            {composer && composer.links.length > 0 && (
              <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4">
                <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5 mb-3">
                  <Globe className="w-3.5 h-3.5" /> Links
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {composer.links.map((link, i) => (
                    <a
                      key={i}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-900/20 text-blue-300/80 border border-blue-800/30 rounded hover:bg-blue-900/40 transition-colors"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />{link.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Discography ─── */}
          {tunes.length > 0 && (
            <div className="bg-dark-bgSecondary/50 border border-dark-border/50 rounded-lg p-4">
              <h4 className="text-xs font-medium text-text-muted flex items-center gap-1.5 mb-3">
                <Disc className="w-3.5 h-3.5" /> Discography
                <span className="text-text-muted/60 ml-1">({tunesTotal} tunes)</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                {displayTunes.map((tune) => (
                  <div key={tune.id} className="flex items-center gap-2 py-1 text-xs border-b border-dark-border/20 last:border-0">
                    <span className="text-text-primary truncate flex-1">{tune.filename}</span>
                    {tune.player && (
                      <span className="text-text-muted/60 shrink-0 text-[10px]">{tune.player}</span>
                    )}
                  </div>
                ))}
              </div>
              {tunes.length > 10 && (
                <button
                  onClick={() => setShowAllTunes(!showAllTunes)}
                  className="flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {showAllTunes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showAllTunes ? 'Show less' : `Show all ${tunes.length} tunes`}
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
