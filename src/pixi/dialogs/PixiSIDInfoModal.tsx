/**
 * PixiSIDInfoModal — GL-native SID file info dialog.
 * Shows SID metadata, composer profile, tags, YouTube links, discography,
 * SID player usage, career info, and external links.
 *
 * GL replacement for src/components/dialogs/SIDInfoModal.tsx
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useFormatStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';
import { notify } from '@stores/useNotificationStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { SID_ENGINES } from '@engine/deepsid/DeepSIDEngineManager';
import type { SIDEngineType } from '@engine/deepsid/DeepSIDEngineManager';
import {
  fetchComposerProfile,
  fetchComposerTunes,
  fetchFileInfoByPath,
} from '@/lib/sid/composerApi';
import type {
  ComposerProfile as ComposerData,
  DeepSIDFileInfo,
  ComposerTune,
} from '@/lib/sid/composerApi';
import { downloadHVSCFile } from '@/lib/hvscApi';
import { loadFile } from '@/lib/file/UnifiedFileLoader';
import { PixiModal, PixiButton, PixiLabel, PixiScrollView, PixiSelect, PixiIcon } from '../components';
import type { SelectOption } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';
import { SIDScopeTab } from './sid/SIDScopeTab';
import { SIDStereoTab } from './sid/SIDStereoTab';
import { SIDFilterTab } from './sid/SIDFilterTab';
import { SIDVisualsTab } from './sid/SIDVisualsTab';
import { SIDSTILTab } from './sid/SIDSTILTab';
import { SIDPlayerTab } from './sid/SIDPlayerTab';
import { SIDCSDbTab } from './sid/SIDCSDbTab';
import { SIDGB64Tab } from './sid/SIDGB64Tab';
import { SIDRemixTab } from './sid/SIDRemixTab';
import { SIDSettingsTab } from './sid/SIDSettingsTab';
import { SIDTagsTab } from './sid/SIDTagsTab';
import { SIDTransportBar } from './sid/SIDTransportBar';

interface PixiSIDInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SIDTabId = 'profile' | 'scope' | 'stereo' | 'filter' | 'visuals' | 'stil' | 'player' | 'csdb' | 'gb64' | 'remix' | 'tags' | 'settings';

const SID_TABS: { id: SIDTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'scope', label: 'Scope' },
  { id: 'stereo', label: 'Stereo' },
  { id: 'filter', label: 'Filter' },
  { id: 'visuals', label: 'Visuals' },
  { id: 'stil', label: 'STIL' },
  { id: 'player', label: 'Player' },
  { id: 'csdb', label: 'CSDb' },
  { id: 'gb64', label: 'GB64' },
  { id: 'remix', label: 'Remix' },
  { id: 'tags', label: 'Tags' },
  { id: 'settings', label: 'Settings' },
];

const W = 800;
const H = 680;
const PAD = 24; // DOM: p-6
const CONTENT_W = W - PAD * 2;
const COL_GAP = 20; // DOM: gap-5
const COL_W = (CONTENT_W - COL_GAP) / 2;

// ── Utility ─────────────────────────────────────────────────────────────────

/** Tiny badge: colored background + text — DOM: px-2 py-0.5 text-[10px] rounded border */
const Badge: React.FC<{
  text: string;
  bg: number;
  fg: number;
  borderColor?: number;
}> = ({ text, bg, fg, borderColor }) => (
  <layoutContainer
    layout={{
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: 2,
      paddingBottom: 2,
      borderRadius: 4,
      backgroundColor: bg,
      borderWidth: borderColor ? 1 : 0,
      borderColor: borderColor ?? 0,
    }}
  >
    <pixiBitmapText
      text={text}
      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
      tint={fg}
      layout={{}}
    />
  </layoutContainer>
);

/** Clickable link text → opens URL in browser */
const LinkButton: React.FC<{
  text: string;
  url: string;
  tint: number;
  fontSize?: number;
}> = ({ text, url, tint, fontSize = 10 }) => (
  <layoutContainer
    eventMode="static"
    cursor="pointer"
    onPointerUp={() => window.open(url, '_blank')}
    layout={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
  >
    <pixiBitmapText
      text={text}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize, fill: 0xffffff }}
      tint={tint}
      layout={{}}
    />
    <pixiBitmapText
      text="↗"
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
      tint={tint}
      alpha={0.5}
      layout={{}}
    />
  </layoutContainer>
);

/** Key-value row — DOM: flex justify-between text-xs */
const InfoRow: React.FC<{
  label: string;
  value: string;
  labelColor: number;
  valueColor: number;
  width?: number;
}> = ({ label, value, labelColor, valueColor, width }) => (
  <layoutContainer
    layout={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width,
    }}
  >
    <pixiBitmapText
      text={label}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
      tint={labelColor}
      layout={{}}
    />
    <pixiBitmapText
      text={value}
      style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 14, fill: 0xffffff }}
      tint={valueColor}
      layout={{}}
    />
  </layoutContainer>
);

// ── Main Component ──────────────────────────────────────────────────────────

export const PixiSIDInfoModal: React.FC<PixiSIDInfoModalProps> = ({ isOpen, onClose }) => {
  const theme = usePixiTheme();

  const { sidMetadata, setSidMetadata, songDBInfo } = useFormatStore(
    useShallow((state) => ({
      sidMetadata: state.sidMetadata,
      setSidMetadata: state.setSidMetadata,
      songDBInfo: state.songDBInfo,
    }))
  );

  const sidEngine = useSettingsStore((s) => s.sidEngine);
  const setSidEngine = useSettingsStore((s) => s.setSidEngine);
  const sidHwMode = useSettingsStore((s) => s.sidHardwareMode);

  const [composer, setComposer] = useState<ComposerData | null>(null);
  const [composerLoading, setComposerLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState<DeepSIDFileInfo | null>(null);
  const [tunes, setTunes] = useState<ComposerTune[]>([]);
  const [tunesTotal, setTunesTotal] = useState(0);
  const [showAllTunes, setShowAllTunes] = useState(false);
  const [loadingTuneId, setLoadingTuneId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SIDTabId>('profile');

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleLoadTune = useCallback(
    async (tune: ComposerTune) => {
      if (loadingTuneId !== null) return;
      setLoadingTuneId(tune.id);
      try {
        const buffer = await downloadHVSCFile(tune.path);
        const file = new File([buffer], tune.filename || tune.path.split('/').pop() || 'tune.sid');
        const result = await loadFile(file, { requireConfirmation: false });
        if (result.success === true) {
          notify.success(result.message);
          onClose();
        } else if (result.success === false) {
          notify.error(result.error);
        }
      } catch (err) {
        notify.error(err instanceof Error ? err.message : 'Failed to load tune');
      } finally {
        setLoadingTuneId(null);
      }
    },
    [loadingTuneId, onClose]
  );

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

  const handleEngineChange = useCallback(
    (value: string) => {
      const engine = value as SIDEngineType;
      setSidEngine(engine);
      notify.success(`SID engine changed to ${SID_ENGINES[engine].name}`);
    },
    [setSidEngine]
  );

  const handleSubsongPrev = useCallback(() => {
    if (!sidMetadata) return;
    const next = (sidMetadata.currentSubsong - 1 + sidMetadata.subsongs) % sidMetadata.subsongs;
    handleSubsongChange(next);
  }, [sidMetadata, handleSubsongChange]);

  const handleSubsongNext = useCallback(() => {
    if (!sidMetadata) return;
    const next = (sidMetadata.currentSubsong + 1) % sidMetadata.subsongs;
    handleSubsongChange(next);
  }, [sidMetadata, handleSubsongChange]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sidMetadata?.author) return;
    setComposerLoading(true);
    fetchComposerProfile({ author: sidMetadata.author })
      .then((result) => {
        if (result.found) setComposer(result);
      })
      .finally(() => setComposerLoading(false));
  }, [sidMetadata?.author]);

  useEffect(() => {
    if (!sidMetadata?.title) return;
    if (composer?.fullname && sidMetadata.title) {
      fetchFileInfoByPath(
        composer.fullname + '/' + sidMetadata.title.replace(/\s+/g, '_') + '.sid'
      ).then((info) => {
        if (info) setFileInfo(info);
      });
    }
  }, [composer?.fullname, sidMetadata?.title]);

  useEffect(() => {
    if (!sidMetadata?.author) return;
    fetchComposerTunes({ author: sidMetadata.author, limit: 50 }).then((result) => {
      setTunes(result.tunes);
      setTunesTotal(result.total);
    });
  }, [sidMetadata?.author]);

  // ── Early return ───────────────────────────────────────────────────────────

  if (!isOpen || !sidMetadata) return null;

  // ── Derived data ───────────────────────────────────────────────────────────

  const chipLabel = sidMetadata.chipModel !== 'Unknown' ? `MOS ${sidMetadata.chipModel}` : 'Unknown';
  const clockLabel = sidMetadata.clockSpeed !== 'Unknown' ? sidMetadata.clockSpeed : 'Unknown';
  const chipCount = 1 + (sidMetadata.secondSID ? 1 : 0) + (sidMetadata.thirdSID ? 1 : 0);

  const durationMs = songDBInfo?.duration_ms;
  const durationStr = durationMs
    ? `${Math.floor(durationMs / 60000)}:${String(Math.floor((durationMs % 60000) / 1000)).padStart(2, '0')}`
    : null;

  const birthYear = composer?.born ? parseInt(composer.born.slice(0, 4)) : null;
  const deathYear = composer?.died ? parseInt(composer.died.slice(0, 4)) : null;
  const currentAge = birthYear && !deathYear ? new Date().getFullYear() - birthYear : null;
  const deathAge = birthYear && deathYear ? deathYear - birthYear : null;

  const genreTags = composer?.tags.filter((t) => t.type === 'GENRE') ?? [];
  const prodTags = composer?.tags.filter((t) => t.type === 'PRODUCTION') ?? [];
  const fileTags = fileInfo?.tags ?? [];

  const youtubeLinks = fileInfo?.youtube ?? [];
  const displayTunes = showAllTunes ? tunes : tunes.slice(0, 10);

  // Engine select options
  const engineOptions: SelectOption[] = Object.values(SID_ENGINES).map((eng) => ({
    value: eng.id,
    label: `${eng.name} — ${eng.accuracy}, ${eng.speed}${eng.features.asidHardware ? ' ★ HW' : ''}`,
  }));

  // ── Estimated content height for scroll view ──────────────────────────────

  const topRowH = 250;
  const youtubeH = youtubeLinks.length > 0 ? 24 + youtubeLinks.length * 22 : 0;
  const bottomGridH =
    composer && (composer.players.length > 0 || composer.employment.length > 0 || composer.links.length > 0)
      ? 160
      : 0;
  const discoH = tunes.length > 0 ? 24 + displayTunes.length * 18 + (tunes.length > 10 ? 24 : 0) : 0;
  const totalContentH = topRowH + youtubeH + bottomGridH + discoH + 60; // padding

  const scrollH = H - 48 - 40 - 32 - 4; // minus header, transport, tab bar, bottom margin
  const tabContentH = scrollH;

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onClose}
      width={W}
      height={H}
      overlayAlpha={0.7}
      borderRadius={12}
    >
      {/* Header — DOM: px-6 py-3 border-b bg-gradient-to-r from-blue-950/40 */}
      <layoutContainer
        layout={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 12,
          paddingBottom: 12,
          backgroundColor: 0x0c1630,
          borderBottomWidth: 1,
          borderColor: 0x1e3050,
        }}
      >
        <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <pixiBitmapText
            text="SID File Info"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
            tint={0xdbeafe}
            layout={{}}
          />
          <Badge
            text={`${sidMetadata.format}v${sidMetadata.version}`}
            bg={0x1e3a5f}
            fg={0x93c5fd}
          />
        </layoutContainer>
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={onClose}
          layout={{
            width: 28,
            height: 28,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
          }}
        >
          <PixiIcon name="close" size={16} color={theme.textMuted.color} layout={{}} />
        </layoutContainer>
      </layoutContainer>

      {/* ═══ Transport Bar ═══ */}
      <SIDTransportBar width={W} />

      {/* ═══ Tab Bar ═══ */}
      <layoutContainer layout={{ flexDirection: 'row', gap: 0, borderBottomWidth: 1, borderColor: theme.border.color, backgroundColor: theme.bgSecondary.color }}>
        {SID_TABS.map(tab => (
          <layoutContainer
            key={tab.id}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => setActiveTab(tab.id)}
            layout={{
              paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              borderBottomWidth: activeTab === tab.id ? 2 : 0,
              borderColor: 0x3b82f6,
            }}
          >
            <pixiBitmapText
              text={tab.label}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
              tint={activeTab === tab.id ? 0x93c5fd : theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
        ))}
      </layoutContainer>

      {/* ═══ Tab Content ═══ */}
      {activeTab === 'profile' ? (
      <PixiScrollView width={W} height={scrollH} contentHeight={totalContentH}>
        <layoutContainer
          layout={{
            width: CONTENT_W,
            flexDirection: 'column',
            padding: PAD,
            gap: 20,
          }}
        >
          {/* ─── Top Row: two columns — DOM: grid grid-cols-2 gap-5 ─── */}
          <layoutContainer layout={{ flexDirection: 'row', gap: COL_GAP, width: CONTENT_W }}>
            {/* ─ Left column: SID file details — DOM: space-y-4 ─ */}
            <layoutContainer layout={{ width: COL_W, flexDirection: 'column', gap: 16 }}>
              {/* Title / Author / Copyright card — DOM: p-4 */}
              <layoutContainer
                layout={{
                  width: COL_W,
                  flexDirection: 'column',
                  gap: 4,
                  padding: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: 0x0c1e3a,
                  borderColor: 0x1e3a5f,
                }}
              >
                <pixiBitmapText
                text={sidMetadata.title || 'Untitled'}
                style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 18, fill: 0xffffff }}
                tint={0xdbeafe}
                layout={{}}
              />
              <pixiBitmapText
                text={sidMetadata.author || 'Unknown'}
                style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 16, fill: 0xffffff }}
                tint={0x93c5fd}
                layout={{}}
              />
              {sidMetadata.copyright ? (
                <pixiBitmapText
                  text={sidMetadata.copyright}
                  style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                  tint={theme.textMuted.color}
                  layout={{}}
                />
              ) : null}

                {/* Chip / Clock / Duration — DOM: text-xs border-t pt-2 */}
                <layoutContainer
                  layout={{
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'center',
                    marginTop: 4,
                    borderTopWidth: 1,
                    borderColor: 0x1e3a5f,
                    paddingTop: 8,
                  }}
                >
                  <pixiBitmapText
                    text={`${chipLabel}${chipCount > 1 ? ` × ${chipCount}` : ''}`}
                    style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 14, fill: 0xffffff }}
                    tint={0x93c5fd}
                    layout={{}}
                  />
                  <pixiBitmapText
                    text={clockLabel}
                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                    tint={0x93c5fd}
                    layout={{}}
                  />
                  {durationStr ? (
                    <pixiBitmapText
                      text={durationStr}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 16, fill: 0xffffff }}
                      tint={0xdbeafe}
                      layout={{}}
                    />
                  ) : null}
                </layoutContainer>
              </layoutContainer>

              {/* Subsong selector — DOM: p-3 rounded-lg */}
              {sidMetadata.subsongs > 1 && (
                <layoutContainer
                  layout={{
                    width: COL_W,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    backgroundColor: theme.bg.color,
                    borderColor: theme.border.color,
                  }}
                >
                  <PixiLabel text="Subsong:" size="xs" color="textMuted" />
                  <PixiButton icon="prev" label="" variant="ghost" size="sm" onClick={handleSubsongPrev} />
                  <PixiLabel
                    text={`${sidMetadata.currentSubsong + 1} / ${sidMetadata.subsongs}`}
                    size="xs"
                    weight="semibold"
                    font="mono"
                    color="text"
                  />
                  <PixiButton icon="next" label="" variant="ghost" size="sm" onClick={handleSubsongNext} />
                </layoutContainer>
              )}

              {/* SID Engine selector — DOM: p-3 rounded-lg */}
              <layoutContainer
                layout={{
                  width: COL_W,
                  flexDirection: 'column',
                  gap: 6,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: theme.bg.color,
                  borderColor: theme.border.color,
                }}
              >
                <PixiLabel text="SID Engine" size="xs" weight="semibold" color="textMuted" />
                <PixiSelect
                  options={engineOptions}
                  value={sidEngine}
                  onChange={handleEngineChange}
                  width={COL_W - 28}
                />
                <PixiLabel
                  text={SID_ENGINES[sidEngine].description}
                  size="xs"
                  color="textMuted"
                />
                {sidHwMode !== 'off' && !SID_ENGINES[sidEngine].features.asidHardware && (
                  <PixiLabel
                    text="⚠ Hardware SID output requires jsSID. Select jsSID ★ HW above."
                    size="xs"
                    color="warning"
                  />
                )}
                {sidHwMode !== 'off' && SID_ENGINES[sidEngine].features.asidHardware && (
                  <PixiLabel
                    text={`✓ Hardware output via ${sidHwMode === 'webusb' ? 'USB-SID-Pico' : 'ASID'}`}
                    size="xs"
                    color="success"
                  />
                )}
              </layoutContainer>

              {/* SongDB Album / Year info — DOM: p-3 rounded-lg */}
              {songDBInfo && (songDBInfo.album || songDBInfo.year) && (
                <layoutContainer
                  layout={{
                    width: COL_W,
                    flexDirection: 'column',
                    gap: 6,
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    backgroundColor: theme.bg.color,
                    borderColor: theme.border.color,
                  }}
                >
                  {songDBInfo.album ? (
                    <InfoRow label="Album" value={songDBInfo.album} labelColor={theme.textMuted.color} valueColor={theme.text.color} />
                  ) : null}
                  {songDBInfo.year ? (
                    <InfoRow label="Year" value={songDBInfo.year} labelColor={theme.textMuted.color} valueColor={theme.text.color} />
                  ) : null}
                  {songDBInfo.publishers?.length > 0 ? (
                    <InfoRow
                      label="Group"
                      value={songDBInfo.publishers.join(', ')}
                      labelColor={theme.textMuted.color}
                      valueColor={theme.text.color}
                    />
                  ) : null}
                </layoutContainer>
              )}

              {/* File tags */}
              {fileTags.length > 0 && (
                <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {fileTags.map((t) => (
                    <Badge
                      key={t.name}
                      text={t.name}
                      bg={t.type === 'GENRE' ? 0x2e1065 : 0x14532d}
                      fg={t.type === 'GENRE' ? 0xc4b5fd : 0x86efac}
                    />
                  ))}
                </layoutContainer>
              )}
            </layoutContainer>

            {/* ─ Right column: Composer profile — DOM: space-y-4 ─ */}
            <layoutContainer layout={{ width: COL_W, flexDirection: 'column', gap: 16 }}>
              {composerLoading ? (
                <layoutContainer
                  layout={{
                    width: COL_W,
                    height: 96,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    backgroundColor: 0x0c1e3a,
                    borderColor: 0x1e3a5f,
                  }}
                >
                  <PixiLabel text="Loading composer…" size="xs" color="textMuted" />
                </layoutContainer>
              ) : composer ? (
                <>
                  {/* Bio card — DOM: p-4 rounded-lg */}
                  <layoutContainer
                    layout={{
                      width: COL_W,
                      flexDirection: 'column',
                      gap: 6,
                      padding: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      backgroundColor: 0x0c1e3a,
                      borderColor: 0x1e3a5f,
                    }}
                  >
                    <PixiLabel text={composer.name} size="sm" weight="bold" color="text" />
                    {composer.handles.length > 0 && (
                      <PixiLabel text={`aka ${composer.handles.join(', ')}`} size="xs" color="textMuted" />
                    )}
                    {composer.country && (
                      <PixiLabel text={composer.country} size="xs" color="textSecondary" />
                    )}
                    {(birthYear || deathYear) && (
                      <PixiLabel
                        text={[
                          birthYear ? `b. ${birthYear}` : '',
                          deathYear ? `d. ${deathYear}` : '',
                          currentAge ? `(age ${currentAge})` : '',
                          deathAge ? `(age ${deathAge})` : '',
                        ]
                          .filter(Boolean)
                          .join(' — ')}
                        size="xs"
                        color="textMuted"
                      />
                    )}
                    {composer.notable && (
                      <PixiLabel text={`★ ${composer.notable}`} size="xs" color="warning" />
                    )}
                  </layoutContainer>

                  {/* Stats bar */}
                  <layoutContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingLeft: 4 }}>
                    <PixiLabel text={`${composer.tuneCount} tunes`} size="xs" weight="semibold" color="textMuted" />
                    {composer.activeYears.length > 0 && (
                      <PixiLabel
                        text={`${composer.activeYears[0]}–${composer.activeYears[composer.activeYears.length - 1]}`}
                        size="xs"
                        color="textMuted"
                      />
                    )}
                    {composer.csdbId && (
                      <LinkButton
                        text="CSDb"
                        url={`https://csdb.dk/${composer.csdbType}/?id=${composer.csdbId}`}
                        tint={0x60a5fa}
                      />
                    )}
                  </layoutContainer>

                  {/* Genre & Production tags */}
                  {(genreTags.length > 0 || prodTags.length > 0) && (
                    <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingLeft: 4 }}>
                      {genreTags.map((t) => (
                        <Badge key={t.name} text={t.name} bg={0x2e1065} fg={0xc4b5fd} />
                      ))}
                      {prodTags.map((t) => (
                        <Badge key={t.name} text={t.name} bg={0x14532d} fg={0x86efac} />
                      ))}
                    </layoutContainer>
                  )}
                </>
              ) : (
                <layoutContainer
                  layout={{
                    width: COL_W,
                    height: 96,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    borderWidth: 1,
                    backgroundColor: theme.bg.color,
                    borderColor: theme.border.color,
                  }}
                >
                  <PixiLabel text={`No composer profile for "${sidMetadata.author}"`} size="xs" color="textMuted" />
                </layoutContainer>
              )}
            </layoutContainer>
          </layoutContainer>

          {/* ─── YouTube Links — DOM: p-4 rounded-lg ─── */}
          {youtubeLinks.length > 0 && (
            <layoutContainer
              layout={{
                width: CONTENT_W,
                flexDirection: 'column',
                gap: 12,
                padding: 16,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: 0x2d0a0a,
                borderColor: 0x5f1e1e,
              }}
            >
              <PixiLabel text="> YouTube Performances" size="xs" weight="semibold" color="error" />
              <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {youtubeLinks.map((yt, i) => (
                  <LinkButton
                    key={i}
                    text={`${yt.channel || `Performance ${i + 1}`}${yt.subtune > 0 ? ` (sub ${yt.subtune})` : ''}`}
                    url={`https://www.youtube.com/watch?v=${yt.videoId}`}
                    tint={0xfca5a5}
                  />
                ))}
              </layoutContainer>
            </layoutContainer>
          )}

          {/* ─── Bottom 3-column grid — DOM: grid grid-cols-3 gap-5 ─── */}
          {composer &&
            (composer.players.length > 0 || composer.employment.length > 0 || composer.links.length > 0) && (
              <layoutContainer layout={{ flexDirection: 'row', gap: COL_GAP, width: CONTENT_W }}>
                {/* Players used — DOM: p-4 rounded-lg */}
                {composer.players.length > 0 && (
                  <layoutContainer
                    layout={{
                      flex: 1,
                      flexDirection: 'column',
                      gap: 8,
                      padding: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      backgroundColor: theme.bg.color,
                      borderColor: theme.border.color,
                    }}
                  >
                    <PixiLabel text="SID Players Used" size="xs" weight="semibold" color="textMuted" />
                    {composer.players.slice(0, 10).map((p) => {
                      const barW = Math.max(8, (p.cnt / composer.players[0].cnt) * 60);
                      return (
                        <layoutContainer
                          key={p.player}
                          layout={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <pixiBitmapText
                            text={p.player}
                            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                            tint={theme.text.color}
                            layout={{ flex: 1 }}
                          />
                          <layoutContainer
                            layout={{
                              width: barW,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: 0x3b82f6,
                            }}
                          />
                          <pixiBitmapText
                            text={String(p.cnt)}
                            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 12, fill: 0xffffff }}
                            tint={theme.textMuted.color}
                            layout={{ width: 24 }}
                          />
                        </layoutContainer>
                      );
                    })}
                  </layoutContainer>
                )}

                {/* Career / Employment — DOM: p-4 rounded-lg */}
                {composer.employment.length > 0 && (
                  <layoutContainer
                    layout={{
                      flex: 1,
                      flexDirection: 'column',
                      gap: 8,
                      padding: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      backgroundColor: theme.bg.color,
                      borderColor: theme.border.color,
                    }}
                  >
                    <PixiLabel text="Career" size="xs" weight="semibold" color="textMuted" />
                    {composer.employment.map((e, i) => (
                      <InfoRow
                        key={i}
                        label={e.company}
                        value={e.years}
                        labelColor={theme.text.color}
                        valueColor={theme.textMuted.color}
                      />
                    ))}
                  </layoutContainer>
                )}

                {/* External Links — DOM: p-4 rounded-lg */}
                {composer.links.length > 0 && (
                  <layoutContainer
                    layout={{
                      flex: 1,
                      flexDirection: 'column',
                      gap: 8,
                      padding: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      backgroundColor: theme.bg.color,
                      borderColor: theme.border.color,
                    }}
                  >
                    <PixiLabel text="Links" size="xs" weight="semibold" color="textMuted" />
                    <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {composer.links.map((link, i) => (
                        <LinkButton key={i} text={link.name} url={link.url} tint={0x93c5fd} />
                      ))}
                    </layoutContainer>
                  </layoutContainer>
                )}
              </layoutContainer>
            )}

          {/* ─── Discography — DOM: p-4 rounded-lg ─── */}
          {tunes.length > 0 && (
            <layoutContainer
              layout={{
                width: CONTENT_W,
                flexDirection: 'column',
                gap: 8,
                padding: 16,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
              }}
            >
              <layoutContainer layout={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <PixiLabel text="Discography" size="xs" weight="semibold" color="textMuted" />
                <PixiLabel text={`(${tunesTotal} tunes)`} size="xs" color="textMuted" />
              </layoutContainer>

              <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, width: CONTENT_W - 32 }}>
                {displayTunes.map((tune) => (
                  <layoutContainer
                    key={tune.id}
                    eventMode="static"
                    cursor="pointer"
                    onPointerUp={() => handleLoadTune(tune)}
                    layout={{
                      width: (CONTENT_W - 40) / 2,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingTop: 4,
                      paddingBottom: 4,
                      paddingLeft: 4,
                      borderBottomWidth: 1,
                      borderColor: theme.border.color,
                    }}
                  >
                    <pixiBitmapText
                      text={loadingTuneId === tune.id ? '⏳' : '↓'}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                      tint={0x3b82f6}
                      alpha={loadingTuneId === tune.id ? 1 : 0.4}
                      layout={{}}
                    />
                    <pixiBitmapText
                      text={tune.filename}
                      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                      tint={theme.text.color}
                      layout={{ flex: 1 }}
                    />
                    {tune.player && (
                      <pixiBitmapText
                        text={tune.player}
                        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                        tint={theme.textMuted.color}
                        alpha={0.6}
                        layout={{}}
                      />
                    )}
                  </layoutContainer>
                ))}
              </layoutContainer>

              {tunes.length > 10 && (
                <layoutContainer
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => setShowAllTunes(!showAllTunes)}
                  layout={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 8 }}
                >
                  <pixiBitmapText
                    text={showAllTunes ? '▲ Show less' : `▼ Show all ${tunes.length} tunes`}
                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
                    tint={0x60a5fa}
                    layout={{}}
                  />
                </layoutContainer>
              )}
            </layoutContainer>
          )}
        </layoutContainer>
      </PixiScrollView>
      ) : activeTab === 'scope' ? (
        <SIDScopeTab width={W - 2} height={tabContentH} />
      ) : activeTab === 'stereo' ? (
        <SIDStereoTab width={W - 2} height={tabContentH} />
      ) : activeTab === 'filter' ? (
        <SIDFilterTab width={W - 2} height={tabContentH} />
      ) : activeTab === 'visuals' ? (
        <SIDVisualsTab width={W - 2} height={tabContentH} />
      ) : activeTab === 'stil' ? (
        <SIDSTILTab width={W - 2} height={tabContentH} hvscPath={composer?.fullname ? `${composer.fullname}/${sidMetadata.title}.sid` : null} currentSubsong={sidMetadata.currentSubsong} totalSubsongs={sidMetadata.subsongs} />
      ) : activeTab === 'player' ? (
        <SIDPlayerTab width={W - 2} height={tabContentH} playerName={fileInfo?.player || null} />
      ) : activeTab === 'csdb' ? (
        <SIDCSDbTab width={W - 2} height={tabContentH} csdbId={composer?.csdbId || null} composerName={composer?.name || null} />
      ) : activeTab === 'gb64' ? (
        <SIDGB64Tab width={W - 2} height={tabContentH} composerName={composer?.name || null} tuneName={sidMetadata.title || null} />
      ) : activeTab === 'remix' ? (
        <SIDRemixTab width={W - 2} height={tabContentH} composerName={composer?.name || null} tuneName={sidMetadata.title || null} />
      ) : activeTab === 'settings' ? (
        <SIDSettingsTab width={W - 2} height={tabContentH} />
      ) : activeTab === 'tags' ? (
        <SIDTagsTab width={W - 2} height={tabContentH} fileId={fileInfo?.id ?? null} />
      ) : null}
    </PixiModal>
  );
};
