/**
 * PixiFurnacePresetBrowser — GL-native Furnace chip synth preset browser.
 *
 * GL port of src/components/instruments/FurnacePresetBrowser.tsx.
 * Two-panel layout: family sidebar + scrollable chip card grid.
 * Clicking a chip card creates a new instrument and closes the dialog.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { notify } from '@stores/useNotificationStore';
import type { SynthType } from '@typedefs/instrument';
import { usePixiTheme } from '../theme';
import { Div, Txt, GlModal, GlModalFooter } from '../layout';
import { PIXI_FONTS } from '../fonts';
import type { FederatedWheelEvent } from 'pixi.js';

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
// Layout constants
// ---------------------------------------------------------------------------

const MODAL_W = 720;
const MODAL_H = 500;
const SIDEBAR_W = 140;
const HEADER_H = 44;
const FOOTER_H = 36;
const DESC_H = 32;
const CARD_H = 72;
const CARD_GAP = 6;
const GRID_PAD = 8;
const BODY_H = MODAL_H - HEADER_H - FOOTER_H;
const GRID_H = BODY_H - DESC_H;
const GRID_W = MODAL_W - SIDEBAR_W - 2; // account for border

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PixiFurnacePresetBrowserProps {
  isOpen?: boolean;
  onClose: () => void;
}

export const PixiFurnacePresetBrowser: React.FC<PixiFurnacePresetBrowserProps> = ({
  isOpen = true,
  onClose,
}) => {
  const theme = usePixiTheme();
  const [activeFamily, setActiveFamily] = useState<FamilyKey>('FM');
  const [scrollY, setScrollY] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const chips = CHIP_FAMILIES[activeFamily];

  // 2-column grid: calculate content height
  const colW = Math.floor((GRID_W - GRID_PAD * 2 - CARD_GAP) / 2);
  const rows = Math.ceil(chips.length / 2);
  const contentH = rows * (CARD_H + CARD_GAP) + GRID_PAD * 2;
  const maxScroll = Math.max(0, contentH - GRID_H);

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY((y) => Math.max(0, Math.min(maxScroll, y + e.deltaY)));
  }, [maxScroll]);

  const handleSelectChip = useCallback((chip: ChipEntry) => {
    useInstrumentStore.getState().createInstrument({
      name: chip.name,
      synthType: chip.id as SynthType,
    });
    notify.success(`Added: ${chip.name}`);
    onClose();
  }, [onClose]);

  const handleSwitchFamily = useCallback((family: FamilyKey) => {
    setActiveFamily(family);
    setScrollY(0);
  }, []);

  if (!isOpen) return null;

  return (
    <GlModal isOpen={isOpen} onClose={onClose} width={MODAL_W} height={MODAL_H}>
      {/* Header */}
      <Div
        className="flex-row items-center justify-between px-4"
        layout={{
          width: MODAL_W,
          height: HEADER_H,
          backgroundColor: theme.bgTertiary.color,
          borderBottomWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <Txt className="text-sm font-bold text-text-primary uppercase">Furnace Chip Browser</Txt>
        <Div
          eventMode="static"
          cursor="pointer"
          onPointerUp={onClose}
          layout={{ padding: 4 }}
        >
          <Txt className="text-sm font-bold text-text-muted">✕</Txt>
        </Div>
      </Div>

      {/* Body: sidebar + grid */}
      <Div className="flex-row" layout={{ flex: 1, minHeight: 0 }}>
        {/* Family sidebar */}
        <Div
          className="flex-col"
          layout={{
            width: SIDEBAR_W,
            borderRightWidth: 1,
            borderColor: theme.border.color,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          {FAMILY_ORDER.map((family) => {
            const isActive = activeFamily === family;
            return (
              <Div
                key={family}
                className="flex-col px-4 py-2"
                layout={{
                  width: SIDEBAR_W,
                  backgroundColor: isActive ? (theme.accent.color & 0xFFFFFF) : undefined,
                  ...(isActive ? { borderRightWidth: 2, borderColor: theme.accent.color } : {}),
                }}
                alpha={isActive ? 1 : 0.8}
                eventMode="static"
                cursor="pointer"
                onPointerUp={() => handleSwitchFamily(family)}
              >
                <pixiBitmapText
                  text={family}
                  style={{
                    fontFamily: PIXI_FONTS.SANS_BOLD,
                    fontSize: 12,
                    fill: 0xffffff,
                  }}
                  tint={isActive ? theme.accent.color : theme.textSecondary.color}
                  layout={{}}
                />
                <pixiBitmapText
                  text={`${CHIP_FAMILIES[family].length} chips`}
                  style={{
                    fontFamily: PIXI_FONTS.SANS,
                    fontSize: 10,
                    fill: 0xffffff,
                  }}
                  tint={theme.textMuted.color}
                  layout={{ marginTop: 2 }}
                />
              </Div>
            );
          })}
        </Div>

        {/* Right panel: description + chip grid */}
        <Div className="flex-col flex-1" layout={{ minWidth: 0, minHeight: 0 }}>
          {/* Family description */}
          <Div
            className="px-4 items-center"
            layout={{
              height: DESC_H,
              borderBottomWidth: 1,
              borderColor: theme.border.color,
            }}
          >
            <pixiBitmapText
              text={FAMILY_DESCRIPTIONS[activeFamily]}
              style={{
                fontFamily: PIXI_FONTS.SANS,
                fontSize: 11,
                fill: 0xffffff,
              }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </Div>

          {/* Scrollable chip grid */}
          <Div
            className="flex-1"
            layout={{ overflow: 'hidden' }}
            eventMode="static"
            onWheel={handleWheel as any}
          >
            <pixiContainer layout={{ position: 'absolute', top: -scrollY, width: GRID_W }}>
              <Div
                className="flex-row flex-wrap"
                layout={{
                  width: GRID_W,
                  padding: GRID_PAD,
                  gap: CARD_GAP,
                }}
              >
                {chips.map((chip) => {
                  const isHovered = hoveredId === chip.id;
                  return (
                    <ChipCard
                      key={chip.id}
                      chip={chip}
                      width={colW}
                      isHovered={isHovered}
                      theme={theme}
                      onSelect={handleSelectChip}
                      onHoverIn={() => setHoveredId(chip.id)}
                      onHoverOut={() => setHoveredId(null)}
                    />
                  );
                })}
              </Div>
            </pixiContainer>
          </Div>
        </Div>
      </Div>

      {/* Footer */}
      <Div
        className="flex-row items-center px-4"
        layout={{
          width: MODAL_W,
          height: FOOTER_H,
          backgroundColor: theme.bgTertiary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
        }}
      >
        <pixiBitmapText
          text="Click a chip to add it as a new instrument."
          style={{
            fontFamily: PIXI_FONTS.SANS,
            fontSize: 10,
            fill: 0xffffff,
          }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </Div>
    </GlModal>
  );
};

// ---------------------------------------------------------------------------
// ChipCard — individual chip entry in the grid
// ---------------------------------------------------------------------------

interface ChipCardProps {
  chip: ChipEntry;
  width: number;
  isHovered: boolean;
  theme: ReturnType<typeof usePixiTheme>;
  onSelect: (chip: ChipEntry) => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
}

const ChipCard: React.FC<ChipCardProps> = ({
  chip,
  width,
  isHovered,
  theme,
  onSelect,
  onHoverIn,
  onHoverOut,
}) => {
  const truncatedDesc = chip.description.length > 60
    ? chip.description.slice(0, 57) + '...'
    : chip.description;

  return (
    <Div
      className="flex-col"
      layout={{
        width,
        height: CARD_H,
        padding: 8,
        backgroundColor: isHovered ? (theme.accent.color & 0xFFFFFF) : theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: isHovered ? theme.accent.color : theme.border.color,
        borderRadius: 4,
        gap: 3,
      }}
      alpha={isHovered ? 1 : 0.95}
      eventMode="static"
      cursor="pointer"
      onPointerUp={() => onSelect(chip)}
      onPointerOver={onHoverIn}
      onPointerOut={onHoverOut}
    >
      {/* Chip name */}
      <pixiBitmapText
        text={chip.name}
        style={{
          fontFamily: PIXI_FONTS.SANS_SEMIBOLD,
          fontSize: 11,
          fill: 0xffffff,
        }}
        tint={isHovered ? theme.accent.color : theme.text.color}
        layout={{}}
      />
      {/* Description */}
      <pixiBitmapText
        text={truncatedDesc}
        style={{
          fontFamily: PIXI_FONTS.SANS,
          fontSize: 10,
          fill: 0xffffff,
        }}
        tint={theme.textMuted.color}
        layout={{}}
      />
      {/* Tags */}
      <Div className="flex-row" layout={{ gap: 4, marginTop: 2 }}>
        {chip.tags.slice(0, 3).map((tag) => (
          <Div
            key={tag}
            layout={{
              paddingLeft: 4,
              paddingRight: 4,
              paddingTop: 1,
              paddingBottom: 1,
              backgroundColor: theme.bgActive.color,
              borderRadius: 2,
              borderWidth: 1,
              borderColor: theme.borderLight.color,
            }}
          >
            <pixiBitmapText
              text={tag}
              style={{
                fontFamily: PIXI_FONTS.MONO,
                fontSize: 9,
                fill: 0xffffff,
              }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          </Div>
        ))}
      </Div>
    </Div>
  );
};
