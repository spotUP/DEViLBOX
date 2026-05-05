/**
 * FurnacePresetBrowser — Browse and insert Furnace chip synth instruments by family.
 *
 * DOM-based modal, rendered as a portal to document.body.
 * Chip cards are organized into four families:
 *   FM       — OPN2/Genesis, OPM, OPL3, OPLL, ESFM, OPZ, OPNA, OPNB, OPL4, Y8950, VRC7, YM2203, YM2610B
 *   PSG/Pulse— NES, GameBoy, SMS/PSG, AY, SCC, TIA, POKEY, VERA, ZX Beeper, etc.
 *   PCM      — SNES, AMIGA, SEGA PCM, QSound, ES5506, N163, FDS, MSM, etc.
 *   Other    — SID C64, Pokémon Mini, PET, PV-1000, etc.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu } from 'lucide-react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';

// ---------------------------------------------------------------------------
// Data: chip definitions grouped by family
// ---------------------------------------------------------------------------

interface ChipEntry {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

type FamilyKey = 'FM' | 'PSG/Pulse' | 'PCM' | 'Other';

const CHIP_FAMILIES: Record<FamilyKey, ChipEntry[]> = {
  FM: [
    { id: 'FurnaceOPN',    name: 'Sega Genesis (YM2612)',    description: '4-op FM, 6 channels. The sound of the Mega Drive.',        tags: ['4-op', 'Genesis', 'Mega Drive'] },
    { id: 'FurnaceOPM',    name: 'Yamaha OPM (YM2151)',      description: '4-op FM, 8 channels. Used in the Sharp X68000.',            tags: ['4-op', 'X68000', 'arcade'] },
    { id: 'FurnaceOPL',    name: 'OPL3 (YMF262)',            description: '2-op FM, 18 channels. Classic AdLib / Sound Blaster.',      tags: ['2-op', 'AdLib', 'OPL3'] },
    { id: 'FurnaceOPLL',   name: 'Yamaha OPLL (YM2413)',     description: '2-op FM, 9 channels. Used in MSX and FM-PAC.',              tags: ['2-op', 'MSX', 'FM-PAC'] },
    { id: 'FurnaceESFM',   name: 'Enhanced OPL3 FM (ESS)',   description: 'Extended OPL3 with additional modulation options.',         tags: ['2-op', 'OPL3', 'enhanced'] },
    { id: 'FurnaceOPZ',    name: 'Yamaha OPZ (YM2414)',      description: '4-op FM with extra waveforms. Used in the TX81Z.',          tags: ['4-op', 'TX81Z', 'YM2414'] },
    { id: 'FurnaceOPNA',   name: 'YM2608 OPNA (PC-98)',      description: '4-op FM + ADPCM + SSG. The sound of NEC PC-98.',            tags: ['4-op', 'PC-98', 'ADPCM'] },
    { id: 'FurnaceOPNB',   name: 'YM2610 OPNB (Neo Geo)',    description: '4-op FM + ADPCM. Used in the SNK Neo Geo.',                 tags: ['4-op', 'Neo Geo', 'SNK'] },
    { id: 'FurnaceOPL4',   name: 'YMF278B OPL4',             description: 'OPL3 + PCM sample playback combined.',                     tags: ['2-op', 'OPL4', 'PCM'] },
    { id: 'FurnaceY8950',  name: 'Y8950 (MSX-Audio)',        description: '2-op FM + ADPCM. Expansion sound for MSX.',                 tags: ['2-op', 'MSX-Audio', 'ADPCM'] },
    { id: 'FurnaceVRC7',   name: 'Konami VRC7',              description: '2-op FM, 6 channels. NES Famicom expansion chip.',          tags: ['2-op', 'NES', 'Famicom'] },
    { id: 'FurnaceOPN2203', name: 'YM2203 OPN (PC-88)',      description: '3-op FM + SSG, 3 channels. NEC PC-88 series.',             tags: ['3-op', 'PC-88', 'SSG'] },
    { id: 'FurnaceOPNBB',  name: 'YM2610B (Neo Geo ext.)',   description: 'Extended YM2610 with additional FM channels.',              tags: ['4-op', 'Neo Geo', 'extended'] },
  ],

  'PSG/Pulse': [
    { id: 'FurnaceNES',       name: 'NES (2A03)',             description: '2× pulse + triangle + noise + DPCM channels.',          tags: ['NES', 'Famicom', 'pulse'] },
    { id: 'FurnaceGB',        name: 'GameBoy DMG',            description: '2× pulse + wave + noise. Classic handheld sound.',      tags: ['GameBoy', 'DMG', 'pulse'] },
    { id: 'FurnacePSG',       name: 'Sega Master System (SN76489)', description: '3× pulse + noise PSG. Used in SMS and Game Gear.', tags: ['SMS', 'PSG', 'Sega'] },
    { id: 'FurnaceAY',        name: 'AY-3-8910 / YM2149',    description: '3-channel PSG. ZX Spectrum, CPC, MSX, ST.',             tags: ['AY', 'PSG', 'ZX Spectrum'] },
    { id: 'FurnaceAY8930',    name: 'AY8930 Enhanced',        description: 'Extended AY with envelope improvements and extra duty.', tags: ['AY', 'PSG', 'enhanced'] },
    { id: 'FurnaceVRC6',      name: 'Konami VRC6',            description: '2× pulse + sawtooth. NES expansion chip.',              tags: ['NES', 'Famicom', 'pulse'] },
    { id: 'FurnaceSCC',       name: 'Konami SCC (MSX)',       description: '5-channel wavetable. MSX cartridge sound.',             tags: ['MSX', 'wavetable', 'SCC'] },
    { id: 'FurnaceTIA',       name: 'Atari TIA (2600)',       description: '2-channel noise/tone. The Atari 2600 sound chip.',      tags: ['Atari', '2600', 'TIA'] },
    { id: 'FurnacePOKEY',     name: 'Atari POKEY',            description: '4-channel sound. Used in the Atari 8-bit computers.',   tags: ['Atari', '8-bit', 'POKEY'] },
    { id: 'FurnaceSWAN',      name: 'WonderSwan',             description: '4-channel wavetable / noise. Bandai WonderSwan.',       tags: ['WonderSwan', 'wavetable'] },
    { id: 'FurnaceVIC',       name: 'VIC-20 (MOS 6560)',      description: '4-channel (3 pulse + noise). Commodore VIC-20.',        tags: ['VIC-20', 'Commodore'] },
    { id: 'FurnaceSAA',       name: 'Philips SAA1099',        description: '6-channel PSG. Used in Sam Coupe and early PC cards.',  tags: ['SAA', 'PSG', 'Sam Coupe'] },
    { id: 'FurnaceTED',       name: 'Commodore TED (264)',    description: '2-channel tone + noise. C16 / Plus/4 chips.',           tags: ['Commodore', 'TED', 'C16'] },
    { id: 'FurnaceVERA',      name: 'Commander X16 VERA',     description: '16-channel PSG + PCM. Modern retro chip.',              tags: ['VERA', 'CX16', 'PSG'] },
    { id: 'FurnaceDAVE',      name: 'Enterprise DAVE',        description: '4-channel (3 tone + 1 noise). Enterprise 64/128.',      tags: ['Enterprise', 'DAVE'] },
    { id: 'FurnaceSU',        name: 'Sound Unit',             description: 'Wavetable + noise. Used in some Atari-style boards.',   tags: ['wavetable', 'Sound Unit'] },
    { id: 'FurnacePOWERNOISE', name: 'PowerNoise',            description: 'Noise/buzz synthesis channels.',                        tags: ['noise', 'PowerNoise'] },
    { id: 'FurnaceZXBEEPER',  name: 'ZX Spectrum Beeper',     description: '1-bit beeper audio. Classic ZX Spectrum sounds.',      tags: ['ZX Spectrum', 'beeper', '1-bit'] },
    { id: 'FurnacePCSPKR',    name: 'PC Speaker',             description: '1-channel square wave. Classic PC beeper.',             tags: ['PC Speaker', '1-bit', 'IBM PC'] },
    { id: 'FurnacePONG',      name: 'PONG (AY-3-8500)',       description: 'Simple sound from the original PONG hardware.',         tags: ['PONG', 'retro', 'classic'] },
    { id: 'FurnaceT6W28',     name: 'Toshiba T6W28',          description: 'Dual SN76489-compatible chip. Used in Neo Geo Pocket.', tags: ['PSG', 'Neo Geo Pocket'] },
  ],

  PCM: [
    { id: 'FurnaceSNES',      name: 'SNES (SPC700)',          description: '8-channel ADPCM + DSP reverb/echo. Super Nintendo.', tags: ['SNES', 'ADPCM', 'DSP'] },
    { id: 'FurnaceAMIGA',     name: 'Amiga (Paula)',          description: '4-channel 8-bit PCM. The classic Amiga sound.',    tags: ['Amiga', 'Paula', 'PCM'] },
    { id: 'FurnacePCE',       name: 'PC Engine (HuC6280)',    description: '6-channel wavetable. NEC PC Engine / TurboGrafx.',  tags: ['PC Engine', 'wavetable'] },
    { id: 'FurnaceN163',      name: 'Namco 163 (Famicom)',    description: 'Up to 8 wavetable channels. NES expansion.',        tags: ['NES', 'Famicom', 'wavetable'] },
    { id: 'FurnaceFDS',       name: 'Famicom Disk System',    description: 'Wavetable + modulator. Famicom disk expansion.',    tags: ['NES', 'FDS', 'wavetable'] },
    { id: 'FurnaceMMC5',      name: 'Nintendo MMC5',          description: '2× pulse + PCM. NES cartridge expansion chip.',    tags: ['NES', 'MMC5', 'pulse'] },
    { id: 'FurnaceGBA',       name: 'Game Boy Advance',       description: '2× direct-digital + GB legacy channels.',          tags: ['GBA', 'PCM', 'Nintendo'] },
    { id: 'FurnaceNDS',       name: 'Nintendo DS',            description: '16-channel PCM/ADPCM. Dual-screen handheld.',      tags: ['NDS', 'PCM', 'Nintendo'] },
    { id: 'FurnaceVB',        name: 'Virtual Boy',            description: '5-channel wavetable + noise. Nintendo Virtual Boy.', tags: ['Virtual Boy', 'wavetable'] },
    { id: 'FurnaceLynx',      name: 'Atari Lynx (MIKEY)',     description: '4-channel with volume/frequency envelopes.',       tags: ['Atari', 'Lynx', 'MIKEY'] },
    { id: 'FurnaceSEGAPCM',   name: 'Sega PCM (System 16)',   description: '16-channel PCM. Used in Sega System 16 arcade.',   tags: ['Sega', 'PCM', 'arcade'] },
    { id: 'FurnaceQSOUND',    name: 'Capcom QSound',          description: '16-channel PCM + stereo DSP. CPS1/CPS2 arcade.',   tags: ['QSound', 'Capcom', 'arcade'] },
    { id: 'FurnaceES5506',    name: 'Ensoniq ES5506 (OTTO)',  description: '32-channel 16-bit PCM. Ensoniq AudioPCI.',         tags: ['Ensoniq', 'PCM', '32-channel'] },
    { id: 'FurnaceRF5C68',    name: 'Ricoh RF5C68',           description: '8-channel PCM. Sega CD / Mega-CD sound chip.',     tags: ['Sega CD', 'PCM', 'RF5C68'] },
    { id: 'FurnaceC140',      name: 'Namco C140',             description: '24-channel 12-bit PCM. Namco System 2 arcade.',    tags: ['Namco', 'PCM', 'arcade'] },
    { id: 'FurnaceK007232',   name: 'Konami K007232',         description: '2-channel PCM with loop. Konami arcade boards.',   tags: ['Konami', 'PCM', 'arcade'] },
    { id: 'FurnaceK053260',   name: 'Konami K053260',         description: '4-channel ADPCM. Used in several Konami arcade titles.', tags: ['Konami', 'ADPCM', 'arcade'] },
    { id: 'FurnaceGA20',      name: 'Irem GA20',              description: '4-channel PCM. Irem M92 arcade platform.',         tags: ['Irem', 'PCM', 'arcade'] },
    { id: 'FurnaceOKI',       name: 'OKI MSM6295',            description: '4-channel ADPCM. Very common in arcade hardware.', tags: ['OKI', 'ADPCM', 'arcade'] },
    { id: 'FurnaceYMZ280B',   name: 'Yamaha YMZ280B',         description: '8-channel PCM/ADPCM. Used in mid-90s Taito/Sega.',  tags: ['Yamaha', 'ADPCM', 'arcade'] },
    { id: 'FurnaceX1_010',    name: 'Seta X1-010',            description: '16-channel wavetable + PCM. Seta arcade chip.',    tags: ['Seta', 'wavetable', 'PCM'] },
    { id: 'FurnaceMSM6258',   name: 'OKI MSM6258',            description: '4-bit ADPCM speech/sound. Used in X68000.',        tags: ['OKI', 'ADPCM', 'speech'] },
    { id: 'FurnaceMSM5232',   name: 'OKI MSM5232',            description: '8-channel tone generator. Used in some Taito boards.', tags: ['OKI', 'tone', 'arcade'] },
    { id: 'FurnaceMULTIPCM',  name: 'Sega MultiPCM',          description: '28-channel PCM. Used in Model 1 / System 32.',     tags: ['Sega', 'PCM', 'arcade'] },
    { id: 'FurnaceNAMCO',     name: 'Namco WSG',              description: 'Wavetable sound generator. Classic Namco arcade.',  tags: ['Namco', 'wavetable', 'arcade'] },
    { id: 'FurnacePCMDAC',    name: 'PCM DAC',                description: 'Simple single-channel PCM DAC output.',            tags: ['PCM', 'DAC'] },
    { id: 'FurnaceBUBBLE',    name: 'Konami Bubble System',   description: 'WSG-based sound. Konami Bubble System board.',      tags: ['Konami', 'wavetable', 'arcade'] },
    { id: 'FurnaceSM8521',    name: 'Sharp SM8521',           description: '3-channel wavetable. Used in Tiger handheld games.', tags: ['Sharp', 'wavetable', 'handheld'] },
    { id: 'FurnaceSUPERVISION', name: 'Watara Supervision',   description: '4-channel (tone + noise + DMA). Watara handheld.',  tags: ['Watara', 'handheld'] },
    { id: 'FurnaceUPD1771',   name: 'NEC uPD1771C',           description: '1-channel tone + noise. Used in early Epoch games.', tags: ['NEC', 'Epoch', 'tone'] },
    { id: 'FurnaceSCVTONE',   name: 'Epoch SCV Tone',         description: 'Simple tone chip used in Epoch Super Cassette Vision.', tags: ['Epoch', 'SCV', 'tone'] },
  ],

  Other: [
    { id: 'FurnaceC64',      name: 'SID (C64, 6581+8580)',    description: '3-voice wavetable + filter. The classic C64 SID chip.',    tags: ['SID', 'C64', 'Commodore'] },
    { id: 'FurnaceSID6581',  name: 'SID 6581 (original)',     description: 'Original 6581 SID chip, warm/buzzy character.',            tags: ['SID', '6581', 'Commodore'] },
    { id: 'FurnaceSID8580',  name: 'SID 8580 (revision 2)',   description: 'Revised 8580 SID chip, cleaner sound.',                    tags: ['SID', '8580', 'Commodore'] },
    { id: 'FurnacePOKEMINI', name: 'Pokémon Mini',            description: 'Simple buzzer. The tiny Pokémon Mini handheld.',           tags: ['Pokémon Mini', 'buzzer', 'Nintendo'] },
    { id: 'FurnacePET',      name: 'Commodore PET (BASIC)',   description: '1-channel tone. Early Commodore PET beeper sound.',        tags: ['Commodore', 'PET', 'beeper'] },
    { id: 'FurnacePV1000',   name: 'Casio PV-1000',           description: '3-channel tone. Casio PV-1000 game console.',             tags: ['Casio', 'PV-1000', 'tone'] },
  ],
};

const FAMILY_ORDER: FamilyKey[] = ['FM', 'PSG/Pulse', 'PCM', 'Other'];

const FAMILY_DESCRIPTIONS: Record<FamilyKey, string> = {
  FM:         'Frequency Modulation synthesis chips — operator-based FM engines.',
  'PSG/Pulse':'Programmable Sound Generators, pulse/square waves, and noise channels.',
  PCM:        'Sampled audio chips — PCM, ADPCM, and wavetable playback engines.',
  Other:      'Wavetable, SID, and miscellaneous synthesis chips.',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface FurnacePresetBrowserProps {
  onClose: () => void;
}

export const FurnacePresetBrowser: React.FC<FurnacePresetBrowserProps> = ({ onClose }) => {
  const [activeFamily, setActiveFamily] = useState<FamilyKey>('FM');
  const createInstrument = useInstrumentStore((s) => s.createInstrument);
  const portalRef = useRef<HTMLDivElement | null>(null);

  // Create a portal target once.
  if (!portalRef.current) {
    const div = document.createElement('div');
    div.id = 'furnace-preset-browser-portal';
    div.style.position = 'relative';
    div.style.zIndex = '200';
    document.body.appendChild(div);
    portalRef.current = div;
  }

  // Remove portal target on unmount.
  useEffect(() => {
    return () => {
      portalRef.current?.remove();
      portalRef.current = null;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Add a chip instrument to the store and close.
  const handleSelectChip = useCallback((chip: ChipEntry) => {
    createInstrument({ name: chip.name, synthType: chip.id as import('@typedefs/instrument').SynthType });
    notify.success(`Added: ${chip.name}`);
    onClose();
  }, [createInstrument, onClose]);

  // Close when clicking the backdrop.
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const chips = CHIP_FAMILIES[activeFamily];

  const content = (
    // Backdrop
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      {/* Modal panel */}
      <div
        className="relative flex flex-col bg-dark-bg border border-dark-border rounded-lg shadow-2xl"
        style={{ width: 740, maxWidth: '96vw', height: 520, maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-accent-primary" />
            <h2 className="text-sm font-bold text-text-primary tracking-wide uppercase">
              Furnace Chip Browser
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-dark-bgHover transition-colors"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — sidebar + grid */}
        <div className="flex flex-1 min-h-0">
          {/* Family sidebar */}
          <div className="flex flex-col w-36 flex-shrink-0 border-r border-dark-border py-2">
            {FAMILY_ORDER.map((family) => (
              <button
                key={family}
                onClick={() => setActiveFamily(family)}
                className={`
                  text-left px-4 py-2.5 text-xs font-medium transition-colors
                  ${activeFamily === family
                    ? 'bg-accent-primary/20 text-accent-primary border-r-2 border-accent-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgHover'
                  }
                `}
              >
                <span className="block font-bold">{family}</span>
                <span className="block text-[10px] text-text-muted font-normal mt-0.5">
                  {CHIP_FAMILIES[family].length} chips
                </span>
              </button>
            ))}
          </div>

          {/* Chip grid */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Family description */}
            <div className="px-4 py-2 border-b border-dark-border flex-shrink-0">
              <p className="text-[11px] text-text-muted">{FAMILY_DESCRIPTIONS[activeFamily]}</p>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => handleSelectChip(chip)}
                    className="
                      group flex flex-col items-start gap-1 p-3 rounded
                      bg-dark-bgSecondary border border-dark-border
                      hover:border-accent-primary hover:bg-accent-primary/10
                      transition-all text-left
                    "
                  >
                    <span className="text-xs font-semibold text-text-primary group-hover:text-accent-primary transition-colors leading-tight">
                      {chip.name}
                    </span>
                    <span className="text-[10px] text-text-muted leading-snug line-clamp-2">
                      {chip.description}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {chip.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] px-1 py-0.5 rounded bg-dark-bgTertiary text-text-muted border border-dark-borderLight font-mono"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-dark-border flex-shrink-0">
          <p className="text-[10px] text-text-muted">
            Click a chip to add it as a new instrument. Use the instrument editor to adjust FM operators, macros, and parameters.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(content, portalRef.current!);
};
