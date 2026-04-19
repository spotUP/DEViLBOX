/**
 * Safety net: every store module must evaluate without throwing, and every
 * exported store hook must return a non-nullish initial state.
 *
 * This catches module-load crashes introduced by broken imports, circular
 * dependencies, or side-effects that assume a browser-only API.
 */

import { describe, it, expect } from 'vitest';
import { assertNoCrashOnImport } from './_harness';

const STORE_MODULES: Array<[name: string, load: () => Promise<Record<string, unknown>>]> = [
  ['useAIStore', () => import('../useAIStore')],
  ['useAudioStore', () => import('../useAudioStore')],
  ['useAuthStore', () => import('../useAuthStore')],
  ['useAutomationStore', () => import('../useAutomationStore')],
  ['useCheeseCutterStore', () => import('../useCheeseCutterStore')],
  ['useCollaborationStore', () => import('../useCollaborationStore')],
  ['useConfirmStore', () => import('../useConfirmStore')],
  ['useCursorStore', () => import('../useCursorStore')],
  ['useDJPlaylistStore', () => import('../useDJPlaylistStore')],
  ['useDJSetStore', () => import('../useDJSetStore')],
  ['useDJStore', () => import('../useDJStore')],
  ['useDrumPadStore', () => import('../useDrumPadStore')],
  ['useDubStore', () => import('../useDubStore')],
  ['useEditorStore', () => import('../useEditorStore')],
  ['useFormatStore', () => import('../useFormatStore')],
  ['useGTUltraStore', () => import('../useGTUltraStore')],
  ['useHistoryStore', () => import('../useHistoryStore')],
  ['useInstrumentStore', () => import('../useInstrumentStore')],
  ['useKeyboardStore', () => import('../useKeyboardStore')],
  ['useLiveModeStore', () => import('../useLiveModeStore')],
  ['useMIDIStore', () => import('../useMIDIStore')],
  ['useMixerStore', () => import('../useMixerStore')],
  ['useModlandContributionModal', () => import('../useModlandContributionModal')],
  ['useModlandResultStore', () => import('../useModlandResultStore')],
  ['useNotificationStore', () => import('../useNotificationStore')],
  ['useOscilloscopeStore', () => import('../useOscilloscopeStore')],
  ['usePatternMatchModal', () => import('../usePatternMatchModal')],
  ['usePresetStore', () => import('../usePresetStore')],
  ['useProjectStore', () => import('../useProjectStore')],
  ['useRegisterLaneStore', () => import('../useRegisterLaneStore')],
  ['useRomDialogStore', () => import('../useRomDialogStore')],
  ['useSamplePackStore', () => import('../useSamplePackStore')],
  ['useSettingsStore', () => import('../useSettingsStore')],
  ['useSF2Store', () => import('../useSF2Store')],
  ['useSpeechActivityStore', () => import('../useSpeechActivityStore')],
  ['useSynthErrorStore', () => import('../useSynthErrorStore')],
  ['useTabsStore', () => import('../useTabsStore')],
  ['useThemeStore', () => import('../useThemeStore')],
  ['useTourStore', () => import('../useTourStore')],
  ['useTrackerAnalysisStore', () => import('../useTrackerAnalysisStore')],
  ['useTrackerStore', () => import('../useTrackerStore')],
  ['useTransportStore', () => import('../useTransportStore')],
  ['useUIStore', () => import('../useUIStore')],
  ['useVisualizationStore', () => import('../useVisualizationStore')],
  ['useVocoderStore', () => import('../useVocoderStore')],
  ['useWasmPositionStore', () => import('../useWasmPositionStore')],
  ['useWorkbenchStore', () => import('../useWorkbenchStore')],
  ['useYouTubeStore', () => import('../useYouTubeStore')],
];

// Give each store test a generous budget — a few stores pull in Tone.js and
// heavy factories on import, which can push cold-start past the default 5 s.
const IMPORT_TIMEOUT_MS = 30000;

describe('Store safety net — import + init', () => {
  for (const [name, load] of STORE_MODULES) {
    it(
      `${name} imports cleanly and exposes a valid initial state`,
      async () => {
        await expect(assertNoCrashOnImport(load)).resolves.not.toThrow();
      },
      IMPORT_TIMEOUT_MS,
    );
  }
});
