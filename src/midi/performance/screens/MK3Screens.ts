import { MK3Display } from '@/midi/performance/MK3Display';
import type { MK2Screen, MK2ScreenContext } from '@/midi/performance/screens/MK2ScreenManager';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useNKSLibraryStore } from '@/stores/useNKSLibraryStore';
import { buildNKSPages, getNKSParametersForSynth } from '@/midi/performance/synthParameterMaps';
import { getKnobPageName } from '@/midi/knobBanks';
import type { SynthType } from '@/types/instrument';
import type { NKSParameter } from '@/midi/performance/types';

const BAR_COLORS = [
  MK3Display.NI_ORANGE,
  MK3Display.CYAN,
  MK3Display.GREEN,
  MK3Display.YELLOW,
  MK3Display.PURPLE,
  MK3Display.BLUE,
  MK3Display.ORANGE,
  MK3Display.NI_ACCENT,
];

function asMK3(display: unknown): MK3Display | null {
  return display instanceof MK3Display ? display : null;
}

function resolveParamValue(paramId: string, config: Record<string, unknown> | undefined): number {
  if (!config) return 0.5;
  let current: unknown = config;
  for (const part of paramId.split('.')) {
    if (current == null || typeof current !== 'object') return 0.5;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' ? current : 0.5;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pageParamsForInstrument(synthType: SynthType, pageIndex: number): { pageName: string; totalPages: number; params: NKSParameter[] } {
  const pages = buildNKSPages(getNKSParametersForSynth(synthType));
  const totalPages = Math.max(1, pages.length);
  const safePage = pages[Math.min(pageIndex, totalPages - 1)];
  return {
    pageName: getKnobPageName(synthType, pageIndex) || safePage?.name || `Page ${pageIndex + 1}`,
    totalPages,
    params: safePage?.parameters.slice(0, 8) ?? [],
  };
}

export class MK3InstrumentScreen implements MK2Screen {
  render(left: unknown, right: unknown, _ctx: MK2ScreenContext): void {
    const leftDisplay = asMK3(left);
    const rightDisplay = asMK3(right);
    if (!leftDisplay || !rightDisplay) return;

    const inst = useInstrumentStore.getState().currentInstrument;
    if (!inst) {
      leftDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(32, 10, 0), MK3Display.BLACK);
      leftDisplay.title(24, 48, 'NO INSTRUMENT', MK3Display.WHITE);
      rightDisplay.text(24, 40, 'Select an instrument to begin.', MK3Display.LGRAY, 2);
      return;
    }

    const midiState = useMIDIStore.getState();
    const pageIndex = midiState.nksKnobPage;
    const { pageName, totalPages, params } = pageParamsForInstrument(inst.synthType as SynthType, pageIndex);

    leftDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(28, 18, 12), MK3Display.rgb(4, 6, 10));
    leftDisplay.fillRect(18, 18, MK3Display.W - 36, MK3Display.H - 36, MK3Display.rgb(12, 16, 24));
    leftDisplay.rect(18, 18, MK3Display.W - 36, MK3Display.H - 36, MK3Display.NI_ORANGE);
    leftDisplay.text(36, 36, 'INSTRUMENT', MK3Display.NI_ORANGE, 2);
    leftDisplay.title(36, 72, inst.name.substring(0, 18), MK3Display.WHITE);
    leftDisplay.text(36, 112, `Synth: ${inst.synthType}`, MK3Display.CYAN, 2);
    leftDisplay.text(36, 148, `Page: ${pageName}`, MK3Display.LGRAY, 2);
    leftDisplay.text(36, 184, `Bank ${pageIndex + 1} / ${totalPages}`, MK3Display.YELLOW, 2);
    for (let i = 0; i < totalPages; i++) {
      const color = i === pageIndex ? MK3Display.NI_ORANGE : MK3Display.GRAY;
      leftDisplay.fillRect(36 + i * 24, 226, 16, 10, color);
    }

    const waveformSamples = Array.from({ length: 240 }, (_, i) => {
      const t = (i / 240) * Math.PI * (inst.synthType === 'TB303' ? 4 : 2);
      return inst.synthType === 'TB303' ? 1 - ((i % 48) / 24) : Math.sin(t) * 0.8;
    });
    leftDisplay.waveform(36, 242, 408, 20, waveformSamples, MK3Display.NI_ACCENT);

    rightDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(10, 14, 20), MK3Display.BLACK);
    rightDisplay.text(24, 22, 'NKS PARAMETERS', MK3Display.NI_ORANGE, 2);
    rightDisplay.text(24, 48, pageName.substring(0, 26), MK3Display.WHITE, 2);

    params.forEach((param, index) => {
      const rowY = 80 + index * 22;
      const color = BAR_COLORS[index % BAR_COLORS.length];
      const value = resolveParamValue(param.id, inst as unknown as Record<string, unknown>);
      const norm = clamp01((value - param.min) / Math.max(1e-6, param.max - param.min));
      const label = (param.accessibilityName || param.name || param.id).substring(0, 18);
      rightDisplay.text(24, rowY, label, MK3Display.WHITE, 1);
      rightDisplay.bar(180, rowY - 2, 248, 14, norm, color, MK3Display.rgb(28, 28, 32));
      rightDisplay.text(436, rowY, `${Math.round(norm * 100)}`.padStart(3, ' '), MK3Display.LGRAY, 1);
    });
  }

  softLabels(): string[] {
    const inst = useInstrumentStore.getState().currentInstrument;
    if (!inst) return Array(8).fill('');
    const pageIndex = useMIDIStore.getState().nksKnobPage;
    const { totalPages } = pageParamsForInstrument(inst.synthType as SynthType, pageIndex);
    return Array.from({ length: 8 }, (_, i) => {
      if (i >= totalPages) return '';
      const name = getKnobPageName(inst.synthType as SynthType, i) || `P${i + 1}`;
      return name.substring(0, 8);
    });
  }
}

export class MK3MixerScreen implements MK2Screen {
  render(left: unknown, right: unknown, ctx: MK2ScreenContext): void {
    const leftDisplay = asMK3(left);
    const rightDisplay = asMK3(right);
    if (!leftDisplay || !rightDisplay) return;

    const tracker = useTrackerStore.getState();
    const pattern = tracker.patterns[tracker.currentPatternIndex];
    const channels = pattern?.channels.slice(0, 8) ?? [];
    leftDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(14, 20, 20), MK3Display.BLACK);
    rightDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(16, 12, 24), MK3Display.BLACK);
    leftDisplay.text(24, 20, 'MIXER A-D', MK3Display.CYAN, 2);
    rightDisplay.text(24, 20, 'MIXER E-H', MK3Display.CYAN, 2);

    const renderDeck = (display: MK3Display, offset: number) => {
      for (let i = 0; i < 4; i++) {
        const channelIndex = offset + i;
        const channel = channels[channelIndex];
        const x = 36 + i * 104;
        const level = clamp01((channel?.volume ?? 80) / 100);
        const barH = 150;
        const y = 200;
        const color = BAR_COLORS[channelIndex % BAR_COLORS.length];
        display.rect(x, 48, 72, 180, channelIndex === ctx.selectedChannel ? MK3Display.WHITE : MK3Display.GRAY);
        display.text(x + 22, 60, `CH${channelIndex + 1}`, MK3Display.WHITE, 1);
        display.fillRect(x + 18, y - Math.round(level * barH), 36, Math.round(level * barH), color);
        display.rect(x + 18, y - barH, 36, barH, MK3Display.LGRAY);
        if (channel?.muted) display.text(x + 22, 210, 'MUTE', MK3Display.RED, 1);
        else if (channel?.solo) display.text(x + 22, 210, 'SOLO', MK3Display.YELLOW, 1);
        else display.text(x + 28, 210, `${Math.round(level * 100)}`, MK3Display.LGRAY, 1);
      }
    };

    renderDeck(leftDisplay, 0);
    renderDeck(rightDisplay, 4);
  }

  softLabels(): string[] {
    return ['Ch 1', 'Ch 2', 'Ch 3', 'Ch 4', 'Ch 5', 'Ch 6', 'Ch 7', 'Ch 8'];
  }
}

export class MK3BrowseScreen implements MK2Screen {
  render(left: unknown, right: unknown, _ctx: MK2ScreenContext): void {
    const leftDisplay = asMK3(left);
    const rightDisplay = asMK3(right);
    if (!leftDisplay || !rightDisplay) return;

    const store = useNKSLibraryStore.getState();
    const product = store.selectedProduct || store.products[0]?.name || 'NKS Library';
    const preset = store.presets[0];

    leftDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(20, 10, 2), MK3Display.BLACK);
    leftDisplay.text(24, 22, 'BROWSE', MK3Display.NI_ORANGE, 2);
    leftDisplay.title(24, 64, product.substring(0, 18), MK3Display.WHITE);
    leftDisplay.text(24, 106, `Products: ${store.products.length}`, MK3Display.CYAN, 2);
    leftDisplay.text(24, 136, `Results: ${store.presetsTotal || store.presets.length}`, MK3Display.GREEN, 2);
    if (store.searchQuery) leftDisplay.text(24, 166, `Search: ${store.searchQuery.substring(0, 18)}`, MK3Display.YELLOW, 2);
    if (store.filterBrand) leftDisplay.text(24, 196, `Brand: ${store.filterBrand.substring(0, 18)}`, MK3Display.LGRAY, 2);

    rightDisplay.gradientFillRect(0, 0, MK3Display.W, MK3Display.H, MK3Display.rgb(8, 12, 18), MK3Display.BLACK);
    rightDisplay.text(24, 22, 'PRESET', MK3Display.NI_ORANGE, 2);
    if (!preset) {
      rightDisplay.title(24, 76, 'NO RESULTS', MK3Display.WHITE);
      rightDisplay.text(24, 118, 'Load the NKS library to browse products and presets.', MK3Display.LGRAY, 2);
      return;
    }

    rightDisplay.title(24, 64, preset.name.substring(0, 18), MK3Display.WHITE);
    rightDisplay.text(24, 106, `Vendor: ${preset.vendor}`.substring(0, 28), MK3Display.CYAN, 2);
    rightDisplay.text(24, 136, `Product: ${preset.product}`.substring(0, 28), MK3Display.GREEN, 2);
    rightDisplay.text(24, 166, `Types: ${preset.types || '—'}`.substring(0, 28), MK3Display.YELLOW, 2);
    rightDisplay.text(24, 196, `Bank: ${preset.bank || 'Factory'}`.substring(0, 28), MK3Display.LGRAY, 2);
  }

  softLabels(): string[] {
    return ['Product', 'Search', 'Brand', 'Type', 'Character', '', '', 'Load'];
  }
}
