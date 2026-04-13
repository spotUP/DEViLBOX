/**
 * ChannelContextMenu - Dropdown menu for channel operations
 * Shows different options based on Live vs Edit mode
 */

import React, { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Music,
  Trash2,
  Copy,
  ClipboardPaste,
  Scissors,
  ArrowUpDown,
  Wand2,
  TrendingUp,
  VolumeX,
  Headphones,
  Palette,
  Minus,
  Repeat,
  Radio,
  Activity,
  Zap,
  Volume2,
  Waves,
  Sparkles,
  Rewind,
  Shuffle,
  Minimize2,
  Maximize2,
} from 'lucide-react';
import { DropdownButton, type MenuItemType } from '@components/common/ContextMenu';
import { useLiveModeStore } from '@stores/useLiveModeStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useAutomationStore } from '@stores/useAutomationStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import type { ChannelData } from '@typedefs/tracker';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';
import { CHANNEL_COLORS } from '@typedefs/tracker';
import { MASTER_FX_PRESETS } from '@constants/fxPresets';
import { notify } from '@stores/useNotificationStore';
import { useFormatStore } from '@stores/useFormatStore';
import { useGTUltraStore } from '@stores/useGTUltraStore';
import { getParamsForFormat, groupParams, type AutomationFormat } from '../../engine/automation/AutomationParams';

interface ChannelContextMenuProps {
  channelIndex: number;
  channel: ChannelData;
  patternId: string;
  patternLength: number;
  onFillPattern: (channelIndex: number, generatorType: GeneratorType) => void;
  onClearChannel: (channelIndex: number) => void;
  onCopyChannel: (channelIndex: number) => void;
  onCutChannel: (channelIndex: number) => void;
  onPasteChannel: (channelIndex: number) => void;
  onTranspose: (channelIndex: number, semitones: number) => void;
  onHumanize: (channelIndex: number) => void;
  onInterpolate: (channelIndex: number) => void;
  onAcidGenerator: (channelIndex: number) => void;
  onRandomize: (channelIndex: number) => void;
  onToggleCollapse?: (channelIndex: number) => void;
  onReverseVisual?: (channelIndex: number) => void;
  onPolyrhythm?: (channelIndex: number) => void;
  onFibonacci?: (channelIndex: number) => void;
  onEuclidean?: (channelIndex: number) => void;
  onPingPong?: (channelIndex: number) => void;
  onGlitch?: (channelIndex: number) => void;
  onStrobe?: (channelIndex: number) => void;
  onVisualEcho?: (channelIndex: number) => void;
  onConverge?: (channelIndex: number) => void;
  onSpiral?: (channelIndex: number) => void;
  onBounce?: (channelIndex: number) => void;
  onChaos?: (channelIndex: number) => void;
}

export const ChannelContextMenu: React.FC<ChannelContextMenuProps> = ({
  channelIndex,
  channel,
  patternId,
  onFillPattern,
  onClearChannel,
  onCopyChannel,
  onCutChannel,
  onPasteChannel,
  onTranspose,
  onHumanize,
  onInterpolate,
  onAcidGenerator,
  onRandomize,
  onToggleCollapse,
  onReverseVisual,
  onPolyrhythm,
  onFibonacci,
  onEuclidean,
  onPingPong,
  onGlitch,
  onStrobe,
  onVisualEcho,
  onConverge,
  onSpiral,
  onBounce,
  onChaos,
}) => {
  const { isLiveMode, queueChannelAction } = useLiveModeStore();
  const { toggleChannelMute, toggleChannelSolo, removeChannel, setChannelColor, toggleChannelCollapse, patterns } = useTrackerStore(useShallow((s) => ({
    toggleChannelMute: s.toggleChannelMute,
    toggleChannelSolo: s.toggleChannelSolo,
    removeChannel: s.removeChannel,
    setChannelColor: s.setChannelColor,
    toggleChannelCollapse: s.toggleChannelCollapse,
    patterns: s.patterns,
  })));
  const { setActiveParameter, removeCurve, getCurvesForPattern, addCurve, addPoint } = useAutomationStore(useShallow((s) => ({
    setActiveParameter: s.setActiveParameter,
    removeCurve: s.removeCurve,
    getCurvesForPattern: s.getCurvesForPattern,
    addCurve: s.addCurve,
    addPoint: s.addPoint,
  })));
  const { updateInstrument } = useInstrumentStore(useShallow((s) => ({
    updateInstrument: s.updateInstrument,
  })));

  const handleApplyChannelFxPreset = useCallback((presetName: string) => {
    const preset = MASTER_FX_PRESETS.find(p => p.name === presetName);
    if (!preset || !channel.instrumentId) return;

    const effects = preset.effects.map((fx, index) => ({
      ...fx,
      id: `channel-fx-${Date.now()}-${index}`,
    }));

    updateInstrument(channel.instrumentId, { effects });
    notify.success(`Applied ${preset.name} to CH ${(channelIndex + 1).toString().padStart(2, '0')}`);
  }, [channel.instrumentId, channelIndex, updateInstrument]);

  const curves = getCurvesForPattern(patternId, channelIndex);
  const hasCurves = curves.length > 0;

  // Register an automation parameter on this channel: ensure a curve exists
  // with at least one seed point so the lane is immediately visible to the user.
  const ensureAutomationCurve = useCallback((paramId: string) => {
    const existing = curves.find((c) => c.parameter === paramId);
    if (existing && existing.points.length > 0) return; // already drawable
    let curveId = existing?.id;
    if (!curveId) {
      curveId = addCurve(patternId, channelIndex, paramId);
      if (!curveId) return; // addCurve refused (format compat dialog cancelled)
    }
    // Seed a single point at row 0 with full value (1.0 → vol 64 / C40)
    addPoint(curveId, 0, 1);
  }, [curves, addCurve, addPoint, patternId, channelIndex]);

  // Dynamic automation parameters from channel's instrument
  const { params: nksParams } = useChannelAutomationParams(channelIndex);
  const automationParams = useMemo(() =>
    nksParams.slice(0, 8).map((p) => ({
      id: p.key,
      label: p.name,
      color: p.color,
    })),
    [nksParams]
  );

  // Register-capture automation params (SID/Paula/Furnace based on current format)
  const editorMode = useFormatStore(s => s.editorMode);

  const furnaceNative = useFormatStore(s => s.furnaceNative);
  const gtSidCount = editorMode === 'goattracker'
    ? (useGTUltraStore?.getState?.()?.sidCount ?? 1) : 1;

  const registerParamMenuItems = useMemo((): MenuItemType[] => {
    const fmt: AutomationFormat | null =
      editorMode === 'goattracker' ? 'gtultra' :
      editorMode === 'sidfactory2' ? 'sidfactory2' :
      editorMode === 'furnace' ? 'furnace' :
      editorMode === 'hively' ? 'hively' :
      editorMode === 'klystrack' ? 'klystrack' :
      editorMode === 'sc68' ? 'sc68' :
      editorMode === 'classic' ? 'uade' : null;
    if (!fmt) return [];

    const config = fmt === 'gtultra'
      ? { sidCount: gtSidCount }
      : fmt === 'furnace' && furnaceNative
        ? { chipIds: furnaceNative.chipIds, channelCount: furnaceNative.subsongs[furnaceNative.activeSubsong]?.channels.length ?? 4 }
        : undefined;

    // Filter to ONLY params for the right-clicked channel. Params without
    // a channel field (e.g. SID filter/global, format-wide params) are
    // always included so they're not hidden by the per-channel filter.
    const allParams = getParamsForFormat(fmt, config);
    const channelParams = allParams.filter((p) => p.channel === undefined || p.channel === channelIndex);
    if (channelParams.length === 0) return [];

    // Flat list — no per-chip-channel sub-submenu anymore. Just the params
    // for the channel that was right-clicked.
    const groups = groupParams(channelParams);
    return groups.flatMap(group => group.params.map(p => ({
      id: `reg-${p.id}`,
      label: p.label,
      onClick: () => {
        setActiveParameter(channelIndex, p.id);
        // Ensure the global automation lanes toggle is on
        const uiState = useUIStore.getState();
        if (!uiState.showAutomationLanes) uiState.toggleAutomationLanes();
        // Create the curve + seed point so the lane is immediately visible
        ensureAutomationCurve(p.id);
      },
    })));
  }, [editorMode, setActiveParameter, channelIndex, furnaceNative, gtSidCount, ensureAutomationCurve]);

  // Wrap every menu item's onClick with a status message so the user gets
  // visual confirmation in the status bar that the action ran. Recurses
  // into submenus.
  const withStatusMessages = useCallback((items: MenuItemType[]): MenuItemType[] => {
    const chLabel = `CH ${(channelIndex + 1).toString().padStart(2, '0')}`;
    return items.map((item) => {
      if (!item || (item as { type?: string }).type === 'divider') return item;
      const wrapped: MenuItemType = { ...item } as MenuItemType;
      const m = wrapped as { onClick?: () => void; label?: string; submenu?: MenuItemType[] };
      if (m.onClick) {
        const originalOnClick = m.onClick;
        const labelText = typeof m.label === 'string' ? m.label : '';
        m.onClick = () => {
          originalOnClick();
          if (labelText) {
            useUIStore.getState().setStatusMessage(`${labelText.toUpperCase()} — ${chLabel}`);
          }
        };
      }
      if (m.submenu && Array.isArray(m.submenu)) {
        m.submenu = withStatusMessages(m.submenu);
      }
      return wrapped;
    });
  }, [channelIndex]);

  // Build menu items based on mode
  const menuItemsRaw = useMemo((): MenuItemType[] => {
    if (isLiveMode) {
      // Live mode menu - focused on real-time performance
      return [
        // Trigger submenu
        {
          id: 'trigger',
          label: 'Trigger',
          icon: <Zap size={14} />,
          submenu: [
            {
              id: 'trigger-kicks',
              label: '4/4 Kicks',
              onClick: () => {
                queueChannelAction(channelIndex, { type: 'trigger', pattern: 'kicks' });
                onFillPattern(channelIndex, '4on4');
              },
            },
            {
              id: 'trigger-build',
              label: 'Build',
              onClick: () => {
                queueChannelAction(channelIndex, { type: 'trigger', pattern: 'build' });
                onFillPattern(channelIndex, 'build');
              },
            },
            {
              id: 'trigger-drop',
              label: 'Drop',
              onClick: () => {
                queueChannelAction(channelIndex, { type: 'trigger', pattern: 'drop' });
                onFillPattern(channelIndex, '16ths');
              },
            },
            {
              id: 'trigger-breakdown',
              label: 'Breakdown',
              onClick: () => {
                queueChannelAction(channelIndex, { type: 'trigger', pattern: 'breakdown' });
                onFillPattern(channelIndex, 'breakdown');
              },
            },
          ],
        },
        // Stutter
        {
          id: 'stutter',
          label: 'Stutter',
          icon: <Repeat size={14} />,
          onClick: () => queueChannelAction(channelIndex, { type: 'stutter' }),
        },
        // Roll submenu
        {
          id: 'roll',
          label: 'Roll',
          icon: <Radio size={14} />,
          submenu: [
            {
              id: 'roll-4',
              label: '1/4 Note',
              onClick: () => queueChannelAction(channelIndex, { type: 'roll', division: '1/4' }),
            },
            {
              id: 'roll-8',
              label: '1/8 Note',
              onClick: () => queueChannelAction(channelIndex, { type: 'roll', division: '1/8' }),
            },
            {
              id: 'roll-16',
              label: '1/16 Note',
              onClick: () => queueChannelAction(channelIndex, { type: 'roll', division: '1/16' }),
            },
          ],
        },
        { type: 'divider' },
        // Automation submenu (live)
        {
          id: 'automation',
          label: 'Automation',
          icon: <Activity size={14} />,
          submenu: [
            {
              id: 'auto-sweep-up',
              label: 'Filter Sweep Up',
              onClick: () => queueChannelAction(channelIndex, { type: 'filterSweep', direction: 'up', bars: 4 }),
            },
            {
              id: 'auto-sweep-down',
              label: 'Filter Sweep Down',
              onClick: () => queueChannelAction(channelIndex, { type: 'filterSweep', direction: 'down', bars: 4 }),
            },
            {
              id: 'auto-fade-in',
              label: 'Volume Fade In',
              onClick: () => queueChannelAction(channelIndex, { type: 'volumeFade', direction: 'in', bars: 4 }),
            },
            {
              id: 'auto-fade-out',
              label: 'Volume Fade Out',
              onClick: () => queueChannelAction(channelIndex, { type: 'volumeFade', direction: 'out', bars: 4 }),
            },
            { type: 'divider' },
            ...automationParams.slice(0, 2).map((param) => ({
              id: `auto-show-${param.id}`,
              label: `Show ${param.label}`,
              onClick: () => {
                setActiveParameter(channelIndex, param.id);
              },
            })),
          ],
        },
        { type: 'divider' },
        // Mute/Solo
        {
          id: 'mute',
          label: 'Mute',
          icon: channel.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
          checked: channel.muted,
          onClick: () => toggleChannelMute(channelIndex),
        },
        {
          id: 'solo',
          label: 'Solo',
          icon: <Headphones size={14} />,
          checked: channel.solo,
          onClick: () => toggleChannelSolo(channelIndex),
        },
        // Kill (instant silence)
        {
          id: 'kill',
          label: 'Kill',
          icon: <Zap size={14} />,
          danger: true,
          onClick: () => {
            queueChannelAction(channelIndex, { type: 'kill' });
            toggleChannelMute(channelIndex);
          },
        },
      ];
    }

    // Edit mode menu - focused on pattern editing
    return [
      // Collapse
      {
        id: 'collapse',
        label: channel.collapsed ? 'Expand Channel' : 'Collapse Channel',
        icon: channel.collapsed ? <Maximize2 size={14} /> : <Minimize2 size={14} />,
        onClick: () => {
          if (onToggleCollapse) onToggleCollapse(channelIndex);
          else toggleChannelCollapse(channelIndex);
        },
      },
      { type: 'divider' },
      // Fill submenu
      {
        id: 'fill',
        label: 'Fill',
        icon: <Music size={14} />,
        submenu: [
          // Drums category
          {
            id: 'fill-4on4',
            label: GENERATORS['4on4'].name,
            onClick: () => onFillPattern(channelIndex, '4on4'),
          },
          {
            id: 'fill-offbeat',
            label: GENERATORS.offbeat.name,
            onClick: () => onFillPattern(channelIndex, 'offbeat'),
          },
          {
            id: 'fill-backbeat',
            label: GENERATORS.backbeat.name,
            onClick: () => onFillPattern(channelIndex, 'backbeat'),
          },
          {
            id: 'fill-hihats',
            label: GENERATORS.hiHats.name,
            onClick: () => onFillPattern(channelIndex, 'hiHats'),
          },
          { type: 'divider' },
          // General category
          {
            id: 'fill-8ths',
            label: GENERATORS['8ths'].name,
            onClick: () => onFillPattern(channelIndex, '8ths'),
          },
          {
            id: 'fill-16ths',
            label: GENERATORS['16ths'].name,
            onClick: () => onFillPattern(channelIndex, '16ths'),
          },
          {
            id: 'fill-random',
            label: GENERATORS.random.name,
            onClick: () => onFillPattern(channelIndex, 'random'),
          },
          {
            id: 'fill-acid',
            label: '🎛️ Acid Generator...',
            icon: <Wand2 size={14} />,
            onClick: () => onAcidGenerator(channelIndex),
          },
          {
            id: 'fill-randomize',
            label: '🎲 Randomize...',
            icon: <Shuffle size={14} />,
            onClick: () => onRandomize(channelIndex),
          },
          { type: 'divider' },
          // Bass category
          {
            id: 'fill-syncopated',
            label: GENERATORS.syncopated.name,
            onClick: () => onFillPattern(channelIndex, 'syncopated'),
          },
          {
            id: 'fill-walking',
            label: GENERATORS.walking.name,
            onClick: () => onFillPattern(channelIndex, 'walking'),
          },
          { type: 'divider' },
          // Transitions
          {
            id: 'fill-build',
            label: GENERATORS.build.name,
            onClick: () => onFillPattern(channelIndex, 'build'),
          },
          {
            id: 'fill-breakdown',
            label: GENERATORS.breakdown.name,
            onClick: () => onFillPattern(channelIndex, 'breakdown'),
          },
        ],
      },
      // Clear
      {
        id: 'clear',
        label: 'Clear Channel',
        icon: <Trash2 size={14} />,
        onClick: () => onClearChannel(channelIndex),
      },
      // Copy/Cut/Paste (FT2 track operations)
      {
        id: 'copy',
        label: 'Copy Track',
        icon: <Copy size={14} />,
        onClick: () => onCopyChannel(channelIndex),
      },
      {
        id: 'cut',
        label: 'Cut Track',
        icon: <Scissors size={14} />,
        onClick: () => onCutChannel(channelIndex),
      },
      {
        id: 'paste',
        label: 'Paste Track',
        icon: <ClipboardPaste size={14} />,
        onClick: () => onPasteChannel(channelIndex),
      },
      { type: 'divider' },
      // FX Presets Submenu
      {
        id: 'fx-presets',
        label: 'FX Presets',
        icon: <Sparkles size={14} />,
        submenu: (() => {
          // Group presets by category
          const categories: Record<string, typeof MASTER_FX_PRESETS> = {};
          
          MASTER_FX_PRESETS.forEach(preset => {
            const cat = preset.category || 'General';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(preset);
          });

          // Convert to menu items
          return Object.keys(categories).sort().map(category => ({
            id: `fx-cat-${category.toLowerCase()}`,
            label: category,
            submenu: categories[category].map(preset => ({
              id: `fx-preset-${preset.name.replace(/\s+/g, '-')}`,
              label: preset.name,
              onClick: () => handleApplyChannelFxPreset(preset.name),
            }))
          }));
        })(),
      },
      { type: 'divider' },
      // Transpose submenu
      {
        id: 'transpose',
        label: 'Transpose',
        icon: <ArrowUpDown size={14} />,
        submenu: [
          { id: 'transpose-12', label: '+12 (Octave Up)', onClick: () => onTranspose(channelIndex, 12) },
          { id: 'transpose-7', label: '+7 (Fifth)', onClick: () => onTranspose(channelIndex, 7) },
          { id: 'transpose-1', label: '+1 (Semitone)', onClick: () => onTranspose(channelIndex, 1) },
          { type: 'divider' },
          { id: 'transpose--1', label: '-1 (Semitone)', onClick: () => onTranspose(channelIndex, -1) },
          { id: 'transpose--7', label: '-7 (Fifth)', onClick: () => onTranspose(channelIndex, -7) },
          { id: 'transpose--12', label: '-12 (Octave Down)', onClick: () => onTranspose(channelIndex, -12) },
        ],
      },
      // Humanize
      {
        id: 'humanize',
        label: 'Humanize',
        icon: <Wand2 size={14} />,
        shortcut: 'Ctrl+H',
        onClick: () => onHumanize(channelIndex),
      },
      // Interpolate
      {
        id: 'interpolate',
        label: 'Interpolate',
        icon: <TrendingUp size={14} />,
        shortcut: 'Ctrl+I',
        onClick: () => onInterpolate(channelIndex),
      },
      { type: 'divider' },
      // B/D Command Animations
      {
        id: 'bd-animations',
        label: 'B/D Animations',
        icon: <Sparkles size={14} />,
        submenu: [
          {
            id: 'bd-reverse-visual',
            label: 'Reverse Visual',
            icon: <Rewind size={14} />,
            onClick: () => onReverseVisual?.(channelIndex),
            disabled: !onReverseVisual,
          },
          { type: 'divider' },
          {
            id: 'bd-polyrhythm',
            label: 'Polyrhythm (E6x)...',
            icon: <Repeat size={14} />,
            onClick: () => onPolyrhythm?.(channelIndex),
            disabled: !onPolyrhythm,
          },
          {
            id: 'bd-fibonacci',
            label: 'Fibonacci Sequence',
            onClick: () => onFibonacci?.(channelIndex),
            disabled: !onFibonacci,
          },
          {
            id: 'bd-euclidean',
            label: 'Euclidean Pattern...',
            icon: <Shuffle size={14} />,
            onClick: () => onEuclidean?.(channelIndex),
            disabled: !onEuclidean,
          },
          { type: 'divider' },
          {
            id: 'bd-pingpong',
            label: 'Ping-Pong',
            icon: <ArrowUpDown size={14} />,
            onClick: () => onPingPong?.(channelIndex),
            disabled: !onPingPong,
          },
          {
            id: 'bd-glitch',
            label: 'Random Glitch',
            icon: <Zap size={14} />,
            onClick: () => onGlitch?.(channelIndex),
            disabled: !onGlitch,
          },
          {
            id: 'bd-strobe',
            label: 'Strobe Visual',
            icon: <Activity size={14} />,
            onClick: () => onStrobe?.(channelIndex),
            disabled: !onStrobe,
          },
          {
            id: 'bd-echo',
            label: 'Visual Echo',
            icon: <Waves size={14} />,
            onClick: () => onVisualEcho?.(channelIndex),
            disabled: !onVisualEcho,
          },
          { type: 'divider' },
          {
            id: 'bd-converge',
            label: 'Converge',
            onClick: () => onConverge?.(channelIndex),
            disabled: !onConverge,
          },
          {
            id: 'bd-spiral',
            label: 'Spiral Out',
            onClick: () => onSpiral?.(channelIndex),
            disabled: !onSpiral,
          },
          {
            id: 'bd-bounce',
            label: 'Bounce',
            onClick: () => onBounce?.(channelIndex),
            disabled: !onBounce,
          },
          {
            id: 'bd-chaos',
            label: 'Chaos',
            onClick: () => onChaos?.(channelIndex),
            disabled: !onChaos,
          },
        ],
      },
      { type: 'divider' },
      // Automation submenu (edit)
      {
        id: 'automation',
        label: 'Automation',
        icon: <Waves size={14} />,
        submenu: [
          // Quick parameter selection (NKS instrument params)
          ...automationParams.map((param) => ({
            id: `auto-${param.id}`,
            label: param.label,
            icon: <span className="w-2 h-2 rounded-full" style={{ backgroundColor: param.color }} />,
            onClick: () => {
              setActiveParameter(channelIndex, param.id);
              // Ensure the global automation lanes toggle is on
              const uiState = useUIStore.getState();
              if (!uiState.showAutomationLanes) uiState.toggleAutomationLanes();
              // Create the curve + seed point so the lane is immediately visible
              ensureAutomationCurve(param.id);
            },
          })),
          // Register-capture params (SID/Paula/Furnace) — flat list,
          // filtered to this channel only.
          ...(registerParamMenuItems.length > 0 ? [
            { type: 'divider' } as const,
            ...registerParamMenuItems,
          ] : []),
          { type: 'divider' } as const,
          // Clear all automation on this channel
          {
            id: 'auto-clear-all',
            label: 'Clear All Automation',
            icon: <Trash2 size={14} />,
            danger: true,
            disabled: !hasCurves,
            onClick: () => {
              curves.forEach((curve) => removeCurve(curve.id));
            },
          },
        ],
      },
      { type: 'divider' },
      // Mute/Solo
      {
        id: 'mute',
        label: 'Mute',
        icon: channel.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
        checked: channel.muted,
        onClick: () => toggleChannelMute(channelIndex),
      },
      {
        id: 'solo',
        label: 'Solo',
        icon: <Headphones size={14} />,
        checked: channel.solo,
        onClick: () => toggleChannelSolo(channelIndex),
      },
      // Color submenu
      {
        id: 'color',
        label: 'Color',
        icon: <Palette size={14} />,
        submenu: CHANNEL_COLORS.map((color, idx) => ({
          id: `color-${idx}`,
          label: color === null ? 'None' : '',
          icon: color ? (
            <span className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
          ) : (
            <span className="w-4 h-4 rounded border border-dark-border" />
          ),
          checked: channel.color === color,
          onClick: () => setChannelColor(channelIndex, color),
        })),
      },
      // Max voices
      {
        id: 'max-voices',
        label: 'Max Voices',
        submenu: [0, 1, 2, 4, 8, 16].map(n => ({
          id: `voices-${n}`,
          label: n === 0 ? 'Unlimited' : `${n}`,
          checked: (channel.channelMeta?.maxVoices || 0) === n,
          onClick: () => {
            useTrackerStore.getState().setChannelMeta(channelIndex, { maxVoices: n });
            import('@engine/ToneEngine').then(({ getToneEngine }) => {
              getToneEngine().setChannelMaxVoices(channelIndex, n);
            });
          },
        })),
      },
      // Delete channel
      {
        id: 'delete',
        label: 'Delete Channel',
        icon: <Minus size={14} />,
        danger: true,
        disabled: patterns[0]?.channels.length <= 1,
        onClick: () => removeChannel(channelIndex),
      },
    ];
  }, [
    isLiveMode,
    channelIndex,
    channel,
    hasCurves,
    curves,
    patterns,
    onFillPattern,
    onClearChannel,
    onCopyChannel,
    onCutChannel,
    onPasteChannel,
    onTranspose,
    onHumanize,
    onInterpolate,
    onAcidGenerator,
    onRandomize,
    onToggleCollapse,
    onReverseVisual,
    onPolyrhythm,
    onFibonacci,
    onEuclidean,
    onPingPong,
    onGlitch,
    onStrobe,
    onVisualEcho,
    onConverge,
    onSpiral,
    onBounce,
    onChaos,
    toggleChannelMute,
    toggleChannelSolo,
    removeChannel,
    setChannelColor,
    toggleChannelCollapse,
    queueChannelAction,
    setActiveParameter,
    removeCurve,
    handleApplyChannelFxPreset,
    automationParams,
    registerParamMenuItems,
  ]);

  // Apply status-message wrapping to the whole menu tree
  const menuItems = useMemo(
    () => withStatusMessages(menuItemsRaw),
    [menuItemsRaw, withStatusMessages],
  );

  return (
    <DropdownButton
      items={menuItems}
      className={`
        p-1 rounded transition-colors
        ${isLiveMode
          ? 'text-accent-error hover:bg-accent-error/20'
          : 'text-text-muted hover:text-text-primary hover:bg-dark-bgHover'
        }
      `}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </svg>
    </DropdownButton>
  );
};

