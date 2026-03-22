/**
 * PixiNewSongWizard — GL-native New Song wizard.
 *
 * Pixel-perfect port of NewSongWizard.tsx using Div/Txt/GlModal.
 * 3-step wizard: Empty/Preset → Preset browser → Starter instruments.
 * Rendered inside the Pixi scene graph so the CRT shader catches it.
 *
 * DOM reference: src/components/dialogs/NewSongWizard.tsx
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTabsStore } from '@stores/useTabsStore';
import { getGroupedPresets, SYSTEM_PRESETS } from '@constants/systemPresets';
import type { SystemPreset } from '@constants/systemPresets';
import { AMIGA_UADE_PRESET_IDS, getInstrumentPresetsForSystem } from '@constants/uadeInstrumentPresets';
import { PixiButton, PixiIcon } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';
import { usePixiTheme } from '../theme';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { PIXI_FONTS } from '../fonts';
import { Div, Txt } from '../layout';
import type { FederatedPointerEvent, FederatedWheelEvent } from 'pixi.js';
import { useApplication } from '@pixi/react';
import type { Graphics as GraphicsType } from 'pixi.js';

type WizardStep = 1 | 2 | 3;
type StartMode = 'empty' | 'preset';

const GROUPED_PRESETS = getGroupedPresets();
const MODAL_W = 640;
const MODAL_H = 560;

export const PixiNewSongWizard: React.FC = () => {
  const isOpen = useUIStore((s) => s.newSongWizardOpen);
  const close = useUIStore((s) => s.closeNewSongWizard);
  const theme = usePixiTheme();
  const { app } = useApplication();

  useModalClose({ isOpen, onClose: close });

  const [step, setStep] = useState<WizardStep>(1);
  const [startMode, setStartMode] = useState<StartMode>('empty');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('amiga_protracker');
  const [withPresetInstruments, setWithPresetInstruments] = useState(true);
  const [filter, setFilter] = useState('');
  const [scrollY, setScrollY] = useState(0);

  const finish = useCallback(
    (mode: StartMode, loadInstruments: boolean) => {
      const presetId = selectedPresetId;
      const preset = SYSTEM_PRESETS.find((p) => p.id === presetId);

      // If this is a template-based Amiga format, load the template file
      if (mode === 'preset' && preset?.templateFile) {
        const templatePath = preset.templateFile;
        // Close wizard immediately, then load async
        setStep(1); setStartMode('empty'); setSelectedPresetId('amiga_protracker');
        setWithPresetInstruments(true); setFilter(''); setScrollY(0);
        close();

        // Fetch template and load it through the unified file loader
        (async () => {
          try {
            const resp = await fetch(`/${templatePath}`);
            if (!resp.ok) throw new Error(`Failed to fetch template: ${resp.status}`);
            const buf = await resp.arrayBuffer();
            // Derive filename from template path
            const filename = templatePath.split('/').pop() || 'template.mod';
            const file = new File([buf], filename);

            useTabsStore.getState().addTab();
            const { loadFile } = await import('@lib/file/UnifiedFileLoader');
            await loadFile(file, { requireConfirmation: false });

            // Apply Amiga settings after load
            if (AMIGA_UADE_PRESET_IDS.has(presetId)) {
              useTrackerStore.getState().applyAmigaSongSettings(presetId);
            }
            useUIStore.getState().setActiveSystemPreset(presetId);
            useUIStore.getState().setStatusMessage(`New ${preset.name} project`, false, 2000);
          } catch (err) {
            console.error('[NewSongWizard] Template load failed:', err);
            useUIStore.getState().setStatusMessage('Template load failed — using blank project', true, 3000);
            // Fallback: create blank song
            useTabsStore.getState().addTab();
            if (presetId) useTrackerStore.getState().applySystemPreset(presetId);
          }
        })();
        return;
      }

      // Standard non-template flow
      useTabsStore.getState().addTab();
      queueMicrotask(() => {
        if (mode === 'preset' && presetId) {
          useTrackerStore.getState().applySystemPreset(presetId);
          if (AMIGA_UADE_PRESET_IDS.has(presetId)) {
            useTrackerStore.getState().applyAmigaSongSettings(presetId);
          }
        }
        if (mode === 'preset' && loadInstruments && presetId) {
          const presets = getInstrumentPresetsForSystem(presetId);
          presets.forEach((inst) => useInstrumentStore.getState().createInstrument(inst));
        }
        useUIStore.getState().setActiveSystemPreset(mode === 'preset' ? presetId : null);
        useUIStore.getState().setStatusMessage('New project', false, 1500);
      });
      setStep(1);
      setStartMode('empty');
      setSelectedPresetId('amiga_protracker');
      setWithPresetInstruments(true);
      setFilter('');
      setScrollY(0);
      close();
    },
    [selectedPresetId, close],
  );

  // Screen dimensions — safe access for app.screen getter
  let screenW = 1920, screenH = 1080;
  try { if (app?.screen) { screenW = app.screen.width ?? 1920; screenH = app.screen.height ?? 1080; } } catch { /* renderer not ready */ }

  const drawOverlay = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, screenW, screenH);
    g.fill({ color: theme.bg.color, alpha: 0.7 });
  }, [screenW, screenH]);

  const handleOverlayClick = useCallback(() => {
    // inline cancel logic — can't call handleCancel (defined after early return)
    setStep(1); setStartMode('empty'); setSelectedPresetId('amiga_protracker');
    setWithPresetInstruments(true); setFilter(''); setScrollY(0); close();
  }, [close]);

  const handlePanelClick = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
  }, []);

  const blockWheel = useCallback((e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  const selectedPreset: SystemPreset | undefined = SYSTEM_PRESETS.find((p) => p.id === selectedPresetId);
  const hasStarterInstruments = (getInstrumentPresetsForSystem(selectedPresetId).length) > 0;
  const starterInstruments = getInstrumentPresetsForSystem(selectedPresetId);

  const handleNext = () => {
    if (step === 1) {
      if (startMode === 'empty') { finish('empty', false); } else { setStep(2); }
    } else if (step === 2) {
      if (hasStarterInstruments) { setStep(3); } else { finish('preset', false); }
    }
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleCancel = () => {
    setStep(1); setStartMode('empty'); setSelectedPresetId('amiga_protracker');
    setWithPresetInstruments(true); setFilter(''); setScrollY(0); close();
  };

  const handleFinish = () => { finish('preset', withPresetInstruments); };

  const stepCount = startMode === 'preset' ? (hasStarterInstruments ? 3 : 2) : 1;
  const nextLabel = step === 1 ? 'Next' : step === 2 ? (hasStarterInstruments ? 'Next' : 'Finish') : 'Finish';

  return (
    <pixiContainer layout={{ position: 'absolute', width: '100%', height: '100%' }}>
      <pixiGraphics
        draw={drawOverlay}
        eventMode="static"
        onPointerUp={handleOverlayClick}
        onWheel={blockWheel}
        layout={{ position: 'absolute', width: screenW, height: screenH }}
      />

      <layoutContainer
        eventMode="static"
        onPointerDown={handlePanelClick}
        onPointerUp={handlePanelClick}
        layout={{
          position: 'absolute',
          left: Math.round((screenW - MODAL_W) / 2),
          top: Math.round((screenH - MODAL_H) / 2),
          width: MODAL_W,
          height: MODAL_H,
          flexDirection: 'column',
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Header — DOM: px-5 py-4 border-b */}
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 16,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <layoutContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <pixiBitmapText
              text="New Song"
              style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 16, fill: 0xffffff }}
              tint={theme.text.color}
              layout={{}}
            />
            <pixiBitmapText
              text={`Step ${step} of ${stepCount}`}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
          <layoutContainer
            eventMode="static"
            cursor="pointer"
            onPointerUp={handleCancel}
            layout={{
              width: 24,
              height: 24,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <PixiIcon name="close" size={16} color={theme.textMuted.color} layout={{}} />
          </layoutContainer>
        </layoutContainer>

        {/* Body */}
        <layoutContainer layout={{ flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
          {step === 1 && (
            <GlStep1 startMode={startMode} onSelectMode={setStartMode} />
          )}
          {step === 2 && (
            <GlStep2
              selectedPresetId={selectedPresetId}
              onSelectPreset={setSelectedPresetId}
              filter={filter}
              onFilterChange={setFilter}
              scrollY={scrollY}
              onScrollY={setScrollY}
            />
          )}
          {step === 3 && (
            <GlStep3
              presetName={selectedPreset?.name ?? ''}
              instruments={starterInstruments.map((i) => i.name ?? '')}
              withInstruments={withPresetInstruments}
              onToggle={setWithPresetInstruments}
            />
          )}
        </layoutContainer>

        {/* Footer — DOM: px-5 py-3 border-t justify-between */}
        <layoutContainer
          layout={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
            borderTopWidth: 1,
            borderColor: theme.border.color,
          }}
        >
          <PixiButton label="Cancel" variant="ghost" size="sm" onClick={handleCancel} />
          <layoutContainer layout={{ flexDirection: 'row', gap: 8 }}>
            {step > 1 && <PixiButton label="Back" variant="ghost" size="sm" onClick={handleBack} />}
            <PixiButton
              label={nextLabel}
              variant="primary"
              size="sm"
              onClick={step === 3 ? handleFinish : handleNext}
            />
          </layoutContainer>
        </layoutContainer>
      </layoutContainer>
    </pixiContainer>
  );
};

/* ─────────────────── Step 1: Start From ─────────────────── */

const GlStep1: React.FC<{ startMode: StartMode; onSelectMode: (m: StartMode) => void }> = ({
  startMode, onSelectMode,
}) => {
  return (
    <Div className="flex-col gap-4 p-6">
      <Txt className="text-sm text-text-muted">How do you want to start?</Txt>
      <Div className="flex-row gap-4">
        <OptionCard
          title="Empty Song"
          description="4 blank channels, default BPM"
          selected={startMode === 'empty'}
          onClick={() => onSelectMode('empty')}
        />
        <OptionCard
          title="System Preset"
          description="Hardware-specific channels and format"
          selected={startMode === 'preset'}
          onClick={() => onSelectMode('preset')}
        />
      </Div>
    </Div>
  );
};

/* ─────────────────── Step 2: Preset Browser ─────────────── */

interface GlStep2Props {
  selectedPresetId: string;
  onSelectPreset: (id: string) => void;
  filter: string;
  onFilterChange: (v: string) => void;
  scrollY: number;
  onScrollY: (y: number) => void;
}

const LIST_W = 256; // DOM: w-64 = 256px
const ITEM_H = 28;  // DOM: py-2 = ~28px
const HEADER_H = 24; // DOM: py-1.5 = ~24px

const GlStep2: React.FC<GlStep2Props> = ({
  selectedPresetId, onSelectPreset, filter, onFilterChange,
}) => {
  const theme = usePixiTheme();
  const selected = SYSTEM_PRESETS.find((p) => p.id === selectedPresetId);
  const hasPresetInstruments = (getInstrumentPresetsForSystem(selectedPresetId).length) > 0;
  const [scrollY, setScrollY] = useState(0);

  const filteredGroups = useMemo(() => {
    const sorted = GROUPED_PRESETS.map((group) => ({
      ...group,
      presets: [...group.presets].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    if (!filter.trim()) return sorted;
    const q = filter.toLowerCase();
    return sorted
      .map((group) => ({
        ...group,
        presets: group.presets.filter(
          (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || group.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.presets.length > 0);
  }, [filter]);

  const flatItems = useMemo(() => {
    const items: Array<{ type: 'header'; label: string } | { type: 'item'; preset: SystemPreset }> = [];
    for (const group of filteredGroups) {
      items.push({ type: 'header', label: group.label });
      for (const preset of group.presets) {
        items.push({ type: 'item', preset });
      }
    }
    return items;
  }, [filteredGroups]);

  const totalHeight = flatItems.reduce((h, item) => h + (item.type === 'header' ? HEADER_H : ITEM_H), 0);
  const listHeight = MODAL_H - 52 - 44 - 36; // header + footer + search
  const maxScroll = Math.max(0, totalHeight - listHeight);

  const handleWheel = (e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY((y) => Math.max(0, Math.min(maxScroll, y + e.deltaY)));
  };

  return (
    <Div className="flex-row flex-1" layout={{ minHeight: 0 }}>
      {/* Left: Search + list — DOM: w-64 border-r */}
      <Div className="flex-col" layout={{
        width: LIST_W, borderRightWidth: 1, borderColor: theme.border.color, overflow: 'hidden',
      }}>
        {/* Search input — DOM: px-2 py-2 border-b */}
        <Div className="px-2 py-2" layout={{ borderBottomWidth: 1, borderColor: theme.border.color }}>
          <PixiPureTextInput
            value={filter}
            onChange={onFilterChange}
            placeholder="Filter presets..."
            width={LIST_W - 16}
            height={26}
            fontSize={12}
            font="sans"
          />
        </Div>

        {/* Scrollable preset list */}
        <Div
          className="flex-1 flex-col"
          layout={{ overflow: 'hidden' }}
          eventMode="static"
          onWheel={handleWheel as any}
        >
          <pixiContainer layout={{ position: 'absolute', top: -scrollY, width: LIST_W }}>
            {flatItems.map((item, _i) => {
              if (item.type === 'header') {
                return (
                  <Div
                    key={`h-${item.label}`}
                    className="px-3 items-center"
                    layout={{
                      width: LIST_W,
                      height: HEADER_H,
                      backgroundColor: theme.bg.color,
                      borderBottomWidth: 1,
                      borderColor: theme.border.color,
                    }}
                  >
                    <Txt className="text-[10px] font-bold text-text-muted uppercase">{item.label}</Txt>
                  </Div>
                );
              }
              const isSelected = selectedPresetId === item.preset.id;
              return (
                <Div
                  key={item.preset.id}
                  className="px-3 items-center"
                  layout={{
                    width: LIST_W,
                    height: ITEM_H,
                    backgroundColor: isSelected ? theme.accent.color : undefined,
                    borderLeftWidth: isSelected ? 2 : 0,
                    borderColor: isSelected ? theme.accent.color : undefined,
                  }}
                  alpha={isSelected ? 1 : 0.8}
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={() => onSelectPreset(item.preset.id)}
                >
                  <Txt className={isSelected ? 'text-xs text-text-primary' : 'text-xs text-text-muted'}>
                    {item.preset.name}
                  </Txt>
                </Div>
              );
            })}
          </pixiContainer>
          {filteredGroups.length === 0 && (
            <Div className="flex-1 justify-center items-center">
              <Txt className="text-xs text-text-muted">No matches</Txt>
            </Div>
          )}
        </Div>
      </Div>

      {/* Right: Preset details — DOM: p-5 overflow-y-auto */}
      <Div className="flex-1 flex-col p-5 gap-4" layout={{ overflow: 'scroll' }}>
        {selected ? (
          <>
            <Div className="flex-col gap-1">
              <Txt className="text-sm font-semibold text-text-primary">{selected.name}</Txt>
              {selected.description && (
                <Txt className="text-xs text-text-muted">{selected.description}</Txt>
              )}
            </Div>

            {/* Stats row — DOM: grid grid-cols-2 gap-3 */}
            <Div className="flex-row gap-3">
              <InfoBox label="Channels" value={String(selected.channels)} />
              <InfoBox label="BPM" value={String(selected.defaultBpm ?? 125)} />
            </Div>

            {/* Native format badge */}
            {selected.templateFile && (
              <Div className="flex-row items-center gap-2 p-2 rounded" layout={{
                backgroundColor: 0x1a3a1a, borderWidth: 1, borderColor: 0x2a6a2a, borderRadius: 4,
              }}>
                <PixiIcon name="diskio" size={12} color={0x4ade80} layout={{}} />
                <Txt className="text-[11px] text-accent-success">
                  Native format — creates editable file you can export
                </Txt>
              </Div>
            )}

            {/* Compatible synths — DOM: bg-dark-bg rounded p-3 border */}
            {selected.compatibleSynthTypes && selected.compatibleSynthTypes.length > 0 && (
              <Div className="flex-col gap-2 p-3 rounded" layout={{
                backgroundColor: theme.bg.color, borderWidth: 1, borderColor: theme.border.color,
              }}>
                <Txt className="text-xs text-text-muted">Compatible Synths</Txt>
                <Div className="flex-row flex-wrap gap-1">
                  {selected.compatibleSynthTypes.map((t) => (
                    <Div key={t} className="px-2 py-0.5 rounded" layout={{
                      backgroundColor: theme.accent.color, borderRadius: 3,
                    }}>
                      <Txt className="text-[11px] text-accent-primary">{t}</Txt>
                    </Div>
                  ))}
                </Div>
              </Div>
            )}

            {/* Channel layout — DOM: space-y-1 */}
            {selected.channelDefs.length > 0 && (
              <Div className="flex-col gap-1">
                <Txt className="text-xs text-text-muted">Channel Layout</Txt>
                {selected.channelDefs.map((ch, i) => (
                  <Div
                    key={i}
                    className="flex-row items-center gap-2 py-1 px-2 rounded"
                    layout={{
                      backgroundColor: theme.bg.color,
                      borderWidth: 1,
                      borderColor: theme.border.color,
                      borderRadius: 4,
                    }}
                  >
                    <Txt className="text-xs text-text-muted" layout={{ width: 24 }}>
                      {String(i + 1)}
                    </Txt>
                    <Txt className="text-xs text-text-primary">{ch.name}</Txt>
                    <Div className="flex-1" />
                    <Txt className="text-xs font-mono text-text-muted">{ch.shortName}</Txt>
                  </Div>
                ))}
              </Div>
            )}

            {/* Starter instruments indicator */}
            {hasPresetInstruments && (
              <Div className="flex-row items-center gap-2 p-3 rounded" layout={{
                backgroundColor: theme.accent.color, borderRadius: 4, borderWidth: 1, borderColor: theme.accent.color,
              }}>
                <Txt className="text-xs text-accent-primary">
                  {`Includes ${getInstrumentPresetsForSystem(selectedPresetId).length} starter instruments`}
                </Txt>
              </Div>
            )}
          </>
        ) : (
          <Div className="flex-1 justify-center items-center">
            <Txt className="text-sm text-text-muted">Select a preset</Txt>
          </Div>
        )}
      </Div>
    </Div>
  );
};

/* ─────────────────── Step 3: Starter Instruments ────────── */

interface GlStep3Props {
  presetName: string;
  instruments: string[];
  withInstruments: boolean;
  onToggle: (v: boolean) => void;
}

const GlStep3: React.FC<GlStep3Props> = ({ presetName, instruments, withInstruments, onToggle }) => {
  const theme = usePixiTheme();
  return (
    <Div className="flex-col gap-4 p-6">
      {/* DOM: text-sm, with <span> font-medium for preset name */}
      <Div className="flex-row gap-1">
        <Txt className="text-sm font-medium text-text-primary">{presetName}</Txt>
        <Txt className="text-sm text-text-muted"> includes starter instruments.</Txt>
      </Div>

      {/* DOM: grid grid-cols-2 gap-4 */}
      <Div className="flex-row gap-4">
        <OptionCard
          title="Load Preset Instruments"
          description={`Add ${instruments.length} named instruments ready to use`}
          selected={withInstruments}
          onClick={() => onToggle(true)}
        />
        <OptionCard
          title="Start Empty"
          description="No instruments — add your own"
          selected={!withInstruments}
          onClick={() => onToggle(false)}
        />
      </Div>

      {/* DOM: grid grid-cols-2 gap-1 */}
      {withInstruments && instruments.length > 0 && (
        <Div className="flex-col gap-1">
          <Txt className="text-xs text-text-muted">Instruments to be added:</Txt>
          <Div className="flex-row flex-wrap gap-1">
            {instruments.map((name, i) => (
              <Div key={i} className="flex-row items-center gap-2 px-2 py-1 rounded" layout={{
                backgroundColor: theme.bg.color, borderWidth: 1, borderColor: theme.border.color, borderRadius: 4,
              }}>
                <Txt className="text-xs font-mono text-text-muted">{String(i + 1).padStart(2, '0')}</Txt>
                <Txt className="text-xs text-text-primary">{name}</Txt>
              </Div>
            ))}
          </Div>
        </Div>
      )}
    </Div>
  );
};

/* ─────────────────── Shared: OptionCard ─────────────────── */

const OptionCard: React.FC<{
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}> = ({ title, description, selected, onClick }) => {
  const theme = usePixiTheme();
  return (
    <Div
      className="flex-1 flex-col items-center justify-center gap-3 p-6"
      layout={{
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.accent.color : theme.border.color,
        borderRadius: 8,
        backgroundColor: selected ? theme.accent.color : theme.bg.color,
      }}
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      alpha={selected ? 1 : 0.8}
    >
      <Txt className={selected ? 'text-sm font-semibold text-text-primary' : 'text-sm font-semibold text-text-secondary'}>
        {title}
      </Txt>
      <Txt className="text-xs text-text-muted">{description}</Txt>
    </Div>
  );
};

/* ─────────────────── Shared: InfoBox ────────────────────── */

const InfoBox: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const theme = usePixiTheme();
  return (
    <Div className="flex-col p-3 rounded" layout={{
      backgroundColor: theme.bg.color, borderWidth: 1, borderColor: theme.border.color, borderRadius: 4, flex: 1,
    }}>
      <Txt className="text-xs text-text-muted">{label}</Txt>
      <Txt className="text-xs font-semibold text-text-primary">{value}</Txt>
    </Div>
  );
};
