/**
 * WebGLModalBridge — Lazily renders DOM modals in WebGL mode.
 *
 * In WebGL mode, the main App.tsx returns early with just <PixiApp />,
 * so none of the DOM modals (Settings, FileBrowser, Help, etc.) get mounted.
 * This bridge subscribes to useUIStore and lazily renders the needed modals
 * as DOM overlays on top of the WebGL canvas.
 *
 * All modals render null when inactive, so there's zero cost when idle.
 */

import { lazy, Suspense, useCallback, useEffect } from 'react';
import { useUIStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { notify } from '@stores/useNotificationStore';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@/types/instrument';

const LazySettingsModal = lazy(() =>
  import('@/components/dialogs/SettingsModal').then(m => ({ default: m.SettingsModal }))
);
const LazyFileBrowser = lazy(() =>
  import('@/components/dialogs/FileBrowser').then(m => ({ default: m.FileBrowser }))
);
const LazyHelpModal = lazy(() =>
  import('@/components/help/HelpModal').then(m => ({ default: m.HelpModal }))
);
const LazyExportDialog = lazy(() =>
  import('@/lib/export/ExportDialog').then(m => ({ default: m.ExportDialog }))
);
const LazyEditInstrumentModal = lazy(() =>
  import('@/components/instruments/EditInstrumentModal').then(m => ({ default: m.EditInstrumentModal }))
);
const LazyMasterEffectsModal = lazy(() =>
  import('@/components/effects').then(m => ({ default: m.MasterEffectsModal }))
);
const LazyInstrumentEffectsModal = lazy(() =>
  import('@/components/effects').then(m => ({ default: m.InstrumentEffectsModal }))
);
const LazyDrumpadEditorModal = lazy(() =>
  import('@/components/midi/DrumpadEditorModal').then(m => ({ default: m.DrumpadEditorModal }))
);
const LazyTipOfTheDay = lazy(() =>
  import('@/components/dialogs/TipOfTheDay').then(m => ({ default: m.TipOfTheDay }))
);
const LazyAuthModal = lazy(() =>
  import('@/components/dialogs/AuthModal').then(m => ({ default: m.AuthModal }))
);
const LazyTD3PatternDialog = lazy(() =>
  import('@/components/midi/TD3PatternDialog').then(m => ({ default: m.TD3PatternDialog }))
);
const LazySamplePackBrowser = lazy(() =>
  import('@/components/instruments/SamplePackBrowser').then(m => ({ default: m.SamplePackBrowser }))
);
const LazyPatternOrderModal = lazy(() =>
  import('@/components/dialogs/PatternOrderModal').then(m => ({ default: m.PatternOrderModal }))
);
const LazyRevisionBrowserDialog = lazy(() =>
  import('@/components/dialogs/RevisionBrowserDialog').then(m => ({ default: m.RevisionBrowserDialog }))
);
const LazyGrooveSettingsModal = lazy(() =>
  import('@/components/dialogs/GrooveSettingsModal').then(m => ({ default: m.GrooveSettingsModal }))
);
const LazyInterpolateDialog = lazy(() =>
  import('@/components/dialogs/InterpolateDialog').then(m => ({ default: m.InterpolateDialog }))
);
const LazyHumanizeDialog = lazy(() =>
  import('@/components/dialogs/HumanizeDialog').then(m => ({ default: m.HumanizeDialog }))
);
const LazyFindReplaceDialog = lazy(() =>
  import('@/components/dialogs/FindReplaceDialog').then(m => ({ default: m.FindReplaceDialog }))
);
const LazyScaleVolumeDialog = lazy(() =>
  import('@/components/tracker/ScaleVolumeDialog').then(m => ({ default: m.ScaleVolumeDialog }))
);
const LazyKeyboardShortcutSheet = lazy(() =>
  import('@/components/tracker/KeyboardShortcutSheet').then(m => ({ default: m.KeyboardShortcutSheet }))
);
const LazyDrumPadManager = lazy(() =>
  import('@/components/drumpad/DrumPadManager').then(m => ({ default: m.DrumPadManager }))
);

export const WebGLModalBridge: React.FC = () => {
  const modalOpen = useUIStore(s => s.modalOpen);
  const modalData = useUIStore(s => s.modalData);
  const closeModal = useUIStore(s => s.closeModal);
  const showFileBrowser = useUIStore(s => s.showFileBrowser);
  const setShowFileBrowser = useUIStore(s => s.setShowFileBrowser);
  const showSamplePackModal = useUIStore(s => s.showSamplePackModal);
  const setShowSamplePackModal = useUIStore(s => s.setShowSamplePackModal);
  const dialogOpen = useUIStore(s => s.dialogOpen);
  const closeDialogCommand = useUIStore(s => s.closeDialogCommand);
  const openModal = useUIStore(s => s.openModal);
  const activeView = useUIStore(s => s.activeView);
  const showTD3Pattern = useMIDIStore(s => s.showPatternDialog);
  const closePatternDialog = useMIDIStore(s => s.closePatternDialog);

  // Bridge dialogOpen commands (from keyboard shortcuts) to modalOpen state.
  // In DOM mode, TrackerView handles this. In WebGL mode, this bridge does it.
  useEffect(() => {
    if (!dialogOpen) return;
    switch (dialogOpen) {
      case 'interpolate-volume':
      case 'interpolate-effect':
        openModal('interpolate');
        break;
      case 'humanize':
        openModal('humanize');
        break;
      case 'find-replace':
        openModal('findReplace');
        break;
      case 'groove-settings':
        openModal('grooveSettings');
        break;
      case 'scale-volume-block':
        openModal('scaleVolume', { scope: 'block' });
        break;
      case 'scale-volume-track':
        openModal('scaleVolume', { scope: 'track' });
        break;
      case 'scale-volume-pattern':
        openModal('scaleVolume', { scope: 'pattern' });
        break;
      case 'keyboard-help':
        openModal('shortcutSheet');
        break;
      case 'tempo-tap':
        // Tap tempo is handled inline, no modal needed
        break;
    }
    closeDialogCommand();
  }, [dialogOpen, closeDialogCommand, openModal]);

  const handleScaleVolumeConfirm = useCallback((factor: number) => {
    const scope = (useUIStore.getState().modalData?.scope as 'block' | 'track' | 'pattern') || 'block';
    useTrackerStore.getState().scaleVolume(scope, factor);
    closeModal();
  }, [closeModal]);

  const handleFileBrowserLoad = useCallback(async (data: any, filename: string) => {
    setShowFileBrowser(false);
    const { loadPatterns, setCurrentPattern } = useTrackerStore.getState();
    const { addInstrument } = useInstrumentStore.getState();

    try {
      if (data.patterns) {
        loadPatterns(data.patterns);
        if (data.patterns.length > 0) {
          setCurrentPattern(0);
        }
      }
      if (data.instruments && Array.isArray(data.instruments)) {
        data.instruments.forEach((inst: InstrumentConfig) => addInstrument(inst));
      }
      notify.success(`Loaded: ${filename}`);
    } catch (error) {
      console.error('Failed to load project:', error);
      notify.error('Failed to load project');
    }
  }, [setShowFileBrowser]);

  const handleLoadTrackerModule = useCallback(async (buffer: ArrayBuffer, filename: string) => {
    const { isPlaying, stop } = useTransportStore.getState();
    const engine = getToneEngine();
    if (isPlaying) { stop(); engine.releaseAll(); }

    try {
      const lower = filename.toLowerCase();
      if (lower.endsWith('.sqs') || lower.endsWith('.seq')) {
        const { parseTD3File } = await import('@lib/import/TD3PatternLoader');
        const { td3StepsToTrackerCells } = await import('@/midi/sysex/TD3PatternTranslator');
        const { loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
        const { reset: resetInstruments, addInstrument: addInst } = useInstrumentStore.getState();
        const { reset: resetTransport } = useTransportStore.getState();

        const td3File = await parseTD3File(buffer);
        if (td3File.patterns.length === 0) {
          notify.error('No patterns found in file');
          return;
        }

        useAutomationStore.getState().reset();
        resetTransport();
        resetInstruments();
        getToneEngine().disposeAllInstruments();

        const { createDefaultTB303Instrument } = await import('@lib/instrumentFactory');
        const tb303Instrument = createDefaultTB303Instrument();
        addInst(tb303Instrument);
        const instrumentIndex = 1;

        const importedPatterns = td3File.patterns.map((td3Pattern, idx) => {
          const cells = td3StepsToTrackerCells(td3Pattern.steps, 2);
          const patternLength = td3Pattern.length || 16;
          const patternId = `td3-${Date.now()}-${idx}`;
          return {
            id: patternId,
            name: td3Pattern.name || `TD-3 Pattern ${idx + 1}`,
            length: patternLength,
            channels: [{
              id: `ch-${tb303Instrument.id}-${idx}`,
              name: 'TB-303',
              muted: false,
              solo: false,
              collapsed: false,
              volume: 100,
              pan: 0,
              instrumentId: tb303Instrument.id,
              color: '#ec4899',
              rows: cells.slice(0, patternLength).map(cell => ({
                ...cell,
                instrument: cell.note ? instrumentIndex : 0,
              })),
            }],
          };
        });

        loadPatterns(importedPatterns);
        setCurrentPattern(0);
        setPatternOrder(importedPatterns.map((_, i) => i));
        notify.success(`Imported ${importedPatterns.length} TD-3 pattern(s)`);
      } else if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
        const { importMIDIFile } = await import('@lib/import/MIDIImporter');
        const result = await importMIDIFile(new File([buffer], filename), { mergeChannels: true });
        if (result.patterns.length === 0) {
          notify.error('No patterns found in MIDI file');
          return;
        }
        const { loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
        const { setBPM, reset: resetTransport } = useTransportStore.getState();
        const { reset: resetInstruments, loadInstruments } = useInstrumentStore.getState();
        resetTransport();
        resetInstruments();
        getToneEngine().disposeAllInstruments();
        if (result.instruments.length > 0) {
          loadInstruments(result.instruments);
        }
        loadPatterns(result.patterns);
        setPatternOrder(result.patterns.map((_: unknown, i: number) => i));
        setCurrentPattern(0);
        setBPM(result.bpm);
        notify.success(`Imported: ${result.metadata.name} — ${result.instruments.length} instrument(s), BPM: ${result.bpm}`);
      } else {
        const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
        const song = await parseModuleToSong(new File([buffer], filename));

        const { loadPatterns, setCurrentPattern, setPatternOrder } = useTrackerStore.getState();
        const { addInstrument } = useInstrumentStore.getState();

        song.instruments.forEach((inst: InstrumentConfig) => addInstrument(inst));
        loadPatterns(song.patterns);
        setCurrentPattern(0);
        if (song.songPositions.length > 0) setPatternOrder(song.songPositions);

        notify.success(`Imported ${filename}: ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
      }
    } catch (error) {
      console.error('Failed to load tracker module:', error);
      notify.error('Failed to load file');
    }
  }, []);

  return (
    <Suspense fallback={null}>
      {modalOpen === 'settings' && (
        <LazySettingsModal onClose={closeModal} />
      )}
      {modalOpen === 'help' && (
        <LazyHelpModal isOpen={true} onClose={closeModal} initialTab={(modalData?.initialTab as any) || 'shortcuts'} />
      )}
      {modalOpen === 'export' && (
        <LazyExportDialog isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'instruments' && (
        <LazyEditInstrumentModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'masterFx' && (
        <LazyMasterEffectsModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'instrumentFx' && (
        <LazyInstrumentEffectsModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'drumpads' && (
        <LazyDrumpadEditorModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'tips' && (
        <LazyTipOfTheDay isOpen={true} onClose={closeModal} initialTab={(modalData?.initialTab as 'tips' | 'changelog') || 'tips'} />
      )}
      {modalOpen === 'auth' && (
        <LazyAuthModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'patternOrder' && (
        <LazyPatternOrderModal onClose={closeModal} />
      )}
      {modalOpen === 'revisions' && (
        <LazyRevisionBrowserDialog isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'grooveSettings' && (
        <LazyGrooveSettingsModal onClose={closeModal} />
      )}
      {modalOpen === 'interpolate' && (
        <LazyInterpolateDialog isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'humanize' && (
        <LazyHumanizeDialog isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'findReplace' && (
        <LazyFindReplaceDialog isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'scaleVolume' && (
        <LazyScaleVolumeDialog
          scope={(modalData?.scope as 'block' | 'track' | 'pattern') || 'block'}
          onConfirm={handleScaleVolumeConfirm}
          onCancel={closeModal}
        />
      )}
      {modalOpen === 'shortcutSheet' && (
        <LazyKeyboardShortcutSheet isOpen={true} onClose={closeModal} />
      )}
      {showFileBrowser && (
        <LazyFileBrowser
          isOpen={showFileBrowser}
          onClose={() => setShowFileBrowser(false)}
          mode="load"
          onLoad={handleFileBrowserLoad}
          onLoadTrackerModule={handleLoadTrackerModule}
        />
      )}
      {showTD3Pattern && (
        <LazyTD3PatternDialog isOpen={showTD3Pattern} onClose={closePatternDialog} />
      )}
      {showSamplePackModal && (
        <LazySamplePackBrowser onClose={() => setShowSamplePackModal(false)} />
      )}
      {activeView === 'drumpad' && (
        <LazyDrumPadManager />
      )}
    </Suspense>
  );
};
