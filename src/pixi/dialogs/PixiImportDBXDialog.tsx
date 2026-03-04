/**
 * PixiImportDBXDialog — GL-native project preview dialog for .dbx files.
 * Pixel-perfect match to DOM: src/components/dialogs/ImportDBXDialog.tsx
 *
 * DOM structure:
 *   backdrop bg-black/80 → PixiModal overlayAlpha=0.8
 *   container bg-dark-bgPrimary border-2 border-accent-primary rounded-xl p-6
 *     → width=448, borderRadius=12, borderWidth=2
 *   header: icon + title + filename → flexRow gap 12, mb-5 → marginBottom 20
 *   preview: name, author, description, stats grid 3-col, warning text
 *   actions: flex gap-3 justify-end → PixiModalFooter
 */

import React, { useState, useEffect } from 'react';
import { PixiModal, PixiModalFooter, PixiButton, PixiLabel } from '../components';
import { usePixiTheme } from '../theme';
import { PIXI_FONTS } from '../fonts';

interface DBXPreview {
  name: string;
  author: string;
  description: string;
  bpm: number;
  patternCount: number;
  instrumentCount: number;
}

interface PixiImportDBXDialogProps {
  isOpen: boolean;
  file: File | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const MODAL_W = 448;
const MODAL_H = 400;

// ─── Stat card — matches DOM grid-cols-3 bg-dark-bgSecondary rounded-lg p-2.5 ─
const StatCard: React.FC<{ icon: string; value: string; label: string; accentColor: number; bgColor: number }> = ({
  icon, value, label, accentColor, bgColor,
}) => (
  <layoutContainer
    layout={{
      flex: 1,
      padding: 10,
      borderRadius: 8,
      backgroundColor: bgColor,
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}
  >
    <pixiBitmapText
      text={icon}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 16, fill: 0xffffff }}
      tint={accentColor}
      layout={{}}
    />
    <pixiBitmapText
      text={value}
      style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
      tint={0xffffff}
      layout={{}}
    />
    <pixiBitmapText
      text={label}
      style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
      tint={0x888888}
      layout={{}}
    />
  </layoutContainer>
);

export const PixiImportDBXDialog: React.FC<PixiImportDBXDialogProps> = ({
  isOpen,
  file,
  onConfirm,
  onCancel,
}) => {
  const theme = usePixiTheme();
  const [preview, setPreview] = useState<DBXPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); setError(null); return; }

    setPreview(null);
    setError(null);

    file.text().then(text => {
      try {
        const data = JSON.parse(text);
        setPreview({
          name:            data.metadata?.name        || file.name.replace(/\.dbx$/i, ''),
          author:          data.metadata?.author      || '',
          description:     data.metadata?.description || '',
          bpm:             typeof data.bpm === 'number' ? data.bpm : 120,
          patternCount:    Array.isArray(data.patterns)    ? data.patterns.length    : 0,
          instrumentCount: Array.isArray(data.instruments) ? data.instruments.length : 0,
        });
      } catch {
        setError('Could not parse project file.');
      }
    }).catch(() => setError('Could not read file.'));
  }, [file]);

  if (!isOpen || !file) return null;

  return (
    <PixiModal
      isOpen={isOpen}
      onClose={onCancel}
      width={MODAL_W}
      height={MODAL_H}
      overlayAlpha={0.8}
      borderWidth={2}
      borderRadius={12}
      borderColor={theme.accent.color}
    >
      {/* Content — p-6 = padding 24 */}
      <layoutContainer layout={{ flex: 1, flexDirection: 'column', padding: 24 }}>

        {/* Header row — icon + title + filename */}
        <layoutContainer layout={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <pixiBitmapText
            text="📂"
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 20, fill: 0xffffff }}
            tint={theme.accent.color}
            layout={{}}
          />
          <layoutContainer layout={{ flexDirection: 'column', flex: 1, gap: 2 }}>
            <pixiBitmapText
              text="Load Project?"
              style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 20, fill: 0xffffff }}
              tint={0xffffff}
              layout={{}}
            />
            <pixiBitmapText
              text={file.name}
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 14, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </layoutContainer>
        </layoutContainer>

        {error ? (
          <PixiLabel text={error} size="sm" color="error" layout={{ marginBottom: 20 }} />
        ) : preview ? (
          <>
            {/* Song name + author + description */}
            <layoutContainer layout={{ flexDirection: 'column', gap: 2, marginBottom: 16 }}>
              <pixiBitmapText
                text={preview.name}
                style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 22, fill: 0xffffff }}
                tint={theme.accent.color}
                layout={{}}
              />
              {preview.author && (
                <layoutContainer layout={{ flexDirection: 'row', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  <pixiBitmapText
                    text="👤"
                    style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
                    layout={{}}
                  />
                  <PixiLabel text={preview.author} size="sm" color="textSecondary" />
                </layoutContainer>
              )}
              {preview.description && (
                <PixiLabel
                  text={preview.description}
                  size="xs"
                  color="textMuted"
                  layout={{ marginTop: 4, maxWidth: MODAL_W - 48 }}
                />
              )}
            </layoutContainer>

            {/* Stats row — grid-cols-3 gap-2 mb-5 → flexRow gap 8, marginBottom 20 */}
            <layoutContainer layout={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              <StatCard
                icon="⏱"
                value={String(preview.bpm)}
                label="BPM"
                accentColor={theme.accent.color}
                bgColor={theme.bgSecondary.color}
              />
              <StatCard
                icon="▦"
                value={String(preview.patternCount)}
                label="Patterns"
                accentColor={theme.accent.color}
                bgColor={theme.bgSecondary.color}
              />
              <StatCard
                icon="⚙"
                value={String(preview.instrumentCount)}
                label="Instruments"
                accentColor={theme.accent.color}
                bgColor={theme.bgSecondary.color}
              />
            </layoutContainer>

            {/* Warning text — text-text-muted text-xs mb-5 */}
            <PixiLabel
              text="Loading this project will replace your current work. Save first if needed."
              size="xs"
              color="textMuted"
              layout={{ marginBottom: 20, maxWidth: MODAL_W - 48 }}
            />
          </>
        ) : (
          /* Loading */
          <layoutContainer layout={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 20 }}>
            <pixiBitmapText
              text="♪"
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 16, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
            <PixiLabel text="Reading project…" size="sm" color="textMuted" />
          </layoutContainer>
        )}
      </layoutContainer>

      <PixiModalFooter>
        <PixiButton label="Cancel" variant="ghost" onClick={onCancel} />
        <PixiButton label="Load Project" variant="primary" onClick={onConfirm} disabled={!preview && !error} />
      </PixiModalFooter>
    </PixiModal>
  );
};
