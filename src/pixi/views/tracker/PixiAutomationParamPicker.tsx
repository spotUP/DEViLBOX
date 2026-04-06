/**
 * PixiAutomationParamPicker — Per-channel parameter picker for automation lanes.
 * Renders as a compact row of colored pills showing active params, plus an add (+) button
 * that cycles through available params.
 */

import React, { useCallback } from 'react';
import { PixiButton } from '../../components/PixiButton';
import { useAutomationStore } from '@stores';
import { useChannelAutomationParams } from '@hooks/useChannelAutomationParams';

interface PixiAutomationParamPickerProps {
  channelIndex: number;
  patternId?: string;
  channelWidth: number;
}

const PILL_H = 14;

export const PixiAutomationParamPicker: React.FC<PixiAutomationParamPickerProps> = ({
  channelIndex,
  patternId,
  channelWidth,
}) => {
  const { params } = useChannelAutomationParams(channelIndex);

  const addActiveParameter = useAutomationStore(s => s.addActiveParameter);
  const removeActiveParameter = useAutomationStore(s => s.removeActiveParameter);
  const getActiveParameters = useAutomationStore(s => s.getActiveParameters);
  const setShowLane = useAutomationStore(s => s.setShowLane);
  const addCurve = useAutomationStore(s => s.addCurve);
  const addPoint = useAutomationStore(s => s.addPoint);
  const getCurvesForPattern = useAutomationStore(s => s.getCurvesForPattern);

  const activeParams = getActiveParameters(channelIndex);

  // Cycle to next available param
  const handleAddClick = useCallback(() => {
    const available = params.filter(p => !activeParams.includes(p.key));
    if (available.length === 0) return;
    const paramKey = available[0].key;
    addActiveParameter(channelIndex, paramKey);
    setShowLane(channelIndex, true);
    // Seed a curve point so the lane is immediately visible
    if (patternId) {
      const curves = getCurvesForPattern(patternId, channelIndex);
      const existing = curves.find((c) => c.parameter === paramKey);
      let curveId = existing?.id;
      if (!curveId) {
        curveId = addCurve(patternId, channelIndex, paramKey);
      }
      if (curveId && (!existing || existing.points.length === 0)) {
        addPoint(curveId, 0, 1);
      }
    }
  }, [params, activeParams, channelIndex, patternId, addActiveParameter, setShowLane, addCurve, addPoint, getCurvesForPattern]);

  if (params.length === 0 || channelWidth < 30) return null;

  return (
    <layoutContainer
      layout={{
        flexDirection: 'row',
        gap: 2,
        alignItems: 'center',
        height: PILL_H + 4,
        width: channelWidth,
        paddingLeft: 2,
        overflow: 'hidden',
      }}
    >
      {activeParams.slice(0, 3).map((paramKey) => {
        const param = params.find(p => p.key === paramKey);
        if (!param) return null;
        return (
          <PixiButton
            key={paramKey}
            label={param.shortLabel}
            variant="ghost"
            size="sm"
            onClick={() => removeActiveParameter(channelIndex, paramKey)}
            width={28}
            height={PILL_H}
          />
        );
      })}

      {activeParams.length < params.length && (
        <PixiButton
          label="+"
          variant="ghost"
          size="sm"
          onClick={handleAddClick}
          width={16}
          height={PILL_H}
        />
      )}
    </layoutContainer>
  );
};
