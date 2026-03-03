/**
 * Pure helper functions extracted from TrackerView.tsx
 * - createInstrumentsForModule: Creates instrument configs from imported module data
 * - getChannelMetadataFromFurnace: Maps Furnace system presets to channel metadata
 */

import { SYSTEM_PRESETS, DivChanType } from '@/constants/systemPresets';
import { CHANNEL_COLORS } from '@typedefs';
import type { Pattern } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import { DEFAULT_OSCILLATOR, DEFAULT_ENVELOPE, DEFAULT_FILTER } from '@typedefs/instrument';

/** Create instruments for imported module, using samples if available */
export function createInstrumentsForModule(
  patterns: Pattern[],
  instrumentNames: string[],
  sampleUrls?: Map<number, string>
): InstrumentConfig[] {
  const usedInstruments = new Set<number>();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument !== null && cell.instrument > 0) {
          usedInstruments.add(cell.instrument);
        }
      }
    }
  }

  const instruments: InstrumentConfig[] = [];
  const oscillatorTypes: Array<'sine' | 'square' | 'sawtooth' | 'triangle'> =
    ['sawtooth', 'square', 'triangle', 'sine'];

  for (const instNum of Array.from(usedInstruments).sort((a, b) => a - b)) {
    const name = instrumentNames[instNum - 1] || `Instrument ${instNum}`;
    const sampleUrl = sampleUrls?.get(instNum);

    if (sampleUrl) {
      instruments.push({
        id: instNum,
        name: name.trim() || `Sample ${instNum}`,
        type: 'sample' as const,
        synthType: 'Sampler',
        effects: [],
        volume: -6,
        pan: 0,
        parameters: { sampleUrl },
      });
    } else {
      const oscType = oscillatorTypes[(instNum - 1) % oscillatorTypes.length];
      instruments.push({
        id: instNum,
        name: name.trim() || `Instrument ${instNum}`,
        type: 'synth' as const,
        synthType: 'Synth',
        oscillator: { ...DEFAULT_OSCILLATOR, type: oscType },
        envelope: { ...DEFAULT_ENVELOPE },
        filter: { ...DEFAULT_FILTER },
        effects: [],
        volume: -6,
        pan: 0,
      });
    }
  }

  // Ensure instruments 0 and 1 exist as defaults
  for (const defaultId of [0, 1]) {
    if (!usedInstruments.has(defaultId)) {
      const sampleUrl = sampleUrls?.get(defaultId);
      if (sampleUrl) {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? 'Default' : 'Sample 01',
          type: 'sample' as const,
          synthType: 'Sampler',
          effects: [],
          volume: -6,
          pan: 0,
          parameters: { sampleUrl },
        });
      } else {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? 'Default' : 'Instrument 01',
          type: 'synth' as const,
          synthType: 'Synth',
          oscillator: { ...DEFAULT_OSCILLATOR, type: 'sawtooth' },
          envelope: { ...DEFAULT_ENVELOPE },
          filter: { ...DEFAULT_FILTER },
          effects: [],
          volume: -6,
          pan: 0,
        });
      }
    }
  }

  instruments.sort((a, b) => a.id - b.id);
  return instruments;
}

/**
 * Generate channel metadata from Furnace system presets.
 * Maps each channel to its corresponding system/chip and applies preset names/types/colors.
 */
export function getChannelMetadataFromFurnace(
  systems: number[],
  systemChans: number[],
  totalChannels: number,
  channelShortNames?: string[],
  effectColumns?: number[]
): Array<{
  name: string;
  shortName: string;
  color: string | null;
  channelMeta: {
    importedFromMOD: boolean;
    furnaceType: number;
    hardwareName: string;
    shortName: string;
    systemId: number;
    channelType: 'sample' | 'synth';
    effectCols?: number;
  };
}> {
  const result: Array<{
    name: string;
    shortName: string;
    color: string | null;
    channelMeta: {
      importedFromMOD: boolean;
      furnaceType: number;
      hardwareName: string;
      shortName: string;
      systemId: number;
      channelType: 'sample' | 'synth';
      effectCols?: number;
    };
  }> = [];

  // Map DivChanType to color indices using CHANNEL_COLORS
  const getColorForType = (type: DivChanType): string | null => {
    switch (type) {
      case DivChanType.FM: return CHANNEL_COLORS[7]; // Blue
      case DivChanType.PULSE: return CHANNEL_COLORS[1]; // Red
      case DivChanType.WAVE: return CHANNEL_COLORS[3]; // Yellow
      case DivChanType.NOISE: return CHANNEL_COLORS[10]; // Gray
      case DivChanType.PCM: return CHANNEL_COLORS[4]; // Green
      case DivChanType.OP: return CHANNEL_COLORS[6]; // Cyan
      default: return null;
    }
  };

  let channelIndex = 0;
  
  // Iterate through each system and its channels
  for (let sysIdx = 0; sysIdx < systems.length && channelIndex < totalChannels; sysIdx++) {
    const systemId = systems[sysIdx];
    const numChansForSystem = systemChans[sysIdx] || 0;
    
    // Find the matching system preset by fileID
    const preset = SYSTEM_PRESETS.find(p => p.fileID === systemId);
    
    for (let localCh = 0; localCh < numChansForSystem && channelIndex < totalChannels; localCh++) {
      if (preset && localCh < preset.channelDefs.length) {
        const chDef = preset.channelDefs[localCh];
        result.push({
          name: chDef.name,
          shortName: channelShortNames?.[channelIndex] || chDef.shortName,
          color: getColorForType(chDef.type),
          channelMeta: {
            importedFromMOD: false,
            furnaceType: chDef.type,
            hardwareName: preset.name,
            shortName: channelShortNames?.[channelIndex] || chDef.shortName,
            systemId: systemId,
            channelType: chDef.type === DivChanType.PCM ? 'sample' : 'synth',
            effectCols: effectColumns?.[channelIndex] || 1,
          },
        });
      } else {
        // Fallback for unknown system or channel beyond preset definition
        result.push({
          name: `Channel ${channelIndex + 1}`,
          shortName: channelShortNames?.[channelIndex] || `${channelIndex + 1}`,
          color: null,
          channelMeta: {
            importedFromMOD: false,
            furnaceType: DivChanType.PULSE,
            hardwareName: preset?.name || 'Unknown',
            shortName: channelShortNames?.[channelIndex] || `${channelIndex + 1}`,
            systemId: systemId,
            channelType: 'synth',
            effectCols: effectColumns?.[channelIndex] || 1,
          },
        });
      }
      channelIndex++;
    }
  }

  // Fill any remaining channels with defaults
  while (result.length < totalChannels) {
    const ch = result.length;
    result.push({
      name: `Channel ${ch + 1}`,
      shortName: channelShortNames?.[ch] || `${ch + 1}`,
      color: null,
      channelMeta: {
        importedFromMOD: false,
        furnaceType: DivChanType.PULSE,
        hardwareName: 'Unknown',
        shortName: channelShortNames?.[ch] || `${ch + 1}`,
        systemId: 0,
        channelType: 'synth',
        effectCols: effectColumns?.[ch] || 1,
      },
    });
  }

  return result;
}
