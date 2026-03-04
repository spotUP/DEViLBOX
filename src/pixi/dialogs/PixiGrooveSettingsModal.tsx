/**
 * PixiGrooveSettingsModal — GL-native groove & swing settings dialog.
 *
 * Two-panel layout: template list (left) + intensity/resolution/humanization (right).
 * Port of src/components/dialogs/GrooveSettingsModal.tsx using Div/Txt/GlModal.
 */

import React, { useCallback, useState } from 'react';
import { useTransportStore } from '@stores/useTransportStore';
import { GROOVE_TEMPLATES } from '@typedefs/audio';
import { PixiButton, PixiCheckbox, PixiSlider } from '../components';
import { usePixiTheme } from '../theme';
import { Div, Txt, GlModal, GlModalFooter } from '../layout';
import type { FederatedWheelEvent } from 'pixi.js';

const MODAL_W = 620;
const MODAL_H = 500;
const LEFT_W = 240;
const RIGHT_W = MODAL_W - LEFT_W;

const CATEGORIES = ['straight', 'shuffle', 'swing', 'funk', 'hip-hop', 'custom'] as const;

const RESOLUTIONS: { steps: number; label: string }[] = [
  { steps: 2, label: '16th' },
  { steps: 4, label: '8th' },
  { steps: 8, label: '4th' },
  { steps: 16, label: '1b' },
  { steps: 32, label: '2b' },
  { steps: 64, label: '4b' },
];

interface PixiGrooveSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PixiGrooveSettingsModal: React.FC<PixiGrooveSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = usePixiTheme();

  const swing = useTransportStore((s) => s.swing);
  const setSwing = useTransportStore((s) => s.setSwing);
  const grooveSteps = useTransportStore((s) => s.grooveSteps);
  const setGrooveSteps = useTransportStore((s) => s.setGrooveSteps);
  const jitter = useTransportStore((s) => s.jitter);
  const setJitter = useTransportStore((s) => s.setJitter);
  const useMpcScale = useTransportStore((s) => s.useMpcScale);
  const setUseMpcScale = useTransportStore((s) => s.setUseMpcScale);
  const grooveTemplateId = useTransportStore((s) => s.grooveTemplateId);
  const setGrooveTemplate = useTransportStore((s) => s.setGrooveTemplate);

  const [scrollY, setScrollY] = useState(0);

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY((prev) => Math.max(0, prev + e.deltaY));
  }, []);

  if (!isOpen) return null;

  const swingMin = useMpcScale ? 50 : 0;
  const swingMax = useMpcScale ? 75 : 200;
  const swingDisplay = useMpcScale ? `${swing}%` : `${swing}%`;

  // Estimate total content height for scroll clamping
  const templateCount = GROOVE_TEMPLATES.length;
  const estimatedContentH = templateCount * 26 + CATEGORIES.length * 22 + 40;
  const listAreaH = MODAL_H - 44 - 44 - 32; // modal - header - footer - padding
  const maxScroll = Math.max(0, estimatedContentH - listAreaH);
  const clampedScrollY = Math.min(scrollY, maxScroll);

  return (
    <GlModal isOpen={isOpen} onClose={onClose} title="Groove & Swing Settings" width={MODAL_W} height={MODAL_H}>
      {/* Two-panel body */}
      <Div className="flex-row flex-1" layout={{ overflow: 'hidden' }}>
        {/* ── Left panel: Template list ──────────────────────────── */}
        <Div
          className="flex-col"
          layout={{
            width: LEFT_W,
            backgroundColor: theme.bgTertiary.color,
            borderRightWidth: 1,
            borderColor: theme.border.color,
            overflow: 'hidden',
          }}
        >
          <Div className="px-6 pt-6 pb-4">
            <Txt className="text-xs font-bold text-text-muted uppercase">Groove Templates</Txt>
          </Div>

          {/* Scrollable template list */}
          <Div
            className="flex-1 flex-col"
            layout={{ overflow: 'hidden' }}
            eventMode="static"
            onWheel={handleWheel}
          >
            <pixiContainer y={-clampedScrollY}>
              <Div className="flex-col gap-4 px-6 pb-6" layout={{ width: LEFT_W - 12 }}>
                {CATEGORIES.map((category) => {
                  const grooves = GROOVE_TEMPLATES.filter((g) => g.category === category);
                  if (grooves.length === 0) return null;
                  return (
                    <Div key={category} className="flex-col gap-1">
                      <Div className="px-1 pb-1" layout={{ borderBottomWidth: 1, borderColor: theme.border.color }}>
                        <Txt className="text-[10px] font-bold text-text-muted uppercase">
                          {category}
                        </Txt>
                      </Div>
                      {grooves.map((groove) => {
                        const isActive = groove.id === grooveTemplateId;
                        return (
                          <Div
                            key={groove.id}
                            className="px-3 py-2 rounded-sm"
                            layout={{
                              backgroundColor: isActive
                                ? theme.accent.color
                                : theme.bgSecondary.color,
                              borderWidth: 1,
                              borderColor: isActive
                                ? theme.accent.color
                                : 'transparent' as any,
                            }}
                            eventMode="static"
                            cursor="pointer"
                            onPointerUp={() => setGrooveTemplate(groove.id)}
                          >
                            <Txt
                              className={`text-xs font-mono ${isActive ? 'font-bold text-text-inverse' : 'text-text-secondary'}`}
                            >
                              {groove.name}
                            </Txt>
                          </Div>
                        );
                      })}
                    </Div>
                  );
                })}
              </Div>
            </pixiContainer>
          </Div>
        </Div>

        {/* ── Right panel: Settings ─────────────────────────────── */}
        <Div className="flex-1 flex-col p-6 gap-8" layout={{ overflow: 'hidden' }}>
          {/* Global Intensity section */}
          <Div
            className="flex-col gap-4 p-4 rounded"
            layout={{
              backgroundColor: theme.bgTertiary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <Div className="flex-row items-center justify-between">
              <Txt className="text-xs font-bold text-accent-primary uppercase">
                Global Intensity
              </Txt>
              <PixiCheckbox
                checked={useMpcScale}
                onChange={setUseMpcScale}
                label="MPC SCALE"
                size={10}
              />
            </Div>

            <Div className="flex-row items-center gap-3">
              <Txt className="text-[10px] text-text-muted uppercase">Amount</Txt>
              <Div className="flex-1">
                <PixiSlider
                  value={swing}
                  min={swingMin}
                  max={swingMax}
                  onChange={setSwing}
                  orientation="horizontal"
                  length={RIGHT_W - 150}
                  thickness={6}
                  handleWidth={14}
                  handleHeight={14}
                  defaultValue={useMpcScale ? 50 : 100}
                  step={1}
                  color={theme.accent.color}
                />
              </Div>
              <Txt className="text-sm font-bold font-mono text-accent-primary">
                {swingDisplay}
              </Txt>
            </Div>

            <Div className="flex-row justify-between px-1">
              <Txt className="text-[10px] text-text-muted">
                {useMpcScale ? '50%' : 'Fixed'}
              </Txt>
              <Txt className="text-[10px] text-text-muted">
                {useMpcScale ? '66%' : '100%'}
              </Txt>
              <Txt className="text-[10px] text-text-muted">
                {useMpcScale ? '75%' : '200%'}
              </Txt>
            </Div>
          </Div>

          {/* Swing Resolution section */}
          <Div
            className="flex-col gap-4 p-4 rounded"
            layout={{
              backgroundColor: theme.bgTertiary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <Txt className="text-xs font-bold text-accent-primary uppercase">
              Swing Resolution
            </Txt>

            <Div className="flex-row flex-wrap gap-2">
              {RESOLUTIONS.map(({ steps, label }) => (
                <PixiButton
                  key={steps}
                  label={`${label}\n(${steps} stp)`}
                  variant="ft2"
                  size="sm"
                  active={grooveSteps === steps}
                  width={58}
                  height={34}
                  onClick={() => setGrooveSteps(steps)}
                />
              ))}
            </Div>

            <Txt className="text-[10px] text-text-muted">
              Determines which notes in the cycle are swung. 16th is standard.
            </Txt>
          </Div>

          {/* Humanization (Jitter) section */}
          <Div
            className="flex-col gap-4 p-4 rounded"
            layout={{
              backgroundColor: theme.bgTertiary.color,
              borderWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <Div className="flex-row items-center justify-between">
              <Txt className="text-xs font-bold uppercase" layout={{}} alpha={1}>
                Humanization (Jitter)
              </Txt>
              <Txt className="text-sm font-bold font-mono text-accent-primary">
                {`${jitter}%`}
              </Txt>
            </Div>

            <PixiSlider
              value={jitter}
              min={0}
              max={100}
              onChange={setJitter}
              orientation="horizontal"
              length={RIGHT_W - 60}
              thickness={6}
              handleWidth={14}
              handleHeight={14}
              defaultValue={0}
              step={1}
              color={theme.accent.color}
            />

            <Div className="flex-row justify-between px-1">
              <Txt className="text-[10px] text-text-muted">Robotic</Txt>
              <Txt className="text-[10px] text-text-muted">Loose</Txt>
              <Txt className="text-[10px] text-text-muted">Drunken</Txt>
            </Div>
          </Div>
        </Div>
      </Div>

      {/* Footer */}
      <GlModalFooter>
        <Txt className="text-[10px] text-text-muted" layout={{ flex: 1 }}>
          Groove affects all patterns globally
        </Txt>
        <PixiButton label="Accept" variant="primary" width={80} onClick={onClose} />
      </GlModalFooter>
    </GlModal>
  );
};
