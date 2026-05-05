/**
 * AutomationPanel - Container for automation curve editors
 * Dynamically resolves parameters from the channel's instrument via NKS maps
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CustomSelect } from '@components/common/CustomSelect';
import { useTrackerStore, useAutomationStore, useThemeStore } from '@stores';
import { AutomationCurveCanvas } from './AutomationCurve';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';
import { useAutomationRecording } from '@hooks/useAutomationRecording';
import { useFormatStore } from '@stores/useFormatStore';
import { useUIStore } from '@stores/useUIStore';
import { getParamsForFormat, groupParams, type AutomationFormat } from '../../engine/automation/AutomationParams';

export const AutomationPanel: React.FC = () => {
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPatternIndex = useTrackerStore((s) => s.currentPatternIndex);
  const getAutomation = useAutomationStore((s) => s.getAutomation);
  const setAutomation = useAutomationStore((s) => s.setAutomation);
  const setActiveParameter = useAutomationStore((s) => s.setActiveParameter);
  const setShowLane = useAutomationStore((s) => s.setShowLane);
  const recordMode = useAutomationStore((s) => s.recordMode);
  const setRecordMode = useAutomationStore((s) => s.setRecordMode);
  const copyCurve = useAutomationStore((s) => s.copyCurve);
  const pasteCurve = useAutomationStore((s) => s.pasteCurve);
  const [selectedParameter, setSelectedParameter] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<number>(0);

  // Wire up automation recording (captures knob movements during playback)
  useAutomationRecording();

  // Theme-aware colors for "has data" indicator
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';
  const hasDataBg = isCyanTheme ? 'bg-accent-highlight/20' : 'bg-orange-500/20';
  const hasDataText = isCyanTheme ? 'text-accent-highlight' : 'text-orange-400';
  const hasDataBorder = isCyanTheme ? 'border-accent-highlight' : 'border-orange-500';
  const hasDataHover = isCyanTheme ? 'hover:bg-accent-highlight/30' : 'hover:bg-orange-500/30';
  const hasDataDot = isCyanTheme ? 'bg-accent-highlight' : 'bg-orange-500';

  const pattern = patterns[currentPatternIndex];
  const numChannels = pattern?.channels.length || 4;
  const channelIndex = Math.min(selectedChannel, numChannels - 1);

  // Resolve dynamic params for this channel's instrument
  const { groups, instrumentName } = useChannelAutomationParams(channelIndex);

  // Auto-select first param when instrument changes or no param selected
  useEffect(() => {
    if (groups.length === 0) return;
    const allKeys = groups.flatMap((g) => g.params.map((p) => p.key));
    if (!selectedParameter || !allKeys.includes(selectedParameter)) {
      requestAnimationFrame(() => setSelectedParameter(allKeys[0]));
    }
  }, [groups, selectedParameter]);

  if (!pattern) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        No pattern loaded
      </div>
    );
  }

  const activeParam = selectedParameter ?? groups[0]?.params[0]?.key ?? 'tb303.cutoff';

  const automationCurve = getAutomation(pattern.id, channelIndex, activeParam);

  const handleCurveChange = (curve: typeof automationCurve) => {
    setAutomation(pattern.id, channelIndex, activeParam, curve);
    // Sync to shared store so AutomationLanes in the tracker view can show this curve
    setActiveParameter(channelIndex, activeParam);
    if (curve.points.length > 0) {
      setShowLane(channelIndex, true);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-dark-bg">
      {/* Header */}
      <div className="bg-dark-bgSecondary border-b border-dark-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text-secondary text-sm">Automation</span>
            <span className="text-text-primary font-medium">
              Pattern {String(currentPatternIndex).padStart(2, '0')}: {pattern.name}
            </span>
            {instrumentName && (
              <span className="text-text-muted text-xs">({instrumentName})</span>
            )}
          </div>

          {/* Controls: Record, Copy, Paste */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRecordMode(!recordMode)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                recordMode
                  ? 'bg-red-600 text-white border-red-500 shadow-glow-sm'
                  : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight'
              }`}
              title="Record automation from knob movements during playback"
            >
              {recordMode ? 'REC' : 'Rec'}
            </button>
            <button
              onClick={() => {
                const curve = getAutomation(pattern.id, channelIndex, activeParam);
                if (curve.id) copyCurve(curve.id);
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
              title="Copy automation curve"
            >
              Copy
            </button>
            <button
              onClick={() => pasteCurve(pattern.id, channelIndex, activeParam)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-dark-bgTertiary text-text-secondary border border-dark-border hover:border-dark-borderLight transition-colors"
              title="Paste automation curve"
            >
              Paste
            </button>
            <div className="w-px h-5 bg-dark-border mx-1" />
          </div>

          {/* Channel Selector */}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-xs">Channel:</span>
            <div className="flex gap-1">
              {Array.from({ length: numChannels }, (_, i) => {
                const channel = pattern.channels[i];
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedChannel(i)}
                    className={`
                      w-8 h-7 text-xs font-mono rounded border transition-all
                      ${channelIndex === i
                        ? 'text-text-inverse border-transparent'
                        : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                    style={channelIndex === i ? { backgroundColor: channel?.color || '#22c55e' } : undefined}
                    title={channel?.name || `Channel ${i + 1}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Selector - Grouped by NKS section */}
      <div className="border-b border-dark-border bg-dark-bgSecondary p-3">
        {groups.length > 0 ? (
          <div className="flex gap-6 flex-wrap">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-1.5">
                <div className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
                  {group.label}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {group.params.map((param) => {
                    const paramCurve = getAutomation(pattern.id, channelIndex, param.key);
                    const hasData = paramCurve.points.length > 0;
                    const isSelected = activeParam === param.key;

                    return (
                      <button
                        key={param.key}
                        onClick={() => {
                          setSelectedParameter(param.key);
                          setActiveParameter(channelIndex, param.key);
                          setShowLane(channelIndex, true);
                        }}
                        className={`
                          relative px-3 py-1.5 text-xs rounded-md border transition-all duration-150
                          ${
                            isSelected
                              ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-glow-sm'
                              : hasData
                                ? `${hasDataBg} ${hasDataText} ${hasDataBorder} ${hasDataHover}`
                                : 'bg-dark-bgTertiary text-text-secondary border-dark-border hover:border-dark-borderLight hover:text-text-primary'
                          }
                        `}
                        title={param.name + (hasData ? ' (has automation)' : '')}
                      >
                        {param.name}
                        {hasData && !isSelected && (
                          <span className={`absolute -top-1 -right-1 w-2 h-2 ${hasDataDot} rounded-full`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-text-muted text-xs">
            No instrument assigned to this channel
          </div>
        )}
      </div>

      {/* Register parameters — chip register params (SID/Paula/Furnace) */}
      <RegisterParamsSection channelIndex={channelIndex} patternId={pattern.id} numChannels={numChannels} />

      {/* Automation Curve Editor */}
      <div className="flex-1 overflow-y-auto scrollbar-modern">
        <AutomationCurveCanvas
          curve={automationCurve}
          parameter={activeParam}
          patternLength={pattern.length}
          onChange={handleCurveChange}
        />
      </div>
    </div>
  );
};

/** Register params section — chip register params selectable as automation targets */
const RegisterParamsSection: React.FC<{ channelIndex: number; patternId: string; numChannels: number }> = ({ channelIndex, patternId, numChannels }) => {
  const editorMode = useFormatStore(s => s.editorMode);
  const setActiveParameter = useAutomationStore((s) => s.setActiveParameter);
  const setShowLane = useAutomationStore((s) => s.setShowLane);
  const addCurve = useAutomationStore((s) => s.addCurve);
  const addPoint = useAutomationStore((s) => s.addPoint);
  const getCurvesForPattern = useAutomationStore((s) => s.getCurvesForPattern);
  const furnaceNative = useFormatStore(s => s.furnaceNative);

  // Selected register channel (defaults to the panel's main channel)
  const [selectedRegCh, setSelectedRegCh] = useState<number>(channelIndex);
  useEffect(() => { setSelectedRegCh(channelIndex); }, [channelIndex]);

  const fmt: AutomationFormat | null = useMemo(() => {
    if (editorMode === 'goattracker') return 'gtultra';
    if (editorMode === 'sidfactory2') return 'sidfactory2';
    if (editorMode === 'furnace') return 'furnace';
    if (editorMode === 'hively') return 'hively';
    if (editorMode === 'klystrack') return 'klystrack';
    if (editorMode === 'sc68') return 'sc68';
    if (editorMode === 'classic') return 'uade';
    return null;
  }, [editorMode]);

  const allRegisterParams = useMemo(() => {
    if (!fmt) return [];
    const config = fmt === 'furnace' && furnaceNative
      ? { chipIds: furnaceNative.chipIds, channelCount: furnaceNative.subsongs[furnaceNative.activeSubsong]?.channels.length ?? 4 }
      : undefined;
    return getParamsForFormat(fmt, config);
  }, [fmt, furnaceNative]);

  // Filter params to ONLY those for the currently selected register channel.
  // Params without a channel field (e.g. SID filter/global, format-wide
  // params) are always included so they're never hidden by the channel filter.
  const filteredParams = useMemo(() => {
    return allRegisterParams.filter((p) => p.channel === undefined || p.channel === selectedRegCh);
  }, [allRegisterParams, selectedRegCh]);

  const filteredGroups = useMemo(() => groupParams(filteredParams), [filteredParams]);

  // Ensure a curve exists with a seed point at row 0 / value 1.0 so the lane
  // is immediately visible after registering — same pattern as the other
  // automation entry points (channel header dropdown, cell context menu).
  const ensureAutomationCurve = useCallback((paramId: string) => {
    setActiveParameter(channelIndex, paramId);
    setShowLane(channelIndex, true);
    if (!useUIStore.getState().showAutomationLanes) useUIStore.getState().toggleAutomationLanes();
    const existing = getCurvesForPattern(patternId, channelIndex).find((c) => c.parameter === paramId);
    let curveId = existing?.id;
    if (!curveId) {
      curveId = addCurve(patternId, channelIndex, paramId);
      if (!curveId) return;
    }
    if (!existing || existing.points.length === 0) {
      addPoint(curveId, 0, 1);
    }
  }, [channelIndex, patternId, setActiveParameter, setShowLane, addCurve, addPoint, getCurvesForPattern]);

  if (filteredGroups.length === 0) return null;

  return (
    <div className="border-b border-dark-border bg-dark-bgSecondary p-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-text-muted text-[10px] font-medium uppercase tracking-wider">
          Register Parameters
        </span>
        {/* Channel dropdown — pick which register channel's params to show */}
        <label className="flex items-center gap-1.5 text-[10px] text-text-muted">
          <span>Channel:</span>
          <CustomSelect
            value={String(selectedRegCh)}
            onChange={(v) => setSelectedRegCh(Number(v))}
            className="px-1.5 py-0.5 text-[10px] bg-dark-bgTertiary border border-dark-border rounded text-text-secondary focus:outline-none focus:border-accent-primary"
            options={Array.from({ length: numChannels }, (_, i) => ({
              value: String(i),
              label: `Channel ${i + 1}`,
            }))}
          />
        </label>
      </div>
      <div className="flex gap-4 flex-wrap max-h-32 overflow-y-auto scrollbar-modern">
        {filteredGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <div className="text-text-muted text-[9px] font-medium uppercase tracking-wider opacity-60">
              {group.label}
            </div>
            <div className="flex gap-1 flex-wrap">
              {group.params.map((p) => (
                <button
                  key={p.id}
                  onClick={() => ensureAutomationCurve(p.id)}
                  className="px-2 py-0.5 text-[10px] rounded border transition-all bg-dark-bgTertiary text-text-muted border-dark-border hover:border-dark-borderLight hover:text-text-secondary"
                  title={`Register ${p.label} automation on channel ${channelIndex + 1}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
