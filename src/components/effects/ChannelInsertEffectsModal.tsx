/**
 * ChannelInsertEffectsModal — Edit channel insert effect parameters.
 *
 * Two-column layout: left lists insert effects with enabled toggle + wet%,
 * right shows EffectParameterEditor for the selected effect.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMixerStore } from '@stores/useMixerStore';
import { useModalClose } from '@hooks/useDialogKeyboard';
import { EffectParameterEditor } from './EffectParameterEditor';
import type { EffectConfig } from '@typedefs/instrument';

interface ChannelInsertEffectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelIndex: number;
}

export const ChannelInsertEffectsModal: React.FC<ChannelInsertEffectsModalProps> = ({
  isOpen,
  onClose,
  channelIndex,
}) => {
  const insertEffects = useMixerStore(s => s.channels[channelIndex]?.insertEffects ?? []);
  const updateChannelInsertEffect = useMixerStore(s => s.updateChannelInsertEffect);

  const [selectedIndex, setSelectedIndex] = useState(0);

  // configRef pattern — avoid stale state in callbacks
  const effectsRef = useRef(insertEffects);
  useEffect(() => { effectsRef.current = insertEffects; }, [insertEffects]);

  useModalClose({ isOpen, onClose, enableEnter: false });

  // Clamp selectedIndex when effects list changes
  useEffect(() => {
    if (selectedIndex >= insertEffects.length && insertEffects.length > 0) {
      setSelectedIndex(insertEffects.length - 1);
    }
  }, [insertEffects.length, selectedIndex]);

  const selectedEffect: EffectConfig | undefined = insertEffects[selectedIndex];

  const handleUpdateParameter = useCallback((key: string, value: number | string) => {
    const effects = effectsRef.current;
    const fx = effects[selectedIndex];
    if (!fx) return;
    updateChannelInsertEffect(channelIndex, selectedIndex, {
      parameters: { ...fx.parameters, [key]: value },
    });
  }, [channelIndex, selectedIndex, updateChannelInsertEffect]);

  const handleWetChange = useCallback((wet: number) => {
    updateChannelInsertEffect(channelIndex, selectedIndex, { wet });
  }, [channelIndex, selectedIndex, updateChannelInsertEffect]);

  const handleToggle = useCallback((index: number) => {
    const effects = effectsRef.current;
    const fx = effects[index];
    if (!fx) return;
    updateChannelInsertEffect(channelIndex, index, { enabled: !fx.enabled });
  }, [channelIndex, updateChannelInsertEffect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-primary border border-border-primary rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary">
          <span className="text-sm font-medium text-text-primary">
            Channel {channelIndex + 1} Insert Effects
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none">
            ✕
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex" style={{ height: '60vh' }}>
          {insertEffects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm px-8 text-center">
              No insert effects. Use the FX preset button on the channel strip to add effects.
            </div>
          ) : (
            <>
              {/* Left column: effect list */}
              <div className="w-[180px] border-r border-border-primary overflow-y-auto">
                {insertEffects.map((fx, i) => (
                  <button
                    key={fx.id}
                    onClick={() => setSelectedIndex(i)}
                    className={`w-full text-left px-3 py-2 border-b border-border-primary transition-colors ${
                      i === selectedIndex
                        ? 'bg-accent-primary/10 text-text-primary'
                        : 'text-text-muted hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Enabled toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggle(i); }}
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 border ${
                          fx.enabled
                            ? 'bg-accent-primary border-accent-primary'
                            : 'bg-transparent border-text-muted'
                        }`}
                        title={fx.enabled ? 'Disable' : 'Enable'}
                      />
                      <span className="text-xs font-mono truncate">{fx.type}</span>
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5 pl-[18px]">
                      wet: {Math.round(fx.wet)}%
                    </div>
                  </button>
                ))}
              </div>

              {/* Right column: parameter editor */}
              <div className="flex-1 overflow-y-auto">
                {selectedEffect ? (
                  <EffectParameterEditor
                    effect={selectedEffect}
                    onUpdateParameter={handleUpdateParameter}
                    onUpdateWet={handleWetChange}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-text-muted text-sm">
                    Select an effect to edit
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
