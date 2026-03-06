/**
 * PixiRemapInstrumentDialog — GL-native instrument remap dialog.
 * Visually 1:1 with DOM RemapInstrumentDialog.
 *
 * Find and replace instrument IDs throughout patterns.
 * Two number inputs (source, dest), scope label, tip box, warning.
 */

import React, { useState, useCallback } from 'react';
import { PixiModal, PixiModalHeader, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { PixiPureTextInput } from '../input/PixiPureTextInput';

interface PixiRemapInstrumentDialogProps {
  isOpen: boolean;
  scope: 'block' | 'track' | 'pattern' | 'song';
  onConfirm: (source: number, dest: number) => void;
  onCancel: () => void;
}

export const PixiRemapInstrumentDialog: React.FC<PixiRemapInstrumentDialogProps> = ({
  isOpen,
  scope,
  onConfirm,
  onCancel,
}) => {
  const [source, setSource] = useState('0');
  const [dest, setDest] = useState('0');

  const sourceNum = Math.max(0, Math.min(255, parseInt(source) || 0));
  const destNum = Math.max(0, Math.min(255, parseInt(dest) || 0));
  const isSame = sourceNum === destNum;

  const handleConfirm = useCallback(() => {
    if (!isSame) onConfirm(sourceNum, destNum);
  }, [isSame, sourceNum, destNum, onConfirm]);

  if (!isOpen) return null;

  return (
    <PixiModal isOpen={isOpen} onClose={onCancel} width={420} height={380}>
      <PixiModalHeader title={`Remap Instrument (${scope})`} onClose={onCancel} />

      <layoutContainer layout={{ flex: 1, padding: 16, flexDirection: 'column', gap: 14 }}>
        {/* Source instrument */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text="Source Instrument" size="sm" />
          <PixiPureTextInput
            value={source}
            onChange={setSource}
            onSubmit={handleConfirm}
            placeholder="0"
            width={380}
            height={32}
            fontSize={13}
          />
          <PixiLabel text="Instrument ID to find (0-255)" size="xs" color="textMuted" />
        </layoutContainer>

        {/* Destination instrument */}
        <layoutContainer layout={{ flexDirection: 'column', gap: 4 }}>
          <PixiLabel text="Destination Instrument" size="sm" />
          <PixiPureTextInput
            value={dest}
            onChange={setDest}
            onSubmit={handleConfirm}
            placeholder="0"
            width={380}
            height={32}
            fontSize={13}
          />
          <PixiLabel text="Instrument ID to replace with (0-255)" size="xs" color="textMuted" />
        </layoutContainer>

        {/* Tip box */}
        <layoutContainer layout={{
          flexDirection: 'column',
          gap: 4,
          padding: 10,
          backgroundColor: 0x1a1a2e,
          borderWidth: 1,
          borderColor: 0x333355,
          borderRadius: 4,
        }}>
          <PixiLabel text="Tip: Remap instrument replaces all occurrences of the source instrument ID with the destination ID." size="xs" color="textMuted" />
          <PixiLabel text={`Block: Only in selected region\nTrack: Entire current channel\nPattern: Entire current pattern\nSong: All patterns`} size="xs" color="textMuted" />
        </layoutContainer>

        {/* Warning when same */}
        {isSame && (
          <layoutContainer layout={{
            padding: 10,
            backgroundColor: 0x2a2a08,
            borderWidth: 1,
            borderColor: 0x665500,
            borderRadius: 4,
          }}>
            <PixiLabel text="Source and destination are the same - no changes will be made." size="xs" color="warning" />
          </layoutContainer>
        )}
      </layoutContainer>

      <PixiModalFooter align="right">
        <PixiButton label="Cancel (Esc)" variant="ghost" onClick={onCancel} />
        <PixiButton label="Remap (Enter)" variant="primary" disabled={isSame} onClick={handleConfirm} />
      </PixiModalFooter>
    </PixiModal>
  );
};
