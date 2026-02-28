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

import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '@stores';
import { useTrackerStore } from '@stores';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { notify } from '@stores/useNotificationStore';
import { getToneEngine } from '@engine/ToneEngine';
import type { InstrumentConfig } from '@/types/instrument';
import type { ModuleInfo } from '@/lib/import/ModuleLoader';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';

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
const LazyAdvancedEditModal = lazy(() =>
  import('@/components/dialogs/AdvancedEditModal').then(m => ({ default: m.AdvancedEditModal }))
);
const LazyFadeVolumeDialog = lazy(() =>
  import('@/components/tracker/FadeVolumeDialog').then(m => ({ default: m.FadeVolumeDialog }))
);
const LazyStrumDialog = lazy(() =>
  import('@/components/dialogs/StrumDialog').then(m => ({ default: m.StrumDialog }))
);
const LazyEffectPicker = lazy(() =>
  import('@/components/tracker/EffectPicker').then(m => ({ default: m.EffectPicker }))
);
const LazyUndoHistoryPanel = lazy(() =>
  import('@/components/tracker/UndoHistoryPanel').then(m => ({ default: m.UndoHistoryPanel }))
);
const LazyPatternMatrix = lazy(() =>
  import('@/components/tracker/PatternMatrix').then(m => ({ default: m.PatternMatrix }))
);
const LazyAutomationPanel = lazy(() =>
  import('@/components/automation/AutomationPanel').then(m => ({ default: m.AutomationPanel }))
);
const LazySynthErrorDialog = lazy(() =>
  import('@/components/ui/SynthErrorDialog').then(m => ({ default: m.SynthErrorDialog }))
);
const LazyRomUploadDialog = lazy(() =>
  import('@/components/ui/RomUploadDialog').then(m => ({ default: m.RomUploadDialog }))
);
const LazyCollaborationModal = lazy(() =>
  import('@/components/collaboration/CollaborationModal').then(m => ({ default: m.CollaborationModal }))
);
const LazyDownloadModal = lazy(() =>
  import('@/components/dialogs/DownloadModal').then(m => ({ default: m.DownloadModal }))
);
const LazyImportModuleDialog = lazy(() =>
  import('@/components/dialogs/ImportModuleDialog').then(m => ({ default: m.ImportModuleDialog }))
);
const LazyImportFurnaceDialog = lazy(() =>
  import('@/components/dialogs/ImportFurnaceDialog').then(m => ({ default: m.ImportFurnaceDialog }))
);
const LazyImportMIDIDialog = lazy(() =>
  import('@/components/dialogs/ImportMIDIDialog').then(m => ({ default: m.ImportMIDIDialog }))
);
const LazyImportAudioDialog = lazy(() =>
  import('@/components/dialogs/ImportAudioDialog').then(m => ({ default: m.ImportAudioDialog }))
);
const LazyImportTD3Dialog = lazy(() =>
  import('@/components/dialogs/ImportTD3Dialog').then(m => ({ default: m.ImportTD3Dialog }))
);
const LazySunVoxImportDialog = lazy(() =>
  import('@/components/instruments/SunVoxImportDialog').then(m => ({ default: m.SunVoxImportDialog }))
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
  const pendingModuleFile = useUIStore(s => s.pendingModuleFile);
  const setPendingModuleFile = useUIStore(s => s.setPendingModuleFile);
  const pendingAudioFile = useUIStore(s => s.pendingAudioFile);
  const setPendingAudioFile = useUIStore(s => s.setPendingAudioFile);
  const pendingTD3File = useUIStore(s => s.pendingTD3File);
  const setPendingTD3File = useUIStore(s => s.setPendingTD3File);
  const pendingSunVoxFile = useUIStore(s => s.pendingSunVoxFile);
  const setPendingSunVoxFile = useUIStore(s => s.setPendingSunVoxFile);

  // Portal container on document.body — ensures modals render above
  // PixiDOMOverlay divs (z-index 10) which are also direct body children.
  // Without this, modals inside the React root div sit at stacking layer 0,
  // below the PixiDOMOverlay divs.
  const portalRef = useRef<HTMLDivElement | null>(null);
  if (!portalRef.current) {
    const div = document.createElement('div');
    div.id = 'webgl-modal-portal';
    div.style.position = 'relative';
    div.style.zIndex = '100';
    document.body.appendChild(div);
    portalRef.current = div;
  }
  useEffect(() => {
    return () => {
      portalRef.current?.remove();
      portalRef.current = null;
    };
  }, []);

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
      case 'advanced-edit':
        openModal('advancedEdit');
        break;
      case 'fade-volume':
        openModal('fadeVolume');
        break;
      case 'strum':
        openModal('strum');
        break;
      case 'effect-picker':
        openModal('effectPicker');
        break;
      case 'undo-history':
        openModal('undoHistory');
        break;
      case 'pattern-matrix':
        openModal('patternMatrix');
        break;
      case 'automation':
        openModal('automation');
        break;
      case 'collaboration':
        openModal('collaboration');
        break;
      case 'randomize':
        openModal('randomize');
        break;
      case 'acid-pattern':
        openModal('acidPattern');
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

  // Handler for ImportTD3Dialog in GL mode
  const handleTD3ImportGL = useCallback(async (file: File, replacePatterns: boolean) => {
    setPendingTD3File(null);
    try {
      const { loadFile } = await import('@lib/file/UnifiedFileLoader');
      const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
      if (result.success === true) notify.success(result.message);
      else if (result.success === false) notify.error(result.error);
    } catch (err) {
      notify.error('Failed to import TD-3 file');
      console.error('[WebGLModalBridge] TD-3 import failed:', err);
    }
  }, [setPendingTD3File]);

  // Handler for SunVoxImportDialog in GL mode
  const handleSunVoxImportGL = useCallback(async (name: string, config: import('@/types/instrument').SunVoxConfig) => {
    const file = pendingSunVoxFile;
    setPendingSunVoxFile(null);
    try {
      if (config.isSong && file) {
        // Full module extraction — one SunVoxSynth per module + tracker channels
        const { loadFile } = await import('@lib/file/UnifiedFileLoader');
        const result = await loadFile(file, { requireConfirmation: false });
        if (result.success === true) notify.success(result.message);
        else if (result.success === false) notify.error(result.error);
      } else {
        useInstrumentStore.getState().createInstrument({ name, synthType: 'SunVoxSynth', sunvox: config });
        notify.success(`Imported SunVox patch: ${name}`);
      }
    } catch (err) {
      notify.error('Failed to import SunVox file');
      console.error('[WebGLModalBridge] SunVox import failed:', err);
    }
  }, [pendingSunVoxFile, setPendingSunVoxFile]);

  // Handler for ImportModuleDialog in GL mode — called when user confirms import.
  // Uses UnifiedFileLoader to keep behaviour identical to the DOM mode confirm path.
  const handleModuleImportGL = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    setPendingModuleFile(null);
    try {
      const { loadFile } = await import('@lib/file/UnifiedFileLoader');
      const result = await loadFile(info.file, {
        subsong: options.subsong,
        uadeMetadata: options.uadeMetadata,
        midiOptions: options.midiOptions,
      });
      if (result.success === true) {
        notify.success(result.message);
      } else if (result.success === false) {
        notify.error(result.error);
      }
    } catch (error) {
      console.error('[WebGLModalBridge] Module import failed:', error);
      notify.error('Failed to import file');
    }
  }, [setPendingModuleFile]);

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
        useTrackerStore.getState().applyEditorMode(song);

        notify.success(`Imported ${filename}: ${song.patterns.length} patterns, ${song.instruments.length} instruments`);
      }
    } catch (error) {
      console.error('Failed to load tracker module:', error);
      notify.error('Failed to load file');
    }
  }, []);

  return createPortal(
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
      {modalOpen === 'fileBrowser' && (
        <LazyFileBrowser
          isOpen={true}
          onClose={closeModal}
          mode="load"
          onLoad={handleFileBrowserLoad}
          onLoadTrackerModule={handleLoadTrackerModule}
        />
      )}
      {modalOpen === 'midi-pads' && (
        <LazyDrumpadEditorModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'advancedEdit' && (
        <LazyAdvancedEditModal
          onClose={closeModal}
          onShowScaleVolume={(scope) => openModal('scaleVolume', { scope })}
          onShowFadeVolume={(scope) => openModal('fadeVolume', { scope })}
        />
      )}
      {modalOpen === 'fadeVolume' && (
        <LazyFadeVolumeDialog
          scope={(modalData?.scope as 'block' | 'track' | 'pattern') || 'block'}
          onConfirm={(startVol, endVol) => {
            useTrackerStore.getState().fadeVolume(
              (useUIStore.getState().modalData?.scope as 'block' | 'track' | 'pattern') || 'block',
              startVol,
              endVol,
            );
            closeModal();
          }}
          onCancel={closeModal}
        />
      )}
      {modalOpen === 'strum' && (
        <LazyStrumDialog isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'effectPicker' && (
        <LazyEffectPicker
          isOpen={true}
          onSelect={() => closeModal()}
          onClose={closeModal}
        />
      )}
      {modalOpen === 'undoHistory' && (
        <LazyUndoHistoryPanel isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'patternMatrix' && (
        <LazyPatternMatrix isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'automation' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'flex-end', padding: '8px 12px',
            background: '#1e1e2e', borderBottom: '1px solid #333',
          }}>
            <button
              onClick={closeModal}
              style={{
                background: 'transparent', border: '1px solid #555', borderRadius: 4,
                color: '#aaa', padding: '4px 12px', cursor: 'pointer', fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              Close Automation
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <LazyAutomationPanel />
          </div>
        </div>
      )}
      {modalOpen === 'collaboration' && (
        <LazyCollaborationModal isOpen={true} onClose={closeModal} />
      )}
      {modalOpen === 'download' && (
        <LazyDownloadModal isOpen={true} onClose={closeModal} />
      )}
      {/* Module file drop — dialog routed through portal to sit above PixiDOMOverlay */}
      {pendingModuleFile && (
        /\.(fur|dmf)$/i.test(pendingModuleFile.name) ? (
          <LazyImportFurnaceDialog
            isOpen={true}
            onClose={() => setPendingModuleFile(null)}
            onImport={handleModuleImportGL}
            initialFile={pendingModuleFile}
          />
        ) : /\.(mid|midi)$/i.test(pendingModuleFile.name) ? (
          <LazyImportMIDIDialog
            isOpen={true}
            onClose={() => setPendingModuleFile(null)}
            onImport={handleModuleImportGL}
            initialFile={pendingModuleFile}
          />
        ) : (
          <LazyImportModuleDialog
            isOpen={true}
            onClose={() => setPendingModuleFile(null)}
            onImport={handleModuleImportGL}
            initialFile={pendingModuleFile}
          />
        )
      )}
      {/* Audio sample import dialog */}
      {pendingAudioFile && (
        <LazyImportAudioDialog
          isOpen={true}
          onClose={() => setPendingAudioFile(null)}
          initialFile={pendingAudioFile}
        />
      )}
      {/* TD-3 / TB-303 pattern import dialog */}
      {pendingTD3File && (
        <LazyImportTD3Dialog
          isOpen={true}
          onClose={() => setPendingTD3File(null)}
          initialFile={pendingTD3File}
          onImport={handleTD3ImportGL}
        />
      )}
      {/* SunVox patch/song import dialog */}
      {pendingSunVoxFile && (
        <LazySunVoxImportDialog
          onClose={() => setPendingSunVoxFile(null)}
          onImport={handleSunVoxImportGL}
          initialFile={pendingSunVoxFile}
        />
      )}
      {/* Always-mounted dialogs */}
      <LazySynthErrorDialog />
      <LazyRomUploadDialog />
      {activeView === 'drumpad' && (
        <LazyDrumPadManager />
      )}
    </Suspense>,
    portalRef.current!,
  );
};
