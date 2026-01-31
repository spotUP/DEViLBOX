import React, { useCallback } from 'react';
import type { MAMEConfig } from '@typedefs/instrument';
import { Knob } from '@components/controls/Knob';
import { Cpu, Database, Save, Activity, HardDrive } from 'lucide-react';
import { MAMEEngine } from '@engine/MAMEEngine';
import { useThemeStore } from '@stores';
import { MAMEVFXVoiceMatrix } from './MAMEVFXVoiceMatrix';
import { MAMEDOCVoiceMatrix } from './MAMEDOCVoiceMatrix';
import { MAMERSAVoiceMatrix } from './MAMERSAVoiceMatrix';
import JSZip from 'jszip';

interface MAMEControlsProps {
  config: MAMEConfig;
  handle: number;
  onChange: (updates: Partial<MAMEConfig>) => void;
}

const REQUIRED_ROMS: Record<string, string> = {
  vfx: 'vfx.zip (or fsd1.zip)',
  doc: 'esq1.zip (or csd1.zip)',
  rsa: 'mks20.zip',
  swp30: 'mu100.zip (swp30 ROMs)',
};

export const MAMEControls: React.FC<MAMEControlsProps> = ({
  config,
  handle,
  onChange,
}) => {
  const engine = MAMEEngine.getInstance();
  const requiredZip = REQUIRED_ROMS[config.type] || 'roms.zip';

  const numVoices = config.type === 'swp30' ? 64 : config.type === 'rsa' ? 16 : 32;

  // Theme-aware styling
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const isCyanTheme = currentThemeId === 'cyan-lineart';

  // Colors based on theme
  const accentColor = isCyanTheme ? '#00ffff' : '#ff4444'; 
  const knobColor = isCyanTheme ? '#00ffff' : '#ff8888';
  
  // Background styles
  const panelBg = isCyanTheme
    ? 'bg-[#051515] border-cyan-900/50'
    : 'bg-[#1a1a1a] border-gray-800';

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, bank: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        
        // Get all files, filter out directories and metadata/text files
        const files: { name: string, entry: any }[] = [];
        loadedZip.forEach((relativePath, zipEntry) => {
          const isMetadata = relativePath.toLowerCase().match(/\.(txt|md|txt|pdf|url|inf)$/);
          if (!zipEntry.dir && !isMetadata) {
            files.push({ name: relativePath, entry: zipEntry });
          }
        });

        // Sort files alphabetically to ensure consistent bank mapping
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        console.log(`🎹 MAME: Extracting ${files.length} files from ZIP starting at bank ${bank}...`);
        
        for (let i = 0; i < files.length; i++) {
          const targetBank = bank + i;
          const fileData = await files[i].entry.async('uint8array');
          
          engine.setRom(targetBank, fileData);
          console.log(`🎹 MAME: Loaded ${files[i].name} into bank ${targetBank} (${fileData.length} bytes)`);
        }
        
        onChange({ romsLoaded: true });
      } catch (err) {
        console.error('🎹 MAME: Failed to unzip ROM set:', err);
      }
    } else {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      engine.setRom(bank, data);
      onChange({ romsLoaded: true });
      console.log(`🎹 MAME: Loaded ROM bank ${bank} (${data.length} bytes)`);
    }
  }, [engine, onChange]);

  const handleRegisterWrite = useCallback((offset: number, value: number) => {
    if (handle === 0) return;
    engine.write(handle, offset, value);
    // Persist in config
    const newRegs = { ...config.registers, [offset]: value };
    onChange({ registers: newRegs });
  }, [handle, config.registers, engine, onChange]);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className={`flex items-center justify-between p-3 rounded border ${panelBg}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-primary/20 rounded">
            <Cpu style={{ color: accentColor }} size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-primary">
              MAME {config.type.toUpperCase()} ENGINE
            </h3>
            <p className="text-[10px] text-text-muted">
              {config.type === 'vfx' ? 'ES5506 (OTTO) 32-Voice Wavetable' : 
               config.type === 'doc' ? 'ES5503 (DOC) 32-Voice Wavetable' : 
               config.type === 'swp30' ? 'Yamaha SWP30 (AWM2) ROMpler/DSP' :
               'Roland SA CPU-B Synthesis'}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono ${config.romsLoaded ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          <Database size={12} />
          {config.romsLoaded ? 'ROMS READY' : 'ROMS MISSING'}
        </div>
      </div>

      {/* ROM Management Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-4 border rounded ${panelBg}`}>
          <div className="flex items-center justify-between mb-1 text-text-secondary">
            <div className="flex items-center gap-2">
              <HardDrive size={16} />
              <span className="text-xs font-bold uppercase">ROM Banks</span>
            </div>
            <label className="cursor-pointer text-[10px] bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary px-2 py-1 rounded border border-accent-primary/30 transition-colors">
              UPLOAD ZIP
              <input 
                type="file" 
                className="hidden" 
                accept=".zip"
                onChange={(e) => handleFileUpload(e, 0)}
              />
            </label>
          </div>
          <div className="text-[9px] text-text-muted mb-3 flex items-center gap-1">
            <Database size={10} />
            EXPECTS: <span className="font-mono" style={{ color: accentColor }}>{requiredZip}</span>
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map(bank => (
              <div key={bank} className="flex items-center justify-between text-[10px]">
                <span className="text-text-muted">BANK {bank}</span>
                <label className="cursor-pointer hover:underline" style={{ color: accentColor }}>
                  UPLOAD
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={(e) => handleFileUpload(e, bank)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Status / Activity */}
        <div className={`p-4 border rounded ${panelBg}`}>
          <div className="flex items-center gap-2 mb-3 text-text-secondary">
            <Activity size={16} />
            <span className="text-xs font-bold uppercase">Status</span>
          </div>
          <div className="space-y-1 font-mono text-[10px]">
            <div className="flex justify-between">
              <span className="text-text-muted">CLOCK</span>
              <span className="text-text-primary">{(config.clock / 1000000).toFixed(2)} MHz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">VOICES</span>
              <span className="text-text-primary">{numVoices}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">ACCURACY</span>
              <span className="text-accent-primary">SAMPLE PERFECT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Register Controls (VFX Specific for now) */}
      {config.type === 'vfx' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Save size={16} />
            <span className="text-xs font-bold uppercase">Common Registers</span>
          </div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-4 place-items-center">
            <Knob 
              size="sm" 
              label="PAGE" 
              min={0} max={255} 
              value={config.registers[0x00] || 0}
              onChange={(v) => handleRegisterWrite(0x00, v)}
              color={knobColor}
            />
            <Knob 
              size="sm" 
              label="ACTIVE" 
              min={0} max={31} 
              value={config.registers[0x01] || 31}
              onChange={(v) => handleRegisterWrite(0x01, v)}
              color={knobColor}
            />
            <Knob 
              size="sm" 
              label="MODE" 
              min={0} max={255} 
              value={config.registers[0x02] || 0}
              onChange={(v) => handleRegisterWrite(0x02, v)}
              color={knobColor}
            />
          </div>
          <p className="text-[9px] text-text-muted italic p-2 rounded bg-black/20">
            Note: You are directly editing the Ensoniq OTTO registers. Consult the ES5506 datasheet for mapping.
          </p>
        </div>
      )}

      {/* Voice Matrix (VFX Specific) */}
      {config.type === 'vfx' && handle !== 0 && (
        <MAMEVFXVoiceMatrix 
          handle={handle}
          accentColor={accentColor}
          knobColor={knobColor}
          panelBg={panelBg}
        />
      )}

      {/* Oscillator Matrix (DOC Specific) */}
      {config.type === 'doc' && handle !== 0 && (
        <MAMEDOCVoiceMatrix 
          handle={handle}
          knobColor={knobColor}
          panelBg={panelBg}
        />
      )}

      {/* Voice Matrix (RSA Specific) */}
      {config.type === 'rsa' && handle !== 0 && (
        <MAMERSAVoiceMatrix 
          handle={handle}
          knobColor={knobColor}
          panelBg={panelBg}
        />
      )}

      {/* Register Live View (Hex grid) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <Activity size={16} />
          <span className="text-xs font-bold uppercase">Register Live View (HEX)</span>
        </div>
        <div className="grid grid-cols-8 md:grid-cols-16 gap-1 p-2 bg-black/40 rounded border border-dark-border font-mono text-[9px]">
          {Array.from({ length: 32 }).map((_, i) => {
            const val = handle !== 0 ? engine.read(handle, i) : 0;
            return (
              <div key={i} className="flex flex-col items-center p-1 bg-dark-bgSecondary/30 rounded">
                <span className="text-text-muted mb-1">{i.toString(16).toUpperCase().padStart(2, '0')}</span>
                <span style={{ color: accentColor }}>{val.toString(16).toUpperCase().padStart(2, '0')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
