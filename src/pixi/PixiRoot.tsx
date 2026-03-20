/**
 * PixiRoot — Root layout container for the WebGL UI.
 *
 * Modern mode: PixiMainLayout (fixed zones: NavBar, MainView, BottomDock, StatusBar)
 * CRT filter still applies globally via app.stage.filters.
 *
 * NOTE: The root container MUST use explicit pixel dimensions, not percentages.
 * @pixi/layout's Yoga calculateLayout() requires numeric width/height for root nodes
 * that have no parent layout to resolve percentages against.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useApplication, useTick } from '@pixi/react';
import { isRapidScrolling } from './scrollPerf';
import { useUIStore, useSettingsStore, useTrackerStore } from '@stores';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { notify } from '@stores/useNotificationStore';
import type { ModuleInfo } from '@/lib/import/ModuleLoader';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';
import { usePixiResponsive } from './hooks/usePixiResponsive';
import { PixiPeerCursor } from './views/collaboration/PixiPeerCursor';
import { PixiCollaborationToolbar } from './views/collaboration/PixiCollaborationToolbar';
import { PixiCollaborationSplitView } from './views/collaboration/PixiCollaborationSplitView';
import { PixiGlobalDropdownLayer } from './components/PixiGlobalDropdownLayer';
import { PixiGlobalTooltipLayer } from './components/PixiGlobalTooltipLayer';
import { PixiMainLayout } from './shell/PixiMainLayout';
import { CRTRenderer } from './CRTRenderer';
import { LensFilter } from './LensFilter';
import { Filter, Rectangle } from 'pixi.js';
import { getAverageFps } from './performance';
import { PixiNewSongWizard } from './dialogs/PixiNewSongWizard';
import { PixiInterpolateDialog } from './dialogs/PixiInterpolateDialog';
import { PixiHumanizeDialog } from './dialogs/PixiHumanizeDialog';
import { PixiScaleVolumeDialog } from './dialogs/PixiScaleVolumeDialog';
import { PixiFadeVolumeDialog } from './dialogs/PixiFadeVolumeDialog';
import { PixiStrumDialog } from './dialogs/PixiStrumDialog';
import { PixiAcidPatternDialog } from './dialogs/PixiAcidPatternDialog';
import { PixiRandomizeDialog } from './dialogs/PixiRandomizeDialog';
import { PixiClipRenameDialog } from './dialogs/PixiClipRenameDialog';
import { PixiTrackRenameDialog } from './dialogs/PixiTrackRenameDialog';
import { PixiDownloadModal } from './dialogs/PixiDownloadModal';
import { PixiSynthErrorDialog } from './dialogs/PixiSynthErrorDialog';
import { PixiUndoHistoryPanel } from './dialogs/PixiUndoHistoryPanel';
import { PixiKeyboardShortcutSheet } from './dialogs/PixiKeyboardShortcutSheet';
import { PixiGrooveSettingsModal } from './dialogs/PixiGrooveSettingsModal';
import { PixiFindReplaceDialog } from './dialogs/PixiFindReplaceDialog';
import { PixiEffectPicker } from './dialogs/PixiEffectPicker';
import { PixiAdvancedEditModal } from './dialogs/PixiAdvancedEditModal';
import { PixiRemapInstrumentDialog } from './dialogs/PixiRemapInstrumentDialog';
import { PixiTipOfTheDay } from './dialogs/PixiTipOfTheDay';
import { PixiCollaborationModal } from './dialogs/PixiCollaborationModal';
import { PixiRevisionBrowserDialog } from './dialogs/PixiRevisionBrowserDialog';
import { PixiFurnacePresetBrowser } from './dialogs/PixiFurnacePresetBrowser';
import { PixiSIDInfoModal } from './dialogs/PixiSIDInfoModal';
import { PixiModuleInfoModal } from './dialogs/PixiModuleInfoModal';
import { PixiArrangementContextMenu } from './dialogs/PixiArrangementContextMenu';
import { PixiHelpModal } from './dialogs/PixiHelpModal';
import { PixiDrumpadEditorModal } from './dialogs/PixiDrumpadEditorModal';
import { PixiImportTD3Dialog } from './dialogs/PixiImportTD3Dialog';
import { PixiSunVoxImportDialog } from './dialogs/PixiSunVoxImportDialog';
import { PixiAutomationPanel } from './dialogs/PixiAutomationPanel';
import { PixiPatternOrderModal } from './dialogs/PixiPatternOrderModal';
import { PixiAuthModal } from './dialogs/PixiAuthModal';
import { PixiRomUploadDialog } from './dialogs/PixiRomUploadDialog';
import { PixiImportModuleDialog } from './dialogs/PixiImportModuleDialog';
import { PixiImportFurnaceDialog } from './dialogs/PixiImportFurnaceDialog';
import { PixiImportMIDIDialog } from './dialogs/PixiImportMIDIDialog';
import { PixiImportAudioDialog } from './dialogs/PixiImportAudioDialog';
import { PixiExportDialog } from './dialogs/PixiExportDialog';
import { PixiTD3PatternDialog } from './dialogs/PixiTD3PatternDialog';
import { PixiFileBrowser } from './dialogs/PixiFileBrowser';
import { PixiSamplePackBrowser } from './dialogs/PixiSamplePackBrowser';
import { PixiDrumPadManager } from './dialogs/PixiDrumPadManager';
import { PixiSettingsModal } from './dialogs/PixiSettingsModal';
import { PixiEditInstrumentModal } from './dialogs/PixiEditInstrumentModal';
import { PixiMasterEffectsModal } from './dialogs/PixiMasterEffectsModal';
import { PixiInstrumentEffectsModal } from './dialogs/PixiInstrumentEffectsModal';
import { PixiNonEditableDialog } from './dialogs/PixiNonEditableDialog';
import { PixiAIPanel } from './dialogs/PixiAIPanel';
import { PixiPatternBarEditor } from './dialogs/PixiPatternBarEditor';
import { clearExplicitlySaved } from '@hooks/useProjectPersistence';

export const PixiRoot: React.FC = () => {
  const { width, height } = usePixiResponsive();
  const collabStatus = useCollaborationStore(s => s.status);
  const activeView = useUIStore(s => s.activeView);
  const modalOpen = useUIStore(s => s.modalOpen);
  const modalData = useUIStore(s => s.modalData);
  const closeModal = useUIStore(s => s.closeModal);
  const showFileBrowser = useUIStore(s => s.showFileBrowser);
  const setShowFileBrowser = useUIStore(s => s.setShowFileBrowser);
  const showSamplePackModal = useUIStore(s => s.showSamplePackModal);
  const setShowSamplePackModal = useUIStore(s => s.setShowSamplePackModal);
  const showTD3Pattern = useMIDIStore(s => s.showPatternDialog);
  const closePatternDialog = useMIDIStore(s => s.closePatternDialog);

  // Pending file imports (for TD3, SunVox, Module, Audio dialogs)
  const pendingTD3File = useUIStore(s => s.pendingTD3File);
  const setPendingTD3File = useUIStore(s => s.setPendingTD3File);
  const pendingSunVoxFile = useUIStore(s => s.pendingSunVoxFile);
  const setPendingSunVoxFile = useUIStore(s => s.setPendingSunVoxFile);
  const pendingModuleFile = useUIStore(s => s.pendingModuleFile);
  const setPendingModuleFile = useUIStore(s => s.setPendingModuleFile);
  const pendingCompanionFiles = useUIStore(s => s.pendingCompanionFiles);
  const pendingAudioFile = useUIStore(s => s.pendingAudioFile);
  const setPendingAudioFile = useUIStore(s => s.setPendingAudioFile);

  // Handler for ImportTD3Dialog
  const handleTD3ImportGL = useCallback(async (file: File, replacePatterns: boolean) => {
    setPendingTD3File(null);
    try {
      const { loadFile } = await import('@lib/file/UnifiedFileLoader');
      const result = await loadFile(file, { requireConfirmation: false, replacePatterns });
      if (result.success === true) notify.success(result.message);
      else if (result.success === false) notify.error(result.error);
    } catch (err) {
      notify.error('Failed to import TD-3 file');
      console.error('[PixiRoot] TD-3 import failed:', err);
    }
  }, [setPendingTD3File]);

  // Handler for SunVoxImportDialog (.sunsynth patches only)
  const handleSunVoxImportGL = useCallback(async (name: string, config: import('@/types/instrument').SunVoxConfig) => {
    setPendingSunVoxFile(null);
    try {
      useInstrumentStore.getState().createInstrument({ name, synthType: 'SunVoxSynth', sunvox: config });
      notify.success(`Imported SunVox patch: ${name}`);
    } catch (err) {
      notify.error('Failed to import SunVox patch');
      console.error('[PixiRoot] SunVox patch import failed:', err);
    }
  }, [setPendingSunVoxFile]);

  // Handler for ImportModuleDialog (module/furnace/midi)
  const handleModuleImportGL = useCallback(async (info: ModuleInfo, options: ImportOptions) => {
    setPendingModuleFile(null);
    try {
      const { importTrackerModule } = await import('@lib/file/UnifiedFileLoader');
      await importTrackerModule(info, options);
    } catch (error) {
      console.error('[PixiRoot] Module import failed:', error);
      notify.error('Failed to import file');
    }
  }, [setPendingModuleFile]);

  // Handler for FileBrowser load (.dbx JSON projects)
  const handleFileBrowserLoad = useCallback(async (data: any, filename: string) => {
    clearExplicitlySaved();
    setShowFileBrowser(false);
    try {
      const { loadFile } = await import('@lib/file/UnifiedFileLoader');
      const file = new File([JSON.stringify(data)], filename, { type: 'application/json' });
      const result = await loadFile(file);
      if (result.success === true) notify.success(result.message);
      else if (result.success === false) notify.error(result.error);
    } catch (error) {
      console.error('Failed to load project:', error);
      notify.error('Failed to load project');
    }
  }, [setShowFileBrowser]);

  // Handler for FileBrowser tracker module load (binary formats)
  const handleLoadTrackerModule = useCallback(async (buffer: ArrayBuffer, filename: string) => {
    clearExplicitlySaved();
    try {
      const { loadFile } = await import('@lib/file/UnifiedFileLoader');
      const file = new File([buffer], filename);
      const result = await loadFile(file);
      if (result.success === 'pending-import') {
        setPendingModuleFile(result.file);
      } else if (result.success === true) {
        notify.success(result.message);
      } else if (result.success === false) {
        notify.error(result.error);
      }
    } catch (error) {
      console.error('Failed to load tracker module:', error);
      notify.error('Failed to load file');
    }
  }, [setPendingModuleFile]);

  const { app } = useApplication();
  const crtEnabled  = useSettingsStore((s) => s.crtEnabled);
  const crtParams   = useSettingsStore((s) => s.crtParams);
  const lensEnabled = useSettingsStore((s) => s.lensEnabled);
  const lensParams  = useSettingsStore((s) => s.lensParams);

  const crtRef  = useRef<CRTRenderer | null>(null);
  const lensRef = useRef<LensFilter | null>(null);
  // Hysteresis state: bloom off below 45fps, back on above 55fps
  const bloomEnabledRef = useRef(true);

  // Keep drumpad modal auto-open behavior
  useEffect(() => {
    if (activeView === 'drumpad') {
      const s = useUIStore.getState();
      if (s.modalOpen !== 'drumpads') s.openModal('drumpads');
    }
  }, [activeView]);

  // Create CRTRenderer + LensFilter once on mount.
  useEffect(() => {
    const crt = new CRTRenderer();
    const lens = new LensFilter();
    crtRef.current = crt;
    lensRef.current = lens;
    return () => {
      if (app?.stage?.filters?.length) app.stage.filters = [];
      crt.destroy();
      lens.destroy();
      crtRef.current = null;
      lensRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep stage.filterArea in sync with the screen dimensions so the CRT filter's
  // internal RenderTexture is always exactly screen-sized.
  useEffect(() => {
    if (!app?.stage) return;
    app.stage.filterArea = new Rectangle(0, 0, width, height);
  }, [app, width, height]);

  // Apply CRT + Lens filters to app.stage.
  useTick(() => {
    if (isRapidScrolling()) return;
    const crt = crtRef.current;
    const lens = lensRef.current;
    if (!crt || !lens || !app?.stage) return;

    // Build active filter list
    const filters: Filter[] = [];

    if (lensEnabled) {
      lens.updateParams(lensParams);
      filters.push(lens);
    }

    if (crtEnabled) {
      // Adaptive quality: hysteresis — bloom off below 45fps, stays off until > 55fps
      const fps = getAverageFps();
      if (bloomEnabledRef.current  && fps < 45) bloomEnabledRef.current = false;
      if (!bloomEnabledRef.current && fps > 55) bloomEnabledRef.current = true;

      crt.updateParams(performance.now() / 1000, {
        ...crtParams,
        bloomIntensity: bloomEnabledRef.current ? crtParams.bloomIntensity : 0,
      });
      filters.push(crt);
    }

    // Only update filters array ref when membership changes
    const current = app.stage.filters ?? [];
    if (current.length !== filters.length || filters.some((f, i) => current[i] !== f)) {
      app.stage.filters = filters.length ? filters : [];
    }
  });

  return (
    <pixiContainer
      layout={{
        width,
        height,
        flexDirection: 'column',
      }}
    >
      {/* Modern fixed-zone shell */}
      <PixiMainLayout />

      {/* GL-native modals — inside scene graph so CRT shader catches them */}
      <pixiContainer zIndex={300} layout={{ position: 'absolute', left: 0, top: 0, width, height }}>
        <PixiNewSongWizard />
        <PixiInterpolateDialog isOpen={modalOpen === 'interpolate'} onClose={closeModal} />
        <PixiHumanizeDialog isOpen={modalOpen === 'humanize'} onClose={closeModal} />
        <PixiScaleVolumeDialog
          isOpen={modalOpen === 'scaleVolume'}
          onClose={closeModal}
          scope={(modalData?.scope as 'block' | 'track' | 'pattern') || 'block'}
        />
        <PixiFadeVolumeDialog
          isOpen={modalOpen === 'fadeVolume'}
          onClose={closeModal}
          scope={(modalData?.scope as 'block' | 'track' | 'pattern') || 'block'}
        />
        <PixiStrumDialog isOpen={modalOpen === 'strum'} onClose={closeModal} />
        <PixiAcidPatternDialog isOpen={modalOpen === 'acidPattern'} onClose={closeModal} />
        <PixiRandomizeDialog isOpen={modalOpen === 'randomize'} onClose={closeModal} />
        <PixiDownloadModal isOpen={modalOpen === 'download'} onClose={closeModal} />
        <PixiUndoHistoryPanel isOpen={modalOpen === 'undoHistory'} onClose={closeModal} />
        <PixiKeyboardShortcutSheet isOpen={modalOpen === 'shortcutSheet'} onClose={closeModal} />
        <PixiGrooveSettingsModal isOpen={modalOpen === 'grooveSettings'} onClose={closeModal} />
        <PixiFindReplaceDialog isOpen={modalOpen === 'findReplace'} onClose={closeModal} />
        <PixiEffectPicker
          isOpen={modalOpen === 'effectPicker'}
          onSelect={() => closeModal()}
          onClose={closeModal}
        />
        <PixiAdvancedEditModal
          isOpen={modalOpen === 'advancedEdit'}
          onClose={closeModal}
          onShowScaleVolume={(scope) => useUIStore.getState().openModal('scaleVolume', { scope })}
          onShowFadeVolume={(scope) => useUIStore.getState().openModal('fadeVolume', { scope })}
          onShowRemapInstrument={(scope) => useUIStore.getState().openModal('remapInstrument', { scope })}
        />
        <PixiRemapInstrumentDialog
          isOpen={modalOpen === 'remapInstrument'}
          scope={(modalData?.scope as 'block' | 'track' | 'pattern' | 'song') || 'block'}
          onConfirm={(source, dest) => {
            const { remapInstrument } = useTrackerStore.getState();
            remapInstrument(source, dest, (modalData?.scope as 'block' | 'track' | 'pattern' | 'song') || 'block');
            closeModal();
          }}
          onCancel={closeModal}
        />
        <PixiTipOfTheDay
          isOpen={modalOpen === 'tips'}
          onClose={closeModal}
          initialTab={(modalData?.initialTab as 'tips' | 'changelog') || 'tips'}
        />
        <PixiCollaborationModal isOpen={modalOpen === 'collaboration'} onClose={closeModal} />
        <PixiRevisionBrowserDialog isOpen={modalOpen === 'revisions'} onClose={closeModal} />
        <PixiFurnacePresetBrowser isOpen={modalOpen === 'furnacePresets'} onClose={closeModal} />
        <PixiSIDInfoModal isOpen={modalOpen === 'sidInfo'} onClose={closeModal} />
        <PixiModuleInfoModal isOpen={modalOpen === 'moduleInfo'} onClose={closeModal} />
        <PixiHelpModal
          isOpen={modalOpen === 'help'}
          onClose={closeModal}
          initialTab={(modalData?.initialTab as 'shortcuts' | 'effects' | 'chip-effects' | 'tutorial') || 'shortcuts'}
        />
        <PixiDrumpadEditorModal isOpen={modalOpen === 'drumpads' || modalOpen === 'midi-pads'} onClose={closeModal} />
        <PixiPatternOrderModal isOpen={modalOpen === 'patternOrder'} onClose={closeModal} />
        <PixiAutomationPanel isOpen={modalOpen === 'automation'} onClose={closeModal} />
        {pendingTD3File && (
          <PixiImportTD3Dialog
            isOpen={true}
            onClose={() => setPendingTD3File(null)}
            initialFile={pendingTD3File}
            onImport={handleTD3ImportGL}
          />
        )}
        {pendingSunVoxFile && (
          <PixiSunVoxImportDialog
            onClose={() => setPendingSunVoxFile(null)}
            onImport={handleSunVoxImportGL}
            initialFile={pendingSunVoxFile}
          />
        )}
        <PixiAuthModal isOpen={modalOpen === 'auth'} onClose={closeModal} />
        <PixiRomUploadDialog />
        {/* Module file imports — always mounted, isOpen controls visibility
             (conditional mount/unmount can fail silently in pixi-react reconciler) */}
        <PixiImportFurnaceDialog
          isOpen={!!pendingModuleFile && /\.(fur|dmf)$/i.test(pendingModuleFile.name)}
          onClose={() => { setPendingModuleFile(null); useUIStore.getState().setPendingCompanionFiles([]); }}
          onImport={handleModuleImportGL}
          initialFile={pendingModuleFile}
        />
        <PixiImportMIDIDialog
          isOpen={!!pendingModuleFile && /\.(mid|midi)$/i.test(pendingModuleFile.name)}
          onClose={() => { setPendingModuleFile(null); useUIStore.getState().setPendingCompanionFiles([]); }}
          onImport={handleModuleImportGL}
          initialFile={pendingModuleFile}
        />
        <PixiImportModuleDialog
          isOpen={!!pendingModuleFile && !/\.(fur|dmf|mid|midi|v2m)$/i.test(pendingModuleFile.name)}
          onClose={() => { setPendingModuleFile(null); useUIStore.getState().setPendingCompanionFiles([]); }}
          onImport={handleModuleImportGL}
          initialFile={pendingModuleFile}
          companionFiles={pendingCompanionFiles}
        />
        {/* Audio sample import */}
        <PixiImportAudioDialog
          isOpen={!!pendingAudioFile}
          onClose={() => setPendingAudioFile(null)}
          initialFile={pendingAudioFile}
        />
        <PixiExportDialog isOpen={modalOpen === 'export'} onClose={closeModal} />
        {showFileBrowser && (
          <PixiFileBrowser
            isOpen={true}
            onClose={() => setShowFileBrowser(false)}
            mode="load"
            onLoad={handleFileBrowserLoad}
            onLoadTrackerModule={handleLoadTrackerModule}
          />
        )}
        {modalOpen === 'fileBrowser' && (
          <PixiFileBrowser
            isOpen={true}
            onClose={closeModal}
            mode="load"
            onLoad={handleFileBrowserLoad}
            onLoadTrackerModule={handleLoadTrackerModule}
          />
        )}
        {showTD3Pattern && (
          <PixiTD3PatternDialog isOpen={true} onClose={closePatternDialog} />
        )}
        {showSamplePackModal && (
          <PixiSamplePackBrowser onClose={() => setShowSamplePackModal(false)} />
        )}
        {activeView === 'drumpad' && <PixiDrumPadManager />}
        <PixiSettingsModal isOpen={modalOpen === 'settings'} onClose={closeModal} />
        <PixiEditInstrumentModal isOpen={modalOpen === 'instruments'} onClose={closeModal} />
        <PixiMasterEffectsModal isOpen={modalOpen === 'masterFx'} onClose={closeModal} />
        <PixiInstrumentEffectsModal isOpen={modalOpen === 'instrumentFx'} onClose={closeModal} />
        <PixiClipRenameDialog />
        <PixiTrackRenameDialog />
        <PixiSynthErrorDialog />
        <PixiNonEditableDialog />
        <PixiArrangementContextMenu />
        <PixiPatternBarEditor isOpen={modalOpen === 'parameterEditor'} onClose={closeModal} />
        <PixiAIPanel />
      </pixiContainer>

      {/* Collaboration split view — overlays tracker area */}
      <PixiCollaborationSplitView />

      {/* Peer cursor overlay — above everything */}
      <pixiContainer
        zIndex={200}
        alpha={collabStatus === 'connected' ? 1 : 0}
        renderable={collabStatus === 'connected'}
        eventMode={collabStatus === 'connected' ? 'auto' : 'none'}
        layout={{ position: 'absolute', width, height }}
      >
        <PixiPeerCursor width={width} height={height} />
        <PixiCollaborationToolbar />
      </pixiContainer>

      {/* Global tooltip layer — above all modals (rendered last = on top) */}
      <PixiGlobalTooltipLayer />

      {/* Global dropdown layer — topmost layer, above modals and tooltips */}
      <PixiGlobalDropdownLayer />
    </pixiContainer>
  );
};
