/**
 * ChannelContextMenu - Dropdown menu for channel operations
 * Shows different options based on Live vs Edit mode
 */

import React, { useMemo, useCallback } from 'react';
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
  Eye,
  EyeOff,
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
import { GENERATORS, type GeneratorType } from '@utils/patternGenerators';
import type { ChannelData } from '@typedefs/tracker';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';
import { CHANNEL_COLORS } from '@typedefs/tracker';
import { MASTER_FX_PRESETS } from '@constants/masterFxPresets';
import { notify } from '@stores/useNotificationStore';

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
  const { toggleChannelMute, toggleChannelSolo, removeChannel, setChannelColor, toggleChannelCollapse, patterns } = useTrackerStore();
  const { setActiveParameter, setShowLane, getShowLane, removeCurve, getCurvesForPattern } = useAutomationStore();
  const { updateInstrument } = useInstrumentStore();

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

  const showLane = getShowLane(channelIndex);
  const curves = getCurvesForPattern(patternId, channelIndex);
  const hasCurves = curves.length > 0;

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

  // Build menu items based on mode
  const menuItems = useMemo((): MenuItemType[] => {
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
                setShowLane(channelIndex, true);
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
          // Quick parameter selection
          ...automationParams.map((param) => ({
            id: `auto-${param.id}`,
            label: param.label,
            icon: <span className="w-2 h-2 rounded-full" style={{ backgroundColor: param.color }} />,
            onClick: () => {
              setActiveParameter(channelIndex, param.id);
              setShowLane(channelIndex, true);
            },
          })),
          { type: 'divider' } as const,
          // Show/Hide lane
          {
            id: 'auto-toggle-lane',
            label: showLane ? 'Hide Lane' : 'Show Lane',
            icon: showLane ? <EyeOff size={14} /> : <Eye size={14} />,
            onClick: () => setShowLane(channelIndex, !showLane),
          },
          // Clear all automation
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
    showLane,
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
    setShowLane,
    removeCurve,
    handleApplyChannelFxPreset,
    automationParams,
  ]);

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

