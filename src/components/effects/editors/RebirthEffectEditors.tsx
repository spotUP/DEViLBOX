/**
 * Ported from varyform/re-rebirth (no licence granted yet) - do not push until licensed.
 *
 * Effect editors for the four ReBirth effects: each renders the original canvas module.
 */
import React from 'react';
import { EffectPanel, type RebirthEffectFamily } from '@components/instruments/rebirth/EffectPanel';
import type { VisualEffectEditorProps } from './shared';

function makeEditor(family: RebirthEffectFamily): React.FC<VisualEffectEditorProps> {
  const Editor: React.FC<VisualEffectEditorProps> = ({ effect, onUpdateParameter }) => {
    const config: Record<string, number | undefined> = {};
    for (const [key, value] of Object.entries(effect.parameters)) {
      if (typeof value === 'number') config[key] = value;
    }
    return (
      <EffectPanel
        family={family}
        config={config}
        onChange={(updates) => {
          for (const [key, value] of Object.entries(updates)) onUpdateParameter(key, value);
        }}
      />
    );
  };
  return Editor;
}

export const ReBirthDistortionEditor = makeEditor('dist');
export const ReBirthDelayEditor = makeEditor('delay');
export const ReBirthCompressorEditor = makeEditor('comp');
export const ReBirthPatternFilterEditor = makeEditor('pcf');
