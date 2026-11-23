/**
 * ExportDialog - Export/Import Dialog Component
 * Provides UI for exporting songs, SFX, and instruments
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, Download, Upload, FileMusic, Zap, Settings, Volume2, Music2, Cpu, Cable } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { saveAs } from 'file-saver';
import { useExportDialog } from '@hooks/dialogs/useExportDialog';
import { AudioExportPanel } from './AudioExportPanel';
import { MidiExportPanel } from './MidiExportPanel';
import { ModuleExportPanel } from './ModuleExportPanel';
import { ChipExportPanel } from './ChipExportPanel';
import { notify } from '@stores/useNotificationStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { NES_REGION_LABELS, type NesRegionChoice } from './nes/nesExport';
import { AY_SCRAMBLE_TARGETS, type AyScrambleTarget } from './FurnaceExporter';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose }) => {
  const ex = useExportDialog({ isOpen });

  const [chipExtension, setChipExtension] = useState('vgm');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioHandlerRef = useRef<(() => Promise<false | void>) | null>(null);
  const midiHandlerRef = useRef<(() => Promise<false | void>) | null>(null);
  const moduleHandlerRef = useRef<(() => Promise<false | void>) | null>(null);
  const chipHandlerRef = useRef<(() => Promise<false | void>) | null>(null);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      switch (ex.exportMode) {
        case 'song':
          return await ex.handleExportSong(onClose);

        case 'sfx':
          return await ex.handleExportSFX(onClose);

        case 'instrument':
          return await ex.handleExportInstrument(onClose);

        case 'audio': {
          if (await audioHandlerRef.current?.() === false) return;
          break;
        }

        case 'midi': {
          if (await midiHandlerRef.current?.() === false) return;
          break;
        }

        case 'xm':
        case 'mod':
        case 'it':
        case 's3m': {
          if (await moduleHandlerRef.current?.() === false) return;
          break;
        }

        case 'chip': {
          if (await chipHandlerRef.current?.() === false) return;
          break;
        }

        case 'fur':
          return await ex.handleExportFur((b, n) => saveAs(b, n), onClose);

        case 'furText':
          return await ex.handleExportFurText((b, n) => saveAs(b, n), onClose);

        case 'zxTap':
          return await ex.handleExportZxTap((b, n) => saveAs(b, n), onClose);
        case 'vectrexCart':
          return await ex.handleExportVectrexCart((b, n) => saveAs(b, n), onClose);
        case 'nesRom':
          return await ex.handleExportNesRom((b, n) => saveAs(b, n), onClose);
        case 'gbRom':
          return await ex.handleExportGbRom((b, n) => saveAs(b, n), onClose);
        case 'mdRom':
          return await ex.handleExportMdRom((b, n) => saveAs(b, n), onClose);
        case 'pceRom':
          return await ex.handleExportPceRom((b, n) => saveAs(b, n), onClose);
        case 'c64Prg':
          return await ex.handleExportC64Prg((b, n) => saveAs(b, n), onClose);
        case 'smsRom':
          return await ex.handleExportSmsRom(false, (b, n) => saveAs(b, n), onClose);
        case 'ggRom':
          return await ex.handleExportSmsRom(true, (b, n) => saveAs(b, n), onClose);
        case 'nsfe':
          return await ex.handleExportNsfe((b, n) => saveAs(b, n), onClose);
        case 'zxBeeperTap':
          return await ex.handleExportZxBeeperTap((b, n) => saveAs(b, n), onClose);
        case 'zxQuadToneTap':
          return await ex.handleExportZxQuadToneTap((b, n) => saveAs(b, n), onClose);
        case 'furAy':
          return await ex.handleExportFurAy((b, n) => saveAs(b, n), onClose);

        case 'snesRom':
          return await ex.handleExportSnesRom((b, n) => saveAs(b, n), onClose);
        case 'tad':
          return await ex.handleExportTad((b, n) => saveAs(b, n), onClose);

        case 'nano':
          return await ex.handleExportNano((b, n) => saveAs(b, n), onClose);

        case 'native':
          return await ex.handleExportNative((b, n) => saveAs(b, n), onClose);
        case 'adf':
          return await ex.handleExportAdf((b, n) => saveAs(b, n), onClose);
      }

      // Only close if no warnings (warnings will show in dialog)
      if (ex.exportMode !== 'xm' && ex.exportMode !== 'mod' && ex.exportMode !== 'it' && ex.exportMode !== 's3m') {
        onClose();
      }
    } catch (error) {
      // A refusal (e.g. notes a format cannot hold) is the user's to read, not the console's
      console.error('Export failed:', error);
      notify.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = ''; // Reset for re-selection
    await ex.handleImportFile(file, onClose);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-bg border border-dark-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-fade-in">
        {/* Header */}
        <div className="bg-dark-bgTertiary border-b border-dark-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-bold text-text-primary">
            Export / Import
          </h2>
          <button
            onClick={onClose}
            className="btn-icon"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="bg-dark-bgSecondary border-b border-dark-border flex">
          <button
            onClick={() => ex.setDialogMode('export')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-all border-r border-dark-border flex items-center justify-center gap-2
              ${ex.dialogMode === 'export'
                ? 'bg-accent-primary text-text-inverse font-bold'
                : 'text-text-secondary hover:bg-dark-bgHover'
              }
            `}
          >
            <Download size={16} />
            Export
          </button>
          <button
            onClick={() => ex.setDialogMode('import')}
            className={`
              flex-1 px-4 py-3 font-mono text-sm transition-all flex items-center justify-center gap-2
              ${ex.dialogMode === 'import'
                ? 'bg-accent-primary text-text-inverse font-bold'
                : 'text-text-secondary hover:bg-dark-bgHover'
              }
            `}
          >
            <Upload size={16} />
            Import
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-modern p-5">
          {ex.dialogMode === 'export' ? (
            <>
              {/* Export Mode Selection */}
              <div className="mb-5">
                <label className="block text-xs font-mono text-text-muted mb-3">
                  EXPORT MODE
                </label>
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
                  {ex.validModes.has('song') && (
                  <button
                    onClick={() => ex.setExportMode('song')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'song'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">Song</div>
                  </button>
                  )}
                  {ex.validModes.has('sfx') && (
                  <button
                    onClick={() => ex.setExportMode('sfx')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'sfx'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Zap size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">SFX</div>
                  </button>
                  )}
                  {ex.validModes.has('instrument') && (
                  <button
                    onClick={() => ex.setExportMode('instrument')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'instrument'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Settings size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">Instrument</div>
                  </button>
                  )}
                  {ex.validModes.has('audio') && (
                  <button
                    onClick={() => ex.setExportMode('audio')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'audio'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Volume2 size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">Audio</div>
                  </button>
                  )}
                  {ex.validModes.has('midi') && (
                  <button
                    onClick={() => ex.setExportMode('midi')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'midi'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Music2 size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">MIDI</div>
                  </button>
                  )}
                  {ex.validModes.has('xm') && (
                  <button
                    onClick={() => ex.setExportMode('xm')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'xm'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">XM</div>
                  </button>
                  )}
                  {ex.validModes.has('mod') && (
                  <button
                    onClick={() => ex.setExportMode('mod')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'mod'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">MOD</div>
                  </button>
                  )}
                  {ex.validModes.has('it') && (
                  <button
                    onClick={() => ex.setExportMode('it')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'it'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">IT</div>
                  </button>
                  )}
                  {ex.validModes.has('s3m') && (
                  <button
                    onClick={() => ex.setExportMode('s3m')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 's3m'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <FileMusic size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">S3M</div>
                  </button>
                  )}
                  {ex.validModes.has('chip') && (
                  <button
                    onClick={() => ex.setExportMode('chip')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'chip'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Cpu size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">Chip</div>
                  </button>
                  )}
                  {ex.validModes.has('nano') && (
                  <button
                    onClick={() => ex.setExportMode('nano')}
                    className={`
                      p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                      ${ex.exportMode === 'nano'
                        ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                        : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                      }
                    `}
                  >
                    <Zap size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">Nano</div>
                  </button>
                  )}
                  {ex.validModes.has('fur') && (
                    <button
                      onClick={() => ex.setExportMode('fur')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'fur'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Export Furnace Module</div>
                    </button>
                  )}
                  {ex.validModes.has('furText') && (
                    <button
                      onClick={() => ex.setExportMode('furText')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'furText'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Export Furnace Text</div>
                    </button>
                  )}
                  {(Object.keys(AY_SCRAMBLE_TARGETS) as AyScrambleTarget[]).filter((k) => ex.furnaceAyAvailable[k]).map((k) => (
                    <button
                      key={k}
                      onClick={() => { ex.setAyTarget(k); ex.setExportMode('furAy'); }}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'furAy' && ex.ayTarget === k
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">{AY_SCRAMBLE_TARGETS[k].label}</div>
                    </button>
                  ))}
                  {ex.validModes.has('zxTap') && (
                    <button
                      onClick={() => ex.setExportMode('zxTap')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'zxTap'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">ZX Spectrum 128 (.tap)</div>
                    </button>
                  )}
                  {ex.validModes.has('vectrexCart') && (
                    <button
                      onClick={() => ex.setExportMode('vectrexCart')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'vectrexCart'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Vectrex Cartridge (AY-3-8910)</div>
                    </button>
                  )}
                  {ex.validModes.has('gbRom') && (
                    <button
                      onClick={() => ex.setExportMode('gbRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'gbRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Game Boy Cartridge (.gb)</div>
                    </button>
                  )}
                  {ex.validModes.has('mdRom') && (
                    <button
                      onClick={() => ex.setExportMode('mdRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'mdRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Mega Drive Cartridge (.bin)</div>
                    </button>
                  )}
                  {ex.validModes.has('pceRom') && (
                    <button
                      onClick={() => ex.setExportMode('pceRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'pceRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">PC Engine HuCard (.pce)</div>
                    </button>
                  )}
                  {ex.validModes.has('c64Prg') && (
                    <button
                      onClick={() => ex.setExportMode('c64Prg')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'c64Prg'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Commodore 64 Program (.prg)</div>
                    </button>
                  )}
                  {ex.validModes.has('smsRom') && (
                    <button
                      onClick={() => ex.setExportMode('smsRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'smsRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Master System Cartridge (.sms)</div>
                    </button>
                  )}
                  {ex.validModes.has('ggRom') && (
                    <button
                      onClick={() => ex.setExportMode('ggRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'ggRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Game Gear Cartridge (.gg)</div>
                    </button>
                  )}
                  {ex.validModes.has('nesRom') && (
                    <button
                      onClick={() => ex.setExportMode('nesRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'nesRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">NES Cartridge (.nes)</div>
                    </button>
                  )}
                  {ex.validModes.has('nsfe') && (
                    <button
                      onClick={() => ex.setExportMode('nsfe')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'nsfe'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">NES NSF Extended (.nsfe)</div>
                    </button>
                  )}
                  {ex.validModes.has('zxBeeperTap') && (
                    <button
                      onClick={() => ex.setExportMode('zxBeeperTap')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'zxBeeperTap'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">ZX Spectrum Beeper (.tap)</div>
                    </button>
                  )}
                  {ex.validModes.has('zxQuadToneTap') && (
                    <button
                      onClick={() => ex.setExportMode('zxQuadToneTap')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'zxQuadToneTap'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">ZX Spectrum QuadTone (.tap)</div>
                    </button>
                  )}
                  {ex.validModes.has('snesRom') && (
                    <button
                      onClick={() => ex.setExportMode('snesRom')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'snesRom'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">SNES Cartridge (.sfc)</div>
                    </button>
                  )}
                  {ex.validModes.has('tad') && (
                    <button
                      onClick={() => ex.setExportMode('tad')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'tad'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">SNES (Terrific Audio Driver)</div>
                    </button>
                  )}
                  {ex.validModes.has('native') && (
                    <button
                      onClick={() => ex.setExportMode('native')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'native'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Native</div>
                    </button>
                  )}
                  {ex.validModes.has('adf') && (
                    <button
                      onClick={() => ex.setExportMode('adf')}
                      className={`
                        p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center
                        ${ex.exportMode === 'adf'
                          ? 'bg-accent-primary text-text-inverse border-accent-primary glow-sm'
                          : 'bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight'
                        }
                      `}
                    >
                      <FileMusic size={24} className="mx-auto mb-2" />
                      <div className="font-mono text-sm font-semibold break-words leading-tight">Amiga Disk (.adf)</div>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onClose();
                      useMIDIStore.getState().openPatternDialog();
                    }}
                    className="p-4 min-w-0 whitespace-normal rounded-lg border-2 transition-all text-center bg-dark-bgSecondary text-text-primary border-dark-border hover:border-dark-borderLight"
                  >
                    <Cable size={24} className="mx-auto mb-2" />
                    <div className="font-mono text-sm font-semibold break-words leading-tight">TD-3</div>
                  </button>
                </div>
              </div>

              {/* Export Options based on mode */}
              {ex.exportMode === 'song' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Song Export
                  </h3>
                  <div className="space-y-2 text-sm font-mono text-text-primary">
                    <div>Project: <span className="text-accent-primary">{ex.metadata.name}</span></div>
                    <div>Patterns: <span className="text-accent-primary">{ex.patterns.length}</span></div>
                    <div>Instruments: <span className="text-accent-primary">{ex.instruments.length}</span></div>
                    <div>BPM: <span className="text-accent-primary">{ex.bpm}</span></div>
                  </div>
                </div>
              )}

              {ex.exportMode === 'sfx' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    SFX Export
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-mono text-text-muted mb-1">
                        SFX Name
                      </label>
                      <input
                        type="text"
                        value={ex.sfxName}
                        onChange={(e) => ex.setSfxName(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-text-muted mb-1">
                        Pattern
                      </label>
                      <select
                        value={ex.selectedPatternIndex}
                        onChange={(e) => ex.setSelectedPatternIndex(Number(e.target.value))}
                        className="input w-full"
                      >
                        {ex.patterns.map((pattern, index) => (
                          <option key={pattern.id} value={index}>
                            {index.toString().padStart(2, '0')} - {pattern.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-mono text-text-muted mb-1">
                        Instrument
                      </label>
                      <select
                        value={ex.selectedInstrumentId}
                        onChange={(e) => ex.setSelectedInstrumentId(Number(e.target.value))}
                        className="input w-full"
                      >
                        {ex.instruments.map((instrument) => (
                          <option key={instrument.id} value={instrument.id}>
                            {instrument.id.toString(16).toUpperCase().padStart(2, '0')} - {instrument.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {ex.exportMode === 'instrument' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Instrument Export
                  </h3>
                  <div>
                    <label className="block text-xs font-mono text-text-muted mb-1">
                      Select Instrument
                    </label>
                    <select
                      value={ex.selectedInstrumentId}
                      onChange={(e) => ex.setSelectedInstrumentId(Number(e.target.value))}
                      className="input w-full"
                    >
                      {ex.instruments.map((instrument) => (
                        <option key={instrument.id} value={instrument.id}>
                          {instrument.id.toString(16).toUpperCase().padStart(2, '0')} - {instrument.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {ex.exportMode === 'audio' && (
                <AudioExportPanel
                  handlerRef={audioHandlerRef}
                  selectedPatternIndex={ex.selectedPatternIndex}
                  setSelectedPatternIndex={ex.setSelectedPatternIndex}
                  isRendering={ex.isRendering}
                  setIsRendering={ex.setIsRendering}
                  renderProgress={ex.renderProgress}
                  setRenderProgress={ex.setRenderProgress}
                  initialScope={ex.modalData?.audioScope as 'pattern' | 'song' | undefined}
                />
              )}

              {ex.exportMode === 'midi' && (
                <MidiExportPanel
                  handlerRef={midiHandlerRef}
                  selectedPatternIndex={ex.selectedPatternIndex}
                  setSelectedPatternIndex={ex.setSelectedPatternIndex}
                />
              )}

              {(ex.exportMode === 'xm' || ex.exportMode === 'mod' || ex.exportMode === 'it' || ex.exportMode === 's3m') && (
                <ModuleExportPanel
                  handlerRef={moduleHandlerRef}
                  exportMode={ex.exportMode as 'xm' | 'mod' | 'it' | 's3m'}
                  onClose={onClose}
                />
              )}

              {ex.exportMode === 'chip' && (
                <ChipExportPanel
                  handlerRef={chipHandlerRef}
                  isRendering={ex.isRendering}
                  setIsRendering={ex.setIsRendering}
                  renderProgress={ex.renderProgress}
                  setRenderProgress={ex.setRenderProgress}
                  onClose={onClose}
                  onFormatChange={setChipExtension}
                />
              )}

              {ex.exportMode === 'fur' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Furnace Export (.fur)
                  </h3>
                  <div className="space-y-3">
                    <div className="text-sm font-mono text-text-secondary space-y-1">
                      <div>Format: <span className="text-accent-primary">Furnace Tracker Module</span></div>
                      <div>Engine: <span className="text-accent-primary">{ex.furnaceModuleAvailable ? 'Neo Geo module writer' : 'FurnaceFileOps WASM'}</span></div>
                      <div>Patterns: <span className="text-accent-primary">{ex.patterns.length}</span></div>
                      <div>Instruments: <span className="text-accent-primary">{ex.instruments.length}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {ex.exportMode === 'furText' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Furnace Text Export (.txt)
                  </h3>
                  <div className="text-sm font-mono text-text-secondary space-y-1">
                    <div>Format: <span className="text-accent-primary">Furnace readable song text</span></div>
                    <div>Engine: <span className="text-accent-primary">FurnaceFileOps WASM</span></div>
                  </div>
                </div>
              )}

              {ex.exportMode === 'furAy' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    {AY_SCRAMBLE_TARGETS[ex.ayTarget].heading}
                  </h3>
                  <div className="space-y-3">
                    <div className="text-sm font-mono text-text-secondary space-y-1">
                      <div>Chip: <span className="text-accent-primary">{AY_SCRAMBLE_TARGETS[ex.ayTarget].chip}</span></div>
                      <div>Patterns: <span className="text-accent-primary">{ex.patterns.length}</span></div>
                      <div>Instruments: <span className="text-accent-primary">{ex.instruments.length}</span></div>
                    </div>
                    {ex.furnaceAyTempoWarning && (
                      <div className="text-xs font-mono text-accent-warning">{ex.furnaceAyTempoWarning}</div>
                    )}
                    <div className="text-xs font-mono text-text-muted">
                      Effects, macros and instruments outside the player contract are left out; each one is listed in a warning after export.
                    </div>
                  </div>
                </div>
              )}

              {ex.exportMode === 'vectrexCart' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Vectrex cartridge (.bin)
                  </h3>
                  <div className="space-y-3 text-sm font-mono text-text-secondary">
                    <div>Plays the song once in real time and records the AY-3-8910 register writes. The cartridge runs on a Vectrex or an emulator and shows the title on screen. It holds at most 32 KB (no bank switching), so long songs are refused.</div>
                    {ex.vectrexCartTempoWarning && (
                      <div className="text-xs font-mono text-accent-warning">{ex.vectrexCartTempoWarning}</div>
                    )}
                    {ex.vectrexCartBusy && <div className="text-xs font-mono text-accent-primary">Recording the song. Wait for it to finish.</div>}
                  </div>
                </div>
              )}

              {(ex.exportMode === 'nesRom' || ex.exportMode === 'nsfe') && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    {ex.exportMode === 'nsfe' ? 'NES NSF Extended (.nsfe)' : 'NES cartridge (.nes)'}
                  </h3>
                  <div className="space-y-3 text-sm font-mono text-text-secondary">
                    {ex.exportMode === 'nsfe' && <div>An NSFe music file for NSF players and emulators. It plays at the console frame rate, and FDS songs are not supported.</div>}
                    {ex.exportMode === 'nesRom' ? (
                      <div>The song as FamiStudio music data inside the FamiStudio sound engine, with the title and author on screen. Only the 2A03 channels are carried; the sound plays at the console frame rate on an emulator or a flash cart.</div>
                    ) : (
                      <>
                        <div>Plays the song once per region in real time and records the sound chip register writes.</div>
                        <CustomSelect
                          value={ex.nesRegion}
                          onChange={(v) => ex.setNesRegion(v as NesRegionChoice)}
                          options={(Object.keys(NES_REGION_LABELS) as NesRegionChoice[]).map((r) => ({ value: r, label: NES_REGION_LABELS[r] }))}
                        />
                        {ex.nesSubsongCount > 1 && (
                          <CustomSelect
                            value={ex.nesSubsongs}
                            onChange={(v) => ex.setNesSubsongs(v as 'current' | 'all')}
                            options={[{ value: 'current', label: 'Current subsong' }, { value: 'all', label: `All ${ex.nesSubsongCount} subsongs (choose on the title screen)` }]}
                          />
                        )}
                      </>
                    )}
                    {ex.exportMode === 'nsfe' && ex.nesRomTempoWarning && (
                      <div className="text-xs font-mono text-accent-warning">{ex.nesRomTempoWarning}</div>
                    )}
                    {ex.nesRomBusy && <div className="text-xs font-mono text-accent-primary">{ex.exportMode === 'nsfe' ? 'Recording the song. Wait for it to finish.' : 'Building the cartridge.'}</div>}
                  </div>
                </div>
              )}

              {ex.exportMode === 'zxTap' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    ZX Spectrum 128 tape (.tap)
                  </h3>
                  <div className="space-y-3 text-sm font-mono text-text-secondary">
                    <div>Plays the song once in real time and records the AY-3-8910 register writes. The tape loads and plays on a ZX Spectrum 128 or an emulator.</div>
                    {ex.zxTapTempoWarning && (
                      <div className="text-xs font-mono text-accent-warning">{ex.zxTapTempoWarning}</div>
                    )}
                    {ex.zxTapBusy && <div className="text-xs font-mono text-accent-primary">Recording the song. Wait for it to finish.</div>}
                  </div>
                </div>
              )}

              {ex.exportMode === 'zxBeeperTap' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    ZX Spectrum Beeper tape (.tap)
                  </h3>
                  <div className="space-y-3 text-sm font-mono text-text-secondary">
                    <div>Writes the pattern data of the first four channels for a 4 channel pulse width beeper player. The tape loads and plays on a ZX Spectrum 48K or an emulator. Any key stops it.</div>
                    <div className="text-xs font-mono text-text-muted">Instrument macros, volume and the sample channel are not played. A repeated note of the same pitch holds instead of restarting.</div>
                    {ex.zxBeeperReport && ex.zxBeeperReport.seconds > 0 && (
                      <div className="text-xs font-mono text-text-secondary">Length {Math.round(ex.zxBeeperReport.seconds)} s.</div>
                    )}
                    {ex.zxBeeperReport?.warnings.map((w) => (
                      <div key={w} className="text-xs font-mono text-accent-warning">{w}</div>
                    ))}
                  </div>
                </div>
              )}

              {ex.exportMode === 'zxQuadToneTap' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    ZX Spectrum QuadTone tape (.tap)
                  </h3>
                  <div className="space-y-3 text-sm font-mono text-text-secondary">
                    <div>Records the song once from the Furnace QuadTone engine (four tone channels and the drum sample channel) and writes a tape for a ZX Spectrum 128K or an emulator.</div>
                    <div className="text-xs font-mono text-text-muted">The export plays the song in real time, so it takes as long as the song. Drum hits are stored as 1-bit data.</div>
                    {ex.zxQuadToneReport?.warnings.map((w) => (
                      <div key={w} className="text-xs font-mono text-accent-warning">{w}</div>
                    ))}
                    {ex.zxQuadToneBusy && <div className="text-xs font-mono text-accent-primary">Recording the song. Wait for it to finish.</div>}
                  </div>
                </div>
              )}

              {ex.exportMode === 'tad' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    SNES Export for the Terrific Audio Driver (.zip)
                  </h3>
                  <div className="space-y-3 text-sm font-mono text-text-secondary">
                    <div>Each subsong becomes a song; subsongs named <span className="text-accent-primary">sfx:name</span> become sound effects.</div>
                    <div className="text-xs text-text-muted">
                      The zip holds the editable project, assembler files (ca65, 64tass, asar, pvsneslib; lorom and hirom), a .spc preview per song and a README.
                    </div>
                    {ex.tadReport && (
                      <div className="space-y-1">
                        <div className="text-xs">Audio RAM: <span className="text-accent-primary">{ex.tadReport.ram}</span></div>
                        {ex.tadReport.rows.map((r) => (
                          <div key={r.id} className="text-xs">{r.label}: <span className="text-text-primary">{r.bytes} bytes</span></div>
                        ))}
                        {ex.tadReport.warnings.map((w, i) => (
                          <div key={i} className="text-xs text-accent-warning">{w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {ex.exportMode === 'native' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    {ex.nativeLabel ? `Native ${ex.nativeLabel} Export` : 'Native Amiga Format Export'}
                  </h3>
                  <div className="space-y-3">
                    <div className="text-sm font-mono text-text-secondary space-y-1">
                      {!ex.nativeLabel && <div>Preset: <span className="text-accent-primary">{useUIStore.getState().activeSystemPreset || 'auto-detect'}</span></div>}
                      <div>Patterns: <span className="text-accent-primary">{ex.patterns.length}</span></div>
                      <div>Instruments: <span className="text-accent-primary">{ex.instruments.length}</span></div>
                    </div>
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-xs font-mono text-text-primary leading-relaxed">
                        {ex.nativeLabel
                          ? `Exports the song as a ${ex.nativeLabel} file with all edits preserved.`
                          : `Exports as the original tracker format with all edits preserved.
                        Supports 30+ formats including JamCracker, SoundMon, ProTracker, Future Composer,
                        SidMon, PumaTracker, OctaMED, Hively/AHX, DigiBooster, Oktalyzer, Klystrack,
                        InStereo, DeltaMusic, Digital Mugician, Sonic Arranger, TFMX, Fred Editor,
                        SoundFX, TCB Tracker, and more. Chip RAM readback is available as fallback.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {ex.exportMode === 'adf' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">Amiga Disk (.adf)</h3>
                  <div className="text-sm font-mono text-text-secondary">
                    A bootable disk image that plays the song on an Amiga 500 or Amiga 1200, or in an emulator. The native module is written onto a disk that holds its player. Formats without a disk player, and modules too large for the disk, are refused with a message.
                  </div>
                </div>
              )}

              {ex.exportMode === 'nano' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Nano Binary Export (.dbn)
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-dark-bg border border-dark-border rounded-lg p-3">
                      <p className="text-xs font-mono text-text-primary leading-relaxed">
                        Extreme binary compression for demoscene 4k intros.
                        Exports a strictly optimized <span className="text-accent-secondary">Uint8Array</span> containing only used instruments and bit-masked pattern data.
                      </p>
                    </div>

                    <div className="text-sm font-mono text-text-secondary space-y-1">
                      <div>Target Size: <span className="text-accent-primary">&lt; 4KB</span></div>
                      <div>Format: <span className="text-accent-primary">DBXN Binary</span></div>
                      <div>Used Instruments: <span className="text-accent-primary">
                        {(() => {
                          const used = new Set<number>();
                          ex.patterns.forEach(pattern => {
                            pattern.channels.forEach(ch => {
                              ch.rows.forEach(cell => {
                                if (cell.instrument > 0) used.add(cell.instrument);
                              });
                            });
                          });
                          return used.size;
                        })()}
                      </span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Export Options — only shown when there are relevant options for the current mode */}
              {ex.exportMode === 'song' && (
                <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4">
                  <h3 className="text-sm font-mono font-bold text-accent-primary mb-3">
                    Options
                  </h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 text-sm font-mono text-text-primary cursor-pointer hover:text-accent-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={ex.options.includeAutomation}
                        onChange={(e) => ex.setOptions({ ...ex.options, includeAutomation: e.target.checked })}
                        className="w-4 h-4 rounded border-dark-border bg-dark-bg text-accent-primary focus:ring-accent-primary"
                      />
                      Include automation data
                    </label>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Import Mode */}
              <div className="text-center py-10">
                <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-dark-bgSecondary border border-dark-border flex items-center justify-center">
                  <Upload size={32} className="text-accent-primary" />
                </div>
                <h3 className="text-xl font-mono font-bold text-text-primary mb-2">
                  Import File
                </h3>
                <p className="text-sm font-mono text-text-muted mb-6">
                  Select a .dbx, .sfx.json, or .dbi file
                </p>
                <button
                  onClick={handleImportClick}
                  className="btn-primary px-8 py-3"
                >
                  Choose File
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="bg-dark-bgSecondary border border-dark-border rounded-lg p-4 mt-4">
                <h4 className="text-xs font-mono font-bold text-accent-primary mb-3">
                  Supported Formats
                </h4>
                <ul className="text-sm font-mono text-text-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-accent-primary">•</span>
                    <span><strong>.song.json</strong> - Full song with all patterns and instruments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent-primary">•</span>
                    <span><strong>.sfx.json</strong> - Single pattern with one instrument</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent-primary">•</span>
                    <span><strong>.dbi</strong> - Individual instrument preset</span>
                  </li>
                </ul>
              </div>

              {/* TD-3 Hardware Transfer */}
              <button
                onClick={() => {
                  onClose();
                  useMIDIStore.getState().openPatternDialog();
                }}
                className="mt-4 w-full flex items-center gap-3 px-4 py-3 bg-dark-bgSecondary border border-dark-border rounded-lg text-left hover:bg-dark-bgHover transition-colors"
              >
                <Cable size={20} className="text-accent-secondary shrink-0" />
                <div>
                  <p className="text-sm font-mono font-bold text-text-primary">TD-3 Pattern Transfer</p>
                  <p className="text-[11px] font-mono text-text-muted">Send or receive patterns via MIDI SysEx</p>
                </div>
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-dark-bgSecondary border-t border-dark-border px-5 py-4 flex items-center justify-between">
          <div className="text-xs font-mono text-text-muted">
            {ex.dialogMode === 'export'
              ? `Format: ${
                  ex.exportMode === 'audio' ? '.wav'
                  : ex.exportMode === 'midi' ? '.mid'
                  : ex.exportMode === 'xm' ? '.xm'
                  : ex.exportMode === 'mod' ? '.mod'
                  : ex.exportMode === 'it' ? '.it'
                  : ex.exportMode === 's3m' ? '.s3m'
                  : ex.exportMode === 'chip' ? `.${chipExtension}`
                  : ex.exportMode === 'nano' ? '.dbn'
                  : ex.exportMode === 'fur' || ex.exportMode === 'furAy' ? '.fur'
                  : ex.exportMode === 'furText' ? '.txt'
                  : ex.exportMode === 'zxTap' || ex.exportMode === 'zxBeeperTap' || ex.exportMode === 'zxQuadToneTap' ? '.tap'
                  : ex.exportMode === 'vectrexCart' ? '.bin'
                  : ex.exportMode === 'nesRom' ? '.nes'
                  : ex.exportMode === 'gbRom' ? '.gb'
                  : ex.exportMode === 'mdRom' ? '.bin'
                  : ex.exportMode === 'pceRom' ? '.pce'
                  : ex.exportMode === 'c64Prg' ? '.prg'
                  : ex.exportMode === 'smsRom' ? '.sms'
                  : ex.exportMode === 'ggRom' ? '.gg'
                  : ex.exportMode === 'nsfe' ? '.nsfe'
                  : ex.exportMode === 'snesRom' ? '.sfc'
                  : ex.exportMode === 'tad' ? '.zip'
                  : ex.exportMode === 'adf' ? '.adf'
                  : `.${ex.exportMode}.json`
                }`
              : 'Select a file to import'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn"
              disabled={ex.isRendering}
            >
              Cancel
            </button>
            {ex.dialogMode === 'export' && (
              <button
                onClick={handleExport}
                className="btn-primary flex items-center gap-2"
                disabled={ex.isRendering}
              >
                <Download size={16} />
                {ex.isRendering ? 'Rendering...' : 'Export'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
