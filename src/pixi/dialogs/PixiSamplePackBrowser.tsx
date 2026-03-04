/**
 * PixiSamplePackBrowser — GL-native sample pack browser.
 *
 * GL port of src/components/instruments/SamplePackBrowser.tsx.
 * Three-panel layout: pack sidebar | category tabs + sample list.
 * Supports browsing, preview/audition, search, category filter,
 * ZIP/audio file upload (via glFilePicker), and loading into instruments.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { useInstrumentStore, useSamplePackStore, useAllSamplePacks, notify } from '@stores';
import { SAMPLE_CATEGORY_LABELS } from '@typedefs/samplePack';
import type { SamplePack, SampleInfo, SampleCategory } from '@typedefs/samplePack';
import type { InstrumentConfig } from '@typedefs/instrument';
import { normalizeUrl } from '@utils/urlUtils';
import {
  CACHE_NAME as SAMPLE_PACK_CACHE_NAME,
  STORAGE_KEY as SAMPLE_PACK_STORAGE_KEY,
} from '@/lib/SamplePackPrefetcher';
import { getToneEngine } from '@engine/ToneEngine';
import { usePixiTheme } from '../theme';
import { PixiModal, PixiModalFooter } from '../components/PixiModal';
import { PixiButton } from '../components/PixiButton';
import { PixiLabel } from '../components/PixiLabel';
import { PixiList } from '../components/PixiList';
import { PixiSelect } from '../components/PixiSelect';
import type { SelectOption } from '../components/PixiSelect';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { pickFile } from '../services/glFilePicker';


// ---------------------------------------------------------------------------
// Cache helpers (mirrored from DOM version)
// ---------------------------------------------------------------------------

async function isSampleCached(url: string): Promise<boolean> {
  if (!('caches' in window)) return true;
  try {
    const cache = await caches.open(SAMPLE_PACK_CACHE_NAME);
    return !!(await cache.match(url));
  } catch {
    return true;
  }
}

async function warnIfNotCached(url: string): Promise<boolean> {
  if (localStorage.getItem(SAMPLE_PACK_STORAGE_KEY) === 'v1') return false;
  if (!url.startsWith('/data/samples/packs/')) return false;
  if (!(await isSampleCached(url))) {
    notify.warning('Sample packs are still downloading — try again in a moment');
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MODAL_W = 780;
const MODAL_H = 540;
const SIDEBAR_W = 180;
const HEADER_H = 36;
const FOOTER_H = 44;
const SEARCH_H = 30;
const CATEGORY_H = 28;
const BODY_H = MODAL_H - HEADER_H - FOOTER_H;
const LIST_W = MODAL_W - SIDEBAR_W;
const LIST_H = BODY_H - SEARCH_H - CATEGORY_H - 8;

// Category dot colors (GL hex)
const CATEGORY_COLORS: Partial<Record<SampleCategory, number>> = {
  kicks: 0xf87171,
  snares: 0xfb923c,
  hihats: 0xfbbf24,
  claps: 0xf472b6,
  percussion: 0xa78bfa,
  fx: 0x4ade80,
  bass: 0x60a5fa,
  leads: 0xfbbf24,
  pads: 0x818cf8,
  loops: 0x34d399,
  vocals: 0xf472b6,
  other: 0x9ca3af,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PixiSamplePackBrowserProps {
  onClose: () => void;
}

export const PixiSamplePackBrowser: React.FC<PixiSamplePackBrowserProps> = ({
  onClose,
}) => {
  const theme = usePixiTheme();
  const { currentInstrumentId, updateInstrument, setPreviewInstrument } =
    useInstrumentStore();
  const { uploadZip, removeUserPack } = useSamplePackStore();
  const allPacks = useAllSamplePacks();

  const [selectedPack, setSelectedPack] = useState<SamplePack | null>(
    allPacks[0] || null,
  );
  const [activeCategory, setActiveCategory] = useState<SampleCategory>('kicks');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSampleUrl, setSelectedSampleUrl] = useState<string | null>(null);
  const [playingSample, setPlayingSample] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const playerRef = useRef<Tone.Player | null>(null);
  const previewVersionRef = useRef(0);
  const isMountedRef = useRef(true);

  // Keep selectedPack in sync if packs list changes
  useEffect(() => {
    if (selectedPack && !allPacks.find((p: SamplePack) => p.id === selectedPack.id)) {
      setSelectedPack(allPacks[0] || null);
      setSelectedSampleUrl(null);
    } else if (!selectedPack && allPacks.length > 0) {
      setSelectedPack(allPacks[0]);
    }
  }, [allPacks, selectedPack]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
      }
      setPreviewInstrument(null);
      try { getToneEngine().invalidateInstrument(999); } catch { /* */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview instrument sync
  const primarySample = useMemo((): SampleInfo | null => {
    if (!selectedSampleUrl || !selectedPack) return null;
    for (const cat of selectedPack.categories) {
      const found = selectedPack.samples[cat]?.find((s) => s.url === selectedSampleUrl);
      if (found) return found;
    }
    return null;
  }, [selectedSampleUrl, selectedPack]);

  const previewConfig = useMemo((): InstrumentConfig | null => {
    if (!primarySample) return null;
    return {
      id: 999,
      name: `Preview: ${primarySample.name}`,
      type: 'sample',
      synthType: 'Sampler',
      sample: {
        url: primarySample.url,
        baseNote: 'C4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        reverse: false,
        playbackRate: 1,
      },
      effects: [],
      volume: -6,
      pan: 0,
    } as InstrumentConfig;
  }, [primarySample]);

  useEffect(() => {
    if (previewConfig) {
      setPreviewInstrument(previewConfig);
      try { getToneEngine().invalidateInstrument(999); } catch { /* */ }
    } else {
      setPreviewInstrument(null);
    }
  }, [previewConfig, setPreviewInstrument]);

  // ---- Filtered samples ----
  const filteredSamples = useMemo((): SampleInfo[] => {
    if (!selectedPack) return [];
    const samples = selectedPack.samples[activeCategory] || [];
    if (!searchQuery.trim()) return samples;
    const q = searchQuery.toLowerCase();
    return samples.filter(
      (s) => s.name.toLowerCase().includes(q) || s.filename.toLowerCase().includes(q),
    );
  }, [selectedPack, activeCategory, searchQuery]);

  // ---- Category options for PixiSelect ----
  const categoryOptions = useMemo((): SelectOption[] => {
    if (!selectedPack) return [];
    return selectedPack.categories
      .filter((c) => (selectedPack.samples[c]?.length || 0) > 0)
      .map((c) => ({
        value: c,
        label: `${SAMPLE_CATEGORY_LABELS[c]} (${selectedPack.samples[c]?.length || 0})`,
      }));
  }, [selectedPack]);

  // ---- Pack list items for PixiList ----
  const packListItems = useMemo(
    () =>
      allPacks.map((p: SamplePack) => ({
        id: p.id,
        label: p.name,
        sublabel: `${p.sampleCount}`,
      })),
    [allPacks],
  );

  // ---- Sample list items for PixiList ----
  const sampleListItems = useMemo(
    () =>
      filteredSamples.map((s) => ({
        id: s.url,
        label: s.name,
        dotColor: CATEGORY_COLORS[s.category],
      })),
    [filteredSamples],
  );

  // ---- Preview ----
  const previewSample = useCallback(async (url: string) => {
    if (await warnIfNotCached(url)) return;
    const ver = ++previewVersionRef.current;
    try {
      if (playerRef.current) {
        playerRef.current.stop();
        playerRef.current.dispose();
        playerRef.current = null;
      }
      await Tone.start();
      setPlayingSample(url);
      const player = new Tone.Player({
        url: normalizeUrl(url),
        onload: () => {
          if (previewVersionRef.current === ver) player.start();
        },
        onstop: () => {
          if (previewVersionRef.current === ver) setPlayingSample(null);
        },
      }).toDestination();
      playerRef.current = player;
    } catch {
      if (previewVersionRef.current === ver) setPlayingSample(null);
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setPlayingSample(null);
  }, []);

  // ---- Select & audition ----
  const handleSampleSelect = useCallback(
    (url: string) => {
      setSelectedSampleUrl(url);
      previewSample(url);
    },
    [previewSample],
  );

  // ---- Pack select ----
  const handlePackSelect = useCallback(
    (id: string) => {
      const pack = allPacks.find((p: SamplePack) => p.id === id) || null;
      setSelectedPack(pack);
      setSelectedSampleUrl(null);
      setSearchQuery('');
      if (pack && pack.categories.length > 0) {
        setActiveCategory(pack.categories[0]);
      }
    },
    [allPacks],
  );

  // ---- Delete user pack ----
  const handleDeletePack = useCallback(() => {
    if (!selectedPack?.isUserUploaded) return;
    removeUserPack(selectedPack.id);
  }, [selectedPack, removeUserPack]);

  // ---- Load sample(s) into instrument ----
  const handleLoadSample = useCallback(async () => {
    if (!selectedSampleUrl || !selectedPack) return;
    if (await warnIfNotCached(selectedSampleUrl)) return;

    let sampleInfo: SampleInfo | undefined;
    for (const cat of selectedPack.categories) {
      sampleInfo = selectedPack.samples[cat]?.find((s) => s.url === selectedSampleUrl);
      if (sampleInfo) break;
    }
    if (!sampleInfo) return;

    const { createInstrument, getInstrument } = useInstrumentStore.getState();
    const payload = {
      type: 'sample' as const,
      name: sampleInfo.name,
      synthType: 'Sampler' as const,
      sample: {
        url: sampleInfo.url,
        baseNote: 'C4',
        detune: 0,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        reverse: false,
        playbackRate: 1,
      },
      effects: [],
      volume: -6,
      pan: 0,
    };

    const currentExists =
      currentInstrumentId !== null && getInstrument(currentInstrumentId);
    if (currentExists) {
      updateInstrument(currentInstrumentId!, payload);
      try { getToneEngine().invalidateInstrument(currentInstrumentId!); } catch { /* */ }
    } else {
      createInstrument(payload);
    }

    setPreviewInstrument(null);
    try { getToneEngine().invalidateInstrument(999); } catch { /* */ }
    try {
      const all = useInstrumentStore.getState().instruments;
      getToneEngine().preloadInstruments(all).catch(() => {});
    } catch { /* */ }

    onClose();
  }, [selectedSampleUrl, selectedPack, currentInstrumentId, updateInstrument, setPreviewInstrument, onClose]);

  // ---- Upload ZIP via glFilePicker ----
  const handleUploadZip = useCallback(async () => {
    const file = await pickFile({ accept: '.zip' });
    if (!file) return;
    setIsUploading(true);
    try {
      const pack = await uploadZip(file);
      if (isMountedRef.current) {
        setSelectedPack(pack);
        if (pack.categories.length > 0) setActiveCategory(pack.categories[0]);
      }
    } catch {
      notify.error('Failed to load ZIP pack');
    } finally {
      if (isMountedRef.current) setIsUploading(false);
    }
  }, [uploadZip]);

  // ---- Upload single audio file ----
  const handleUploadAudio = useCallback(async () => {
    const file = await pickFile({ accept: 'audio/*,.wav,.mp3,.ogg,.flac' });
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type || 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);
      const name = file.name.replace(/\.[^/.]+$/, '');
      useInstrumentStore.getState().createInstrument({
        type: 'sample',
        name,
        synthType: 'Sampler',
        sample: {
          url: blobUrl,
          baseNote: 'C4',
          detune: 0,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          reverse: false,
          playbackRate: 1,
        },
        effects: [],
        volume: -6,
        pan: 0,
      });
      onClose();
    } catch {
      notify.error('Failed to load audio file');
    }
  }, [onClose]);

  // ---- Category change ----
  const handleCategoryChange = useCallback((val: string) => {
    setActiveCategory(val as SampleCategory);
    setSelectedSampleUrl(null);
  }, []);

  // ---- Double-click to load ----
  const handleSampleDoubleClick = useCallback(
    (_url: string) => {
      handleLoadSample();
    },
    [handleLoadSample],
  );

  // ---- Status text ----
  const statusText = useMemo(() => {
    if (!selectedPack) return 'Select a pack';
    const cnt = filteredSamples.length;
    const catLabel = SAMPLE_CATEGORY_LABELS[activeCategory];
    let t = `${cnt} sample${cnt !== 1 ? 's' : ''} in ${catLabel}`;
    if (selectedSampleUrl) t += '  •  Double-click or Load to use';
    return t;
  }, [selectedPack, filteredSamples.length, activeCategory, selectedSampleUrl]);

  return (
    <PixiModal isOpen onClose={onClose} width={MODAL_W} height={MODAL_H} title="SAMPLE PACKS">
      {/* Body: sidebar + main */}
      <pixiContainer layout={{ flex: 1, paddingLeft: 16, paddingRight: 16, flexDirection: 'row' }}>
        {/* ---- Left sidebar: pack list ---- */}
        <layoutContainer
          layout={{
            width: SIDEBAR_W,
            height: BODY_H - 12,
            flexDirection: 'column',
            backgroundColor: theme.bgTertiary.color,
            borderRightWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          {/* Sidebar header row */}
          <layoutContainer
            layout={{
              width: SIDEBAR_W,
              height: 28,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 6,
              paddingRight: 4,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <PixiLabel text="PACKS" size="xs" weight="semibold" color="textMuted" />
            <PixiButton label="ZIP" size="sm" width={36} height={18} onClick={handleUploadZip} loading={isUploading} />
          </layoutContainer>

          {/* Pack list */}
          <PixiList
            items={packListItems}
            width={SIDEBAR_W}
            height={BODY_H - 12 - 28}
            itemHeight={32}
            selectedId={selectedPack?.id ?? null}
            onSelect={handlePackSelect}
          />
        </layoutContainer>

        {/* ---- Main area ---- */}
        <pixiContainer layout={{ flex: 1, flexDirection: 'column' }}>
          {/* Pack info bar */}
          <layoutContainer
            layout={{
              width: LIST_W - 32,
              height: 28,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 8,
              gap: 8,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            {selectedPack ? (
              <>
                <PixiLabel text={selectedPack.name} size="sm" weight="semibold" />
                <PixiLabel text={`by ${selectedPack.author}`} size="xs" color="textMuted" />
                <PixiLabel text={`${selectedPack.sampleCount} samples`} size="xs" color="textMuted" />
                {selectedPack.isUserUploaded && (
                  <PixiButton label="Del" variant="danger" size="sm" width={32} height={18} onClick={handleDeletePack} />
                )}
              </>
            ) : (
              <PixiLabel text="Select a sample pack" size="sm" color="textMuted" />
            )}
          </layoutContainer>

          {/* Search + category row */}
          <layoutContainer
            layout={{
              width: LIST_W - 32,
              height: SEARCH_H + CATEGORY_H,
              flexDirection: 'column',
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 4,
              gap: 4,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            {/* Search input */}
            <PixiPureTextInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search samples..."
              width={LIST_W - 36}
              height={22}
              font="sans"
              fontSize={11}
            />

            {/* Category selector */}
            <PixiSelect
              options={categoryOptions}
              value={activeCategory}
              onChange={handleCategoryChange}
              width={LIST_W - 36}
              height={22}
              placeholder="Category"
            />
          </layoutContainer>

          {/* Sample list */}
          <PixiList
            items={sampleListItems}
            width={LIST_W - 32}
            height={LIST_H - 28}
            itemHeight={26}
            selectedId={selectedSampleUrl}
            onSelect={handleSampleSelect}
            onDoubleClick={handleSampleDoubleClick}
          />
        </pixiContainer>
      </pixiContainer>

      {/* ---- Footer ---- */}
      <PixiModalFooter width={MODAL_W}>
        <pixiContainer layout={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PixiLabel text={statusText} size="xs" color="textMuted" />
          {playingSample && (
            <PixiButton label="Stop" size="sm" width={44} height={20} onClick={stopPreview} />
          )}
        </pixiContainer>
        <PixiButton label="Audio" size="sm" onClick={handleUploadAudio} />
        <PixiButton label="Cancel" onClick={onClose} />
        <PixiButton
          label={selectedSampleUrl ? 'Load Sample' : 'Load'}
          variant="primary"
          disabled={!selectedSampleUrl}
          onClick={handleLoadSample}
        />
      </PixiModalFooter>
    </PixiModal>
  );
};
