/**
 * PixiImportFurnaceDialog — GL-native import dialog for Furnace (.fur) and
 * DefleMask (.dmf) files.
 *
 * Parses the file locally with parseFurnaceSong() to extract rich metadata
 * before committing to the import.  Displays chip system, author, subsong list,
 * and lets the user choose which subsong to import.
 *
 * DOM reference: src/components/dialogs/ImportFurnaceDialog.tsx
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  PixiModal,
  PixiModalHeader,
  PixiModalFooter,
  PixiButton,
  PixiLabel,
  PixiScrollView,
} from '../components';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { usePixiTheme } from '../theme';
import type { ModuleInfo } from '@/lib/import/ModuleLoader';
import type { ImportOptions } from '@/components/dialogs/ImportModuleDialog';
import type { FurnaceModule } from '@/lib/import/formats/FurnaceSongParser';

// ── Props ──────────────────────────────────────────────────────────────────────

interface PixiImportFurnaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (info: ModuleInfo, options: ImportOptions) => void;
  initialFile?: File | null;
}

// ── Chip name lookup (from Furnace system IDs) ─────────────────────────────
const CHIP_NAMES: Record<number, string> = {
  0x00: 'None',
  0x01: 'YMU759',
  0x02: 'Genesis (YM2612+SN76489)',
  0x03: 'SMS (SN76489)',
  0x04: 'Game Boy (DMG)',
  0x05: 'PC Engine (HuC6280)',
  0x06: 'NES (2A03)',
  0x07: 'C64 (6581)',
  0x08: 'Amiga (Paula)',
  0x09: 'YM2151',
  0x0A: 'YM2612',
  0x0B: 'TIA',
  0x0C: 'SAA1099',
  0x0D: 'AY-3-8910',
  0x0E: 'AY8930',
  0x0F: 'POKEY',
  0x10: 'QSound',
  0x11: 'ZX Spectrum Beeper',
  0x12: 'YM2203',
  0x13: 'YM2608',
  0x14: 'YM2610',
  0x15: 'YM2610B',
  0x16: 'YM2610B (OPN2C variant)',
  0x17: 'SMS + YM2413',
  0x18: 'NeoGeo (YM2610+SSG)',
  0x19: 'MSX (AY-3-8910)',
  0x1A: 'OPL (YM3526)',
  0x1B: 'OPL2 (YM3812)',
  0x1C: 'OPL3 (YMF262)',
  0x1D: 'MultiPCM',
  0x1E: 'PC Speaker',
  0x1F: 'Dummy System',
  0x20: 'YM2413',
  0x21: 'SN76489 (extra)',
  0x22: 'OPN2 (YM2612)',
  0x23: 'OPM (YM2151)',
  0x24: 'NES + VRC6',
  0x25: 'NES + VRC7',
  0x26: 'NES + FDS',
  0x27: 'NES + MMC5',
  0x28: 'NES + Namco 163',
  0x29: 'NES + Sunsoft 5B',
  0x2A: 'SNES (SPC700)',
  0x2B: 'Virtual Boy (VSU)',
  0x2C: 'MSX + SCC',
  0x2D: 'RF5C68',
  0x2E: 'WonderSwan',
  0x2F: 'Coleco ColecoVision (SN76489)',
  0x30: 'OPL4 (YMF278)',
  0x31: 'OPLL (YM2413)',
  0x32: 'NES (extra)',
  0x33: 'OPN (YM2203, extra)',
  0x34: 'PC-88 (OPNA+SSG)',
  0x35: 'GBA (Direct Sound)',
  0x36: 'KurumiOscillator',
  0x37: 'OPL2 (4-op)',
  0x38: 'OPL3 (4-op)',
  0x39: 'YM2610',
  0x3A: 'ZX Spectrum AY',
  0x3B: 'SCC+',
  0x42: 'C64 (8580)',
  0x43: 'YM2612 (Ext. Ch3)',
  0x46: 'GBC (extra)',
  0x47: 'PC-98 (OPNA)',
  0x48: 'Lynx',
  0x4A: 'OPZ (YM2414)',
  0x4C: 'X1-010',
  0x4D: 'VERA',
  0x4F: 'Sega PCM',
  0x50: 'Namco 163',
  0x53: 'ESFM',
  0xAA: 'Sega Master System',
};

function getChipName(id: number): string {
  return CHIP_NAMES[id] ?? `Chip 0x${id.toString(16).toUpperCase()}`;
}

// ── Layout constants ───────────────────────────────────────────────────────────

const MODAL_W = 500;
const MODAL_H = 520;
const CONTENT_W = MODAL_W - 26;
const CHIP_ROW_H = 20;
const STAT_CELL_W = Math.floor(CONTENT_W / 3) - 8;

// ── Component ──────────────────────────────────────────────────────────────────

export const PixiImportFurnaceDialog: React.FC<PixiImportFurnaceDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  initialFile,
}) => {
  const theme = usePixiTheme();
  const [module, setModule] = useState<FurnaceModule | null>(null);
  const [moduleBuffer, setModuleBuffer] = useState<ArrayBuffer | null>(null);
  const [moduleFile, setModuleFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubsong, setSelectedSubsong] = useState(0);

  // ── File parsing ───────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (file: File) => {
    if (!/\.(fur|dmf)$/i.test(file.name)) {
      setError('Please select a Furnace (.fur) or DefleMask (.dmf) file.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setModule(null);
    setModuleBuffer(null);
    setModuleFile(null);
    setSelectedSubsong(0);

    try {
      const buf = await file.arrayBuffer();
      const { parseFurnaceSong } = await import('@/lib/import/formats/FurnaceSongParser');
      const parsed = await parseFurnaceSong(buf);
      setModule(parsed);
      setModuleBuffer(buf);
      setModuleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse Furnace file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-parse initialFile on mount / open
  useEffect(() => {
    if (initialFile && isOpen) {
      handleFileSelect(initialFile);
    }
  }, [initialFile, isOpen, handleFileSelect]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(() => {
    if (!module || !moduleBuffer || !moduleFile) return;
    const info: ModuleInfo = {
      metadata: {
        title: module.name || moduleFile.name.replace(/\.[^/.]+$/, ''),
        type: 'Furnace',
        channels: module.chans,
        patterns: module.patterns.size,
        orders: module.subsongs[selectedSubsong]?.ordersLen ?? 0,
        instruments: module.instruments.length,
        samples: module.samples.length,
        duration: 0,
      },
      arrayBuffer: moduleBuffer,
      file: moduleFile,
    };
    onImport(info, { useLibopenmpt: false, subsong: selectedSubsong });
    onClose();
  }, [module, moduleBuffer, moduleFile, selectedSubsong, onImport, onClose]);

  const handleClose = useCallback(() => {
    setModule(null);
    setModuleBuffer(null);
    setModuleFile(null);
    setError(null);
    setSelectedSubsong(0);
    onClose();
  }, [onClose]);

  // ── Derived state ─────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const subsong = module?.subsongs[selectedSubsong] ?? module?.subsongs[0];
  const bpm = subsong
    ? Math.round(2.5 * (subsong.hz || 60) * ((subsong.virtualTempo || 150) / (subsong.virtualTempoD || 150)))
    : 0;

  const subsongOptions: SelectOption[] = (module?.subsongs ?? []).map((ss, i) => ({
    value: String(i),
    label: `${i + 1}. ${ss.name || `Subsong ${i + 1}`}${i === 0 ? ' (default)' : ''}`,
  }));

  return (
    <PixiModal isOpen={isOpen} onClose={handleClose} width={MODAL_W} height={MODAL_H}>
      <PixiModalHeader title="Import Furnace Module" onClose={handleClose} width={MODAL_W} />

      <layoutContainer layout={{ flex: 1, padding: 12, flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

        {/* Loading state */}
        {isLoading && (
          <layoutContainer layout={{ alignItems: 'center', justifyContent: 'center', height: 60 }}>
            <PixiLabel text="Parsing Furnace file…" size="sm" color="textMuted" />
          </layoutContainer>
        )}

        {/* Error state */}
        {error && (
          <layoutContainer
            layout={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              borderRadius: 6,
              borderWidth: 1,
              backgroundColor: 0x3B1515,
              borderColor: 0x7F2020,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="⚠" size="sm" color="error" />
            <PixiLabel text={error} size="xs" color="error" layout={{ maxWidth: CONTENT_W - 40 }} />
          </layoutContainer>
        )}

        {/* No file prompt */}
        {!module && !isLoading && !error && (
          <layoutContainer
            layout={{
              alignItems: 'center',
              justifyContent: 'center',
              height: 80,
              borderWidth: 2,
              borderColor: theme.border.color,
              borderRadius: 8,
              width: CONTENT_W,
            }}
          >
            <PixiLabel text="Drop a .fur or .dmf file to import" size="sm" color="textMuted" />
            <PixiLabel text="Furnace tracker and DefleMask modules" size="xs" color="textMuted" />
          </layoutContainer>
        )}

        {/* Module metadata */}
        {module && (
          <>
            {/* Title + version badge */}
            <layoutContainer
              layout={{
                flexDirection: 'column',
                gap: 6,
                padding: 12,
                borderRadius: 8,
                borderWidth: 1,
                backgroundColor: theme.bg.color,
                borderColor: theme.border.color,
                width: CONTENT_W,
              }}
            >
              {/* Title row */}
              <layoutContainer layout={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: CONTENT_W - 24 }}>
                <layoutContainer layout={{ flexDirection: 'column', gap: 2, flexShrink: 1 }}>
                  <PixiLabel
                    text={module.name || moduleFile?.name.replace(/\.[^/.]+$/, '') || 'Untitled'}
                    size="sm"
                    weight="semibold"
                    color="text"
                  />
                  {module.author ? (
                    <PixiLabel text={`by ${module.author}`} size="xs" color="textMuted" />
                  ) : null}
                </layoutContainer>
                <layoutContainer
                  layout={{
                    paddingLeft: 6,
                    paddingRight: 6,
                    paddingTop: 2,
                    paddingBottom: 2,
                    borderRadius: 4,
                    backgroundColor: theme.accent.color,
                  }}
                >
                  <PixiLabel text={`Furnace v${module.version}`} size="xs" weight="semibold" color="text" />
                </layoutContainer>
              </layoutContainer>

              {/* Chip / system badges */}
              {module.systems.length > 0 && (
                <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, width: CONTENT_W - 24 }}>
                  {module.systems.map((chipId, i) => {
                    const chanLabel = module.systemChans[i] ? ` ${module.systemChans[i]}ch` : '';
                    return (
                      <layoutContainer
                        key={i}
                        layout={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          height: CHIP_ROW_H,
                          paddingLeft: 6,
                          paddingRight: 6,
                          borderRadius: 4,
                          borderWidth: 1,
                          backgroundColor: theme.bgSecondary.color,
                          borderColor: theme.border.color,
                        }}
                      >
                        <PixiLabel text={getChipName(chipId) + chanLabel} size="xs" color="text" />
                      </layoutContainer>
                    );
                  })}
                </layoutContainer>
              )}

              {/* Stats grid (3 columns) */}
              <layoutContainer layout={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: CONTENT_W - 24 }}>
                <layoutContainer layout={{ flexDirection: 'column', width: STAT_CELL_W }}>
                  <PixiLabel text="Channels" size="xs" color="textMuted" />
                  <PixiLabel text={String(module.chans)} size="xs" font="mono" color="text" />
                </layoutContainer>
                <layoutContainer layout={{ flexDirection: 'column', width: STAT_CELL_W }}>
                  <PixiLabel text="Instruments" size="xs" color="textMuted" />
                  <PixiLabel text={String(module.instruments.length)} size="xs" font="mono" color="text" />
                </layoutContainer>
                <layoutContainer layout={{ flexDirection: 'column', width: STAT_CELL_W }}>
                  <PixiLabel text="Samples" size="xs" color="textMuted" />
                  <PixiLabel text={String(module.samples.length)} size="xs" font="mono" color="text" />
                </layoutContainer>
                <layoutContainer layout={{ flexDirection: 'column', width: STAT_CELL_W }}>
                  <PixiLabel text="Subsongs" size="xs" color="textMuted" />
                  <PixiLabel text={String(module.subsongs.length)} size="xs" font="mono" color="text" />
                </layoutContainer>
                {subsong && (
                  <>
                    <layoutContainer layout={{ flexDirection: 'column', width: STAT_CELL_W }}>
                      <PixiLabel text="Pattern len" size="xs" color="textMuted" />
                      <PixiLabel text={`${subsong.patLen} rows`} size="xs" font="mono" color="text" />
                    </layoutContainer>
                    <layoutContainer layout={{ flexDirection: 'column', width: STAT_CELL_W }}>
                      <PixiLabel text="BPM" size="xs" color="textMuted" />
                      <PixiLabel text={`${bpm} @ ${subsong.hz}Hz`} size="xs" font="mono" color="text" />
                    </layoutContainer>
                  </>
                )}
              </layoutContainer>

              {/* Song comment */}
              {module.comment ? (
                <layoutContainer
                  layout={{
                    padding: 6,
                    borderRadius: 4,
                    borderWidth: 1,
                    backgroundColor: theme.bgSecondary.color,
                    borderColor: theme.border.color,
                    width: CONTENT_W - 24,
                    maxHeight: 60,
                    overflow: 'hidden',
                  }}
                >
                  <PixiLabel text={module.comment} size="xs" font="mono" color="textMuted" />
                </layoutContainer>
              ) : null}
            </layoutContainer>

            {/* Subsong picker (only when > 1) */}
            {module.subsongs.length > 1 && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 6,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: theme.bg.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                }}
              >
                <PixiLabel text="Import Subsong" size="xs" weight="semibold" color="text" />
                <PixiSelect
                  options={subsongOptions}
                  value={String(selectedSubsong)}
                  onChange={(v) => setSelectedSubsong(Number(v))}
                  width={CONTENT_W - 24}
                />
                {subsong?.comment ? (
                  <PixiLabel text={subsong.comment} size="xs" color="textMuted" />
                ) : null}
              </layoutContainer>
            )}

            {/* Instrument list */}
            {module.instruments.length > 0 && (
              <layoutContainer
                layout={{
                  flexDirection: 'column',
                  gap: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  backgroundColor: theme.bg.color,
                  borderColor: theme.border.color,
                  width: CONTENT_W,
                  overflow: 'hidden',
                }}
              >
                <layoutContainer layout={{ paddingLeft: 12, paddingTop: 8 }}>
                  <PixiLabel text={`Instruments (${module.instruments.length})`} size="xs" weight="semibold" color="text" />
                </layoutContainer>
                <PixiScrollView
                  width={CONTENT_W - 2}
                  height={Math.min(100, module.instruments.length * 18 + 8)}
                  contentHeight={module.instruments.length * 18 + 8}
                >
                  <layoutContainer layout={{ flexDirection: 'column', padding: 4, gap: 0 }}>
                    {module.instruments.map((ins, i) => (
                      <layoutContainer
                        key={i}
                        layout={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          height: 18,
                          paddingLeft: 8,
                        }}
                      >
                        <PixiLabel
                          text={String(i).padStart(2, '0')}
                          size="xs"
                          font="mono"
                          color="textMuted"
                          layout={{ width: 20 }}
                        />
                        <PixiLabel text={ins.name || `Instrument ${i}`} size="xs" color="text" />
                      </layoutContainer>
                    ))}
                  </layoutContainer>
                </PixiScrollView>
              </layoutContainer>
            )}

            {/* Info note */}
            <PixiLabel
              text="Furnace files are imported using the native parser. Chip-specific instruments are preserved."
              size="xs"
              color="textMuted"
              layout={{ width: CONTENT_W }}
            />
          </>
        )}
      </layoutContainer>

      <PixiModalFooter width={MODAL_W}>
        <PixiButton label="Cancel" variant="ghost" onClick={handleClose} />
        <PixiButton label="Import Module" variant="primary" onClick={handleImport} disabled={!module} />
      </PixiModalFooter>
    </PixiModal>
  );
};
