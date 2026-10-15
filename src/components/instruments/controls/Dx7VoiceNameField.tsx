/**
 * Dx7VoiceNameField - the 10-character voice name (VCED bytes 145..154) as a text field. Typing is local; Enter or
 * leaving the field commits through onCommit, which the editor routes through the one VCED write path.
 */
import React, { useState } from 'react';
import { DX7_NAME_LENGTH } from '@/constants/synthLayouts/dx7';

interface Dx7VoiceNameFieldProps {
  /** The name the firmware reports (trailing spaces trimmed). */
  name: string;
  onCommit: (name: string) => void;
}

/** Printable ASCII only: the DX7 name is 10 characters of 0x20..0x7E. */
const sanitizeDx7Name = (raw: string): string => raw.replace(/[^\x20-\x7E]/g, '').slice(0, DX7_NAME_LENGTH);

export const Dx7VoiceNameField: React.FC<Dx7VoiceNameFieldProps> = ({ name, onCommit }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== name) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="flex items-center gap-2 text-[10px] font-mono text-text-secondary">
      <span className="uppercase tracking-wider">Voice Name</span>
      <input
        type="text"
        value={draft ?? name}
        maxLength={DX7_NAME_LENGTH}
        spellCheck={false}
        aria-label="Voice Name"
        onChange={(e) => setDraft(sanitizeDx7Name(e.target.value))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); } }}
        className="w-32 px-2 py-1 bg-dark-bgTertiary border border-dark-borderLight rounded text-text-primary font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent-primary"
      />
    </label>
  );
};
