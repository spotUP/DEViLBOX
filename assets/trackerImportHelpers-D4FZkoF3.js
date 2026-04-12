import { l as DEFAULT_FILTER, m as DEFAULT_ENVELOPE, n as DEFAULT_OSCILLATOR, bV as SYSTEM_PRESETS, bW as DivChanType, bX as CHANNEL_COLORS } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function createInstrumentsForModule(patterns, instrumentNames, sampleUrls) {
  const usedInstruments = /* @__PURE__ */ new Set();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument !== null && cell.instrument > 0) {
          usedInstruments.add(cell.instrument);
        }
      }
    }
  }
  const instruments = [];
  const oscillatorTypes = ["sawtooth", "square", "triangle", "sine"];
  for (const instNum of Array.from(usedInstruments).sort((a, b) => a - b)) {
    const name = instrumentNames[instNum - 1] || `Instrument ${instNum}`;
    const sampleUrl = sampleUrls == null ? void 0 : sampleUrls.get(instNum);
    if (sampleUrl) {
      instruments.push({
        id: instNum,
        name: name.trim() || `Sample ${instNum}`,
        type: "sample",
        synthType: "Sampler",
        effects: [],
        volume: -6,
        pan: 0,
        parameters: { sampleUrl }
      });
    } else {
      const oscType = oscillatorTypes[(instNum - 1) % oscillatorTypes.length];
      instruments.push({
        id: instNum,
        name: name.trim() || `Instrument ${instNum}`,
        type: "synth",
        synthType: "Synth",
        oscillator: { ...DEFAULT_OSCILLATOR, type: oscType },
        envelope: { ...DEFAULT_ENVELOPE },
        filter: { ...DEFAULT_FILTER },
        effects: [],
        volume: -6,
        pan: 0
      });
    }
  }
  for (const defaultId of [0, 1]) {
    if (!usedInstruments.has(defaultId)) {
      const sampleUrl = sampleUrls == null ? void 0 : sampleUrls.get(defaultId);
      if (sampleUrl) {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? "Default" : "Sample 01",
          type: "sample",
          synthType: "Sampler",
          effects: [],
          volume: -6,
          pan: 0,
          parameters: { sampleUrl }
        });
      } else {
        instruments.push({
          id: defaultId,
          name: defaultId === 0 ? "Default" : "Instrument 01",
          type: "synth",
          synthType: "Synth",
          oscillator: { ...DEFAULT_OSCILLATOR, type: "sawtooth" },
          envelope: { ...DEFAULT_ENVELOPE },
          filter: { ...DEFAULT_FILTER },
          effects: [],
          volume: -6,
          pan: 0
        });
      }
    }
  }
  instruments.sort((a, b) => a.id - b.id);
  return instruments;
}
function getChannelMetadataFromFurnace(systems, systemChans, totalChannels, channelShortNames, effectColumns) {
  const result = [];
  const getColorForType = (type) => {
    switch (type) {
      case DivChanType.FM:
        return CHANNEL_COLORS[7];
      // Blue
      case DivChanType.PULSE:
        return CHANNEL_COLORS[1];
      // Red
      case DivChanType.WAVE:
        return CHANNEL_COLORS[3];
      // Yellow
      case DivChanType.NOISE:
        return CHANNEL_COLORS[10];
      // Gray
      case DivChanType.PCM:
        return CHANNEL_COLORS[4];
      // Green
      case DivChanType.OP:
        return CHANNEL_COLORS[6];
      // Cyan
      default:
        return null;
    }
  };
  let channelIndex = 0;
  for (let sysIdx = 0; sysIdx < systems.length && channelIndex < totalChannels; sysIdx++) {
    const systemId = systems[sysIdx];
    const numChansForSystem = systemChans[sysIdx] || 0;
    const preset = SYSTEM_PRESETS.find((p) => p.fileID === systemId);
    for (let localCh = 0; localCh < numChansForSystem && channelIndex < totalChannels; localCh++) {
      if (preset && localCh < preset.channelDefs.length) {
        const chDef = preset.channelDefs[localCh];
        result.push({
          name: chDef.name,
          shortName: (channelShortNames == null ? void 0 : channelShortNames[channelIndex]) || chDef.shortName,
          color: getColorForType(chDef.type),
          channelMeta: {
            importedFromMOD: false,
            furnaceType: chDef.type,
            hardwareName: preset.name,
            shortName: (channelShortNames == null ? void 0 : channelShortNames[channelIndex]) || chDef.shortName,
            systemId,
            channelType: chDef.type === DivChanType.PCM ? "sample" : "synth",
            effectCols: (effectColumns == null ? void 0 : effectColumns[channelIndex]) || 1
          }
        });
      } else {
        result.push({
          name: `Channel ${channelIndex + 1}`,
          shortName: (channelShortNames == null ? void 0 : channelShortNames[channelIndex]) || `${channelIndex + 1}`,
          color: null,
          channelMeta: {
            importedFromMOD: false,
            furnaceType: DivChanType.PULSE,
            hardwareName: (preset == null ? void 0 : preset.name) || "Unknown",
            shortName: (channelShortNames == null ? void 0 : channelShortNames[channelIndex]) || `${channelIndex + 1}`,
            systemId,
            channelType: "synth",
            effectCols: (effectColumns == null ? void 0 : effectColumns[channelIndex]) || 1
          }
        });
      }
      channelIndex++;
    }
  }
  while (result.length < totalChannels) {
    const ch = result.length;
    result.push({
      name: `Channel ${ch + 1}`,
      shortName: (channelShortNames == null ? void 0 : channelShortNames[ch]) || `${ch + 1}`,
      color: null,
      channelMeta: {
        importedFromMOD: false,
        furnaceType: DivChanType.PULSE,
        hardwareName: "Unknown",
        shortName: (channelShortNames == null ? void 0 : channelShortNames[ch]) || `${ch + 1}`,
        systemId: 0,
        channelType: "synth",
        effectCols: (effectColumns == null ? void 0 : effectColumns[ch]) || 1
      }
    });
  }
  return result;
}
export {
  createInstrumentsForModule,
  getChannelMetadataFromFurnace
};
