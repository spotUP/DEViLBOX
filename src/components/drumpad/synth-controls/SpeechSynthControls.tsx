/**
 * Speech Synth Controls — Main container for all speech synth UIs
 * Detects speech synth type and renders appropriate controls (DECtalk/SAM/V2Speech)
 */

import React, { useMemo } from 'react';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_SAM, DEFAULT_V2_SPEECH } from '@typedefs/instrument/defaults';
import { DEFAULT_DECTALK } from '@engine/dectalk/DECtalkSynth';
import { DECtalkUI } from './DECtalkUI';
import { SAMUI } from './SAMUI';
import { V2SpeechUI } from './V2SpeechUI';

interface SpeechSynthControlsProps {
  config: InstrumentConfig;
  onChange: (config: Partial<InstrumentConfig>) => void;
}

export const SpeechSynthControls: React.FC<SpeechSynthControlsProps> = ({
  config,
  onChange
}) => {
  const speechType = useMemo(() => {
    if (config.synthType === 'DECtalk') return 'dectalk';
    if (config.synthType === 'Sam') return 'sam';
    if (config.synthType === 'V2Speech') return 'v2speech';
    return null;
  }, [config.synthType]);

  if (!speechType) {
    return (
      <div className="p-4 text-text-muted">
        No speech synth selected. Select a speech synth type to configure.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Text Input (common to all speech synths) */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-mono font-bold text-text-muted uppercase">
          Speech Text
        </label>
        <textarea
          className="w-full px-2 py-1.5 bg-dark-bgTertiary border border-dark-borderLight 
                     text-text-primary rounded resize-y min-h-[60px] font-mono text-xs
                     focus:outline-none focus:ring-1 focus:ring-accent-primary"
          value={config.dectalk?.text || config.sam?.text || config.v2Speech?.text || ''}
          onChange={(e) => {
            const newText = e.target.value;
            if (speechType === 'dectalk') {
              onChange({ dectalk: { ...DEFAULT_DECTALK, ...config.dectalk, text: newText } });
            } else if (speechType === 'sam') {
              onChange({ sam: { ...DEFAULT_SAM, ...config.sam, text: newText } });
            } else if (speechType === 'v2speech') {
              onChange({ v2Speech: { ...DEFAULT_V2_SPEECH, ...config.v2Speech, text: newText } });
            }
          }}
          placeholder={
            speechType === 'dectalk' 
              ? 'Enter text or phonemes (e.g., [:np] Hello world)' 
              : speechType === 'sam'
              ? 'Enter text or phonemes'
              : 'Enter phonemes (e.g., o: u: a:)'
          }
        />
      </div>

      {/* Synth-specific controls */}
      {speechType === 'dectalk' && (
        <DECtalkUI config={config} onChange={onChange} />
      )}

      {speechType === 'sam' && (
        <SAMUI config={config} onChange={onChange} />
      )}

      {speechType === 'v2speech' && (
        <V2SpeechUI config={config} onChange={onChange} />
      )}

      {/* Info Box */}
      <div className="p-2 bg-dark-bgTertiary rounded border border-dark-borderLight">
        <p className="text-[10px] font-mono text-text-muted">
          <span className="font-bold text-text-secondary">Tip:</span> Trigger this pad to hear the speech with current settings.
        </p>
      </div>
    </div>
  );
};
