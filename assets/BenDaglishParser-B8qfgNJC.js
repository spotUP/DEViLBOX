import { c2 as createSamplerInstrument } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
const DEFAULT_INSTRUMENTS = 8;
const ROWS_PER_PATTERN = 64;
const MAX_PATTERNS = 256;
const MAX_POSITION_LIST_LEN = 4096;
const MAX_TRACK_LEN = 4096;
function u16BE(buf, off) {
  return (buf[off] << 8 | buf[off + 1]) >>> 0;
}
function s16BE(buf, off) {
  const v = u16BE(buf, off);
  return v < 32768 ? v : v - 65536;
}
function u32BE(buf, off) {
  return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
}
function defaultFeatures() {
  return {
    maxTrackValue: 128,
    maxSampleMappingValue: 135,
    usesCxTrackEffects: true,
    uses9xTrackEffects: false,
    enablePortamento: true,
    enableVolumeFade: true,
    enableFinalVolumeSlide: false,
    enableC0TrackLoop: false,
    enableF0TrackLoop: false,
    extraTickArg: false,
    masterVolumeFadeVersion: -1,
    setSampleMappingVersion: 1,
    getSampleMappingVersion: 1,
    checkForTicks: false
  };
}
function bdExtractInfoFromInit(buf, startOfInit) {
  const searchLen = Math.min(buf.length, 12288);
  let index = startOfInit;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 65 && buf[index + 1] === 250 && buf[index + 4] === 34 && buf[index + 5] === 8) break;
  }
  if (index >= searchLen - 6) return null;
  const subSongListOffset = s16BE(buf, index + 2) + index + 2;
  index += 4;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 65 && buf[index + 1] === 250 && buf[index + 4] === 35 && buf[index + 5] === 72) break;
  }
  if (index >= searchLen - 6) return null;
  const sampleInfoOffsetTableOffset = s16BE(buf, index + 2) + index + 2;
  return { subSongListOffset, sampleInfoOffsetTableOffset };
}
function bdExtractInfoFromPlay(buf, startOfPlay) {
  const searchLen = Math.min(buf.length, 12288);
  let index = startOfPlay;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 71 && buf[index + 1] === 250 && (buf[index + 4] === 72 && buf[index + 5] === 128 || buf[index + 4] === 208 && buf[index + 5] === 64)) break;
  }
  if (index >= searchLen - 6) return null;
  const trackOffsetTableOffset = s16BE(buf, index + 2) + index + 2;
  index += 4;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 71 && buf[index + 1] === 250 && buf[index + 4] === 214 && buf[index + 5] === 192) break;
  }
  if (index >= searchLen - 6) return null;
  const tracksOffset = s16BE(buf, index + 2) + index + 2;
  return { trackOffsetTableOffset, tracksOffset };
}
function bdFindFeatures(buf, startOfPlay) {
  const f = defaultFeatures();
  const searchLen = Math.min(buf.length, 12288);
  let index = startOfPlay;
  for (; index < searchLen - 6; index += 2) {
    if (buf[index] === 16 && buf[index + 1] === 27) break;
  }
  if (index < searchLen - 6) {
    if (buf[index + 2] === 176 && buf[index + 3] === 60 || buf[index + 2] === 12 && buf[index + 3] === 0) {
      f.maxTrackValue = buf[index + 5];
    }
    for (index += 4; index < searchLen - 6; index += 2) {
      if ((buf[index] === 176 && buf[index + 1] === 60 || buf[index] === 12 && buf[index + 1] === 0) && buf[index + 4] === 108) break;
    }
    if (index < searchLen - 6) {
      const effect = buf[index + 2] << 8 | buf[index + 3];
      f.enableC0TrackLoop = effect === 192;
      f.enableF0TrackLoop = effect === 240;
      const jumpTarget = buf[index + 5] + index + 6;
      if (jumpTarget < buf.length - 1) {
        if (buf[jumpTarget] === 2 && buf[jumpTarget + 1] === 64) {
          f.setSampleMappingVersion = 1;
        } else if (buf[jumpTarget] === 4 && buf[jumpTarget + 1] === 0) {
          f.setSampleMappingVersion = 2;
        }
      }
    }
  }
  for (index = startOfPlay; index < searchLen - 2; index += 2) {
    if (buf[index] === 83 && buf[index + 1] === 44) break;
  }
  if (index < searchLen - 2) {
    for (; index >= startOfPlay; index -= 2) {
      if (buf[index] === 73 && buf[index + 1] === 250) break;
      if (buf[index] === 97 && buf[index + 1] === 0) {
        const methodIdx = s16BE(buf, index + 2) + index + 2;
        if (methodIdx >= 0 && methodIdx < searchLen - 14) {
          if (buf[methodIdx] === 74 && buf[methodIdx + 1] === 44 && buf[methodIdx + 4] === 103 && buf[methodIdx + 6] === 106 && buf[methodIdx + 8] === 48 && buf[methodIdx + 9] === 41) {
            f.enablePortamento = true;
          } else if (buf[methodIdx] === 74 && buf[methodIdx + 1] === 44 && buf[methodIdx + 4] === 103 && buf[methodIdx + 6] === 74 && buf[methodIdx + 7] === 44 && buf[methodIdx + 10] === 103) {
            f.enableVolumeFade = true;
          }
        }
      }
    }
  }
  if (buf[startOfPlay] === 97 && buf[startOfPlay + 1] === 0) {
    const handleEffectsStart = s16BE(buf, startOfPlay + 2) + startOfPlay + 2;
    if (handleEffectsStart >= 0 && handleEffectsStart < searchLen - 2) {
      for (index = handleEffectsStart; index < searchLen - 2; index += 2) {
        if (buf[index] === 78 && buf[index + 1] === 144) break;
      }
      if (index < searchLen - 2) {
        for (; index >= handleEffectsStart; index -= 2) {
          if (buf[index] === 78 && buf[index + 1] === 117) break;
          if (buf[index] === 97 && buf[index + 1] === 0) {
            const mi = s16BE(buf, index + 2) + index + 2;
            if (mi >= 0 && mi < searchLen - 14) {
              if (buf[mi] === 48 && buf[mi + 1] === 43 && buf[mi + 4] === 103 && buf[mi + 6] === 83 && buf[mi + 7] === 107) {
                f.enableFinalVolumeSlide = true;
              }
            }
          }
        }
        if (buf[handleEffectsStart] === 97 && buf[handleEffectsStart + 1] === 0) {
          const mvfIdx = s16BE(buf, handleEffectsStart + 2) + handleEffectsStart + 2;
          if (mvfIdx >= 0 && mvfIdx < searchLen - 24) {
            if (buf[mvfIdx] === 48 && buf[mvfIdx + 1] === 58 && buf[mvfIdx + 4] === 103 && buf[mvfIdx + 5] === 0) {
              f.masterVolumeFadeVersion = 1;
            } else if (buf[mvfIdx] === 16 && buf[mvfIdx + 1] === 58 && buf[mvfIdx + 4] === 103 && buf[mvfIdx + 5] === 0) {
              f.masterVolumeFadeVersion = 2;
            }
          }
        }
      }
    }
  }
  for (index = startOfPlay; index < searchLen - 4; index += 2) {
    if (buf[index] === 96 && buf[index + 1] === 0) break;
  }
  if (index < searchLen - 4) {
    const parseTrackStart = s16BE(buf, index + 2) + index + 2;
    if (parseTrackStart >= 0 && parseTrackStart < searchLen) {
      for (let i2 = parseTrackStart; i2 < searchLen - 8; i2 += 2) {
        if (buf[i2] === 114 && buf[i2 + 1] === 0 && buf[i2 + 2] === 18 && buf[i2 + 3] === 27) {
          f.extraTickArg = buf[i2 + 4] === 102;
          break;
        }
      }
      for (let i2 = parseTrackStart; i2 < searchLen - 4; i2 += 2) {
        if (buf[i2] === 97 && buf[i2 + 1] === 0) {
          const pteStart = s16BE(buf, i2 + 2) + i2 + 2;
          if (pteStart >= 0 && pteStart < searchLen - 12) {
            if (buf[pteStart + 2] === 176 && buf[pteStart + 3] === 60 || buf[pteStart + 2] === 12 && buf[pteStart + 3] === 0) {
              f.maxSampleMappingValue = buf[pteStart + 5];
              if (pteStart + 11 < searchLen) {
                if (buf[pteStart + 8] === 2 && buf[pteStart + 9] === 64 && buf[pteStart + 10] === 0) {
                  if (buf[pteStart + 11] === 7) f.getSampleMappingVersion = 1;
                  else if (buf[pteStart + 11] === 255) f.getSampleMappingVersion = 2;
                }
              }
              for (let i3 = pteStart + 12; i3 < searchLen - 6; i3 += 2) {
                if ((buf[i3] === 176 && buf[i3 + 1] === 60 || buf[i3] === 12 && buf[i3 + 1] === 0) && buf[i3 + 4] === 108) {
                  f.uses9xTrackEffects = (buf[i3 + 3] & 240) === 144;
                  f.usesCxTrackEffects = (buf[i3 + 3] & 240) === 192;
                  break;
                }
              }
            }
          }
          break;
        }
      }
    }
  }
  return f;
}
function bdFindOffsets(buf) {
  const len = buf.length;
  if (len < 5632) return null;
  if (buf[0] !== 96 || buf[1] !== 0 || buf[4] !== 96 || buf[5] !== 0 || buf[10] !== 96 || buf[11] !== 0) return null;
  const startOfInit = s16BE(buf, 2) + 2;
  const startOfPlay = s16BE(buf, 6) + 4 + 2;
  const searchLimit = Math.min(len, 12288);
  if (startOfInit < 0 || startOfInit >= searchLimit - 14) return null;
  if (startOfPlay < 0 || startOfPlay >= searchLimit) return null;
  if (buf[startOfInit] !== 63 || buf[startOfInit + 1] !== 0 || buf[startOfInit + 2] !== 97 || buf[startOfInit + 3] !== 0 || buf[startOfInit + 6] !== 61 || buf[startOfInit + 7] !== 124 || buf[startOfInit + 12] !== 65 || buf[startOfInit + 13] !== 250) return null;
  const initResult = bdExtractInfoFromInit(buf, startOfInit);
  if (!initResult) return null;
  const playResult = bdExtractInfoFromPlay(buf, startOfPlay);
  if (!playResult) return null;
  const features = bdFindFeatures(buf, startOfPlay);
  return {
    subSongListOffset: initResult.subSongListOffset,
    sampleInfoOffsetTableOffset: initResult.sampleInfoOffsetTableOffset,
    trackOffsetTableOffset: playResult.trackOffsetTableOffset,
    tracksOffset: playResult.tracksOffset,
    features
  };
}
function bdTrackCommandArgCount(cmd, nextByte, f) {
  if (cmd < 127) {
    if (f.extraTickArg && nextByte === 0) return 2;
    return 1;
  }
  if (cmd === 127) return 1;
  if (cmd <= f.maxSampleMappingValue) return 0;
  if (f.usesCxTrackEffects && cmd < 192 || f.uses9xTrackEffects && cmd < 155) return 0;
  if (cmd === 192 && f.usesCxTrackEffects && f.enablePortamento || cmd === 155 && f.uses9xTrackEffects && f.enablePortamento) return 3;
  if (cmd === 193 && f.usesCxTrackEffects && f.enablePortamento || cmd === 156 && f.uses9xTrackEffects && f.enablePortamento) return 0;
  if (cmd === 194 && f.usesCxTrackEffects && f.enableVolumeFade || cmd === 157 && f.uses9xTrackEffects && f.enableVolumeFade) return 3;
  if (cmd === 195 && f.usesCxTrackEffects && f.enableVolumeFade || cmd === 158 && f.uses9xTrackEffects && f.enableVolumeFade) return 0;
  if (cmd === 196 && f.usesCxTrackEffects && f.enablePortamento || cmd === 159 && f.uses9xTrackEffects && f.enablePortamento) return 1;
  if (cmd === 197 && f.usesCxTrackEffects && f.enablePortamento || cmd === 160 && f.uses9xTrackEffects && f.enablePortamento) return 0;
  if (cmd === 198 && f.usesCxTrackEffects && f.enableVolumeFade || cmd === 161 && f.uses9xTrackEffects && f.enableVolumeFade) {
    return f.enableFinalVolumeSlide ? 3 : 1;
  }
  if (cmd === 199 && f.usesCxTrackEffects && f.enableFinalVolumeSlide || cmd === 162 && f.uses9xTrackEffects && f.enableFinalVolumeSlide) return 0;
  return -1;
}
function bdPositionCommandArgCount(cmd, f) {
  if (cmd < f.maxTrackValue) return 0;
  if (f.enableC0TrackLoop) {
    if (cmd < 160) return 0;
    if (cmd < 200) return 1;
  }
  if (f.enableF0TrackLoop) {
    if (cmd < 240) return 0;
    if (cmd < 248) return 1;
  }
  if (cmd === 253 && f.masterVolumeFadeVersion > 0) return 1;
  if (cmd === 254) return 1;
  return -1;
}
function bdLoadSingleTrack(buf, offset, f) {
  if (offset < 0 || offset >= buf.length) return null;
  const data = [];
  let pos = offset;
  while (data.length < MAX_TRACK_LEN) {
    if (pos >= buf.length) return null;
    const cmd = buf[pos++];
    data.push(cmd);
    if (cmd === 255) break;
    if (pos >= buf.length) return null;
    const nextByte = buf[pos];
    const argCount = bdTrackCommandArgCount(cmd, nextByte, f);
    if (argCount === -1) return null;
    for (let i = 0; i < argCount; i++) {
      if (pos >= buf.length) return null;
      data.push(buf[pos++]);
    }
  }
  return new Uint8Array(data);
}
function bdLoadTracks(buf, offsets) {
  const numTracks = (offsets.subSongListOffset - offsets.trackOffsetTableOffset) / 2;
  if (numTracks <= 0 || numTracks > 1024) return null;
  const tablePos = offsets.trackOffsetTableOffset;
  if (tablePos < 0 || tablePos + numTracks * 2 > buf.length) return null;
  const tracks = [];
  for (let i = 0; i < numTracks; i++) {
    const trackOffset = u16BE(buf, tablePos + i * 2);
    const absOffset = offsets.tracksOffset + trackOffset;
    const trackData = bdLoadSingleTrack(buf, absOffset, offsets.features);
    if (!trackData) return null;
    tracks.push(trackData);
  }
  return tracks;
}
function bdLoadSubSongs(buf, subSongListOffset) {
  if (subSongListOffset < 0 || subSongListOffset >= buf.length) return null;
  const songs = [];
  let firstPosListOffset = 2147483647;
  let pos = subSongListOffset;
  do {
    if (pos + 8 > buf.length) return null;
    const pl = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      pl[i] = u16BE(buf, pos);
      pos += 2;
      if (pl[i] < firstPosListOffset) firstPosListOffset = pl[i];
    }
    songs.push({ positionLists: pl });
  } while (pos < subSongListOffset + firstPosListOffset);
  return songs.length > 0 ? songs : null;
}
function bdLoadPositionList(buf, offset, f) {
  if (offset < 0 || offset >= buf.length) return null;
  const data = [];
  let pos = offset;
  while (data.length < MAX_POSITION_LIST_LEN) {
    if (pos >= buf.length) return null;
    const cmd = buf[pos++];
    data.push(cmd);
    if (cmd === 255) break;
    const argCount = bdPositionCommandArgCount(cmd, f);
    if (argCount === -1) return null;
    for (let i = 0; i < argCount; i++) {
      if (pos >= buf.length) return null;
      data.push(buf[pos++]);
    }
  }
  return data;
}
function bdNoteToTrackerNote(note) {
  const n = note + 25;
  return n >= 1 && n <= 96 ? n : 0;
}
function bdExtractChannelEvents(posListData, tracks, f) {
  const events = [];
  let tick = 0;
  let transpose = 0;
  let currentInstrument = 1;
  let posIdx = 0;
  const maxEvents = 32768;
  const maxTicks = 65536;
  while (posIdx < posListData.length && events.length < maxEvents && tick < maxTicks) {
    const cmd = posListData[posIdx++];
    if (cmd === 255) break;
    if (cmd < f.maxTrackValue) {
      const trackIdx = cmd;
      if (trackIdx >= tracks.length) break;
      const track = tracks[trackIdx];
      tick = bdParseTrackEvents(track, f, events, tick, transpose, currentInstrument);
      continue;
    }
    if (cmd === 254) {
      if (posIdx >= posListData.length) break;
      const val = posListData[posIdx++];
      transpose = val < 128 ? val : val - 256;
      continue;
    }
    if (cmd === 253 && f.masterVolumeFadeVersion > 0) {
      posIdx++;
      continue;
    }
    if (f.enableC0TrackLoop && cmd >= 160 && cmd < 192) {
      continue;
    }
    if (f.enableC0TrackLoop && cmd >= 192 && cmd < 200) {
      if (posIdx >= posListData.length) break;
      const sampleIdx = Math.floor(posListData[posIdx++] / 4);
      const mapIndex = cmd & 7;
      if (mapIndex === 0) currentInstrument = sampleIdx + 1;
      continue;
    }
    if (f.enableF0TrackLoop && cmd >= 240 && cmd < 248) {
      if (posIdx >= posListData.length) break;
      const sampleIdx = Math.floor(posListData[posIdx++] / 4);
      const mapIndex = cmd - 240;
      if (mapIndex === 0) currentInstrument = sampleIdx + 1;
      continue;
    }
    if (!f.enableC0TrackLoop && !f.enableF0TrackLoop) {
      if (f.setSampleMappingVersion === 1 && cmd >= 192 && cmd < 200) {
        if (posIdx >= posListData.length) break;
        const sampleIdx = Math.floor(posListData[posIdx++] / 4);
        const mapIndex = cmd & 7;
        if (mapIndex === 0) currentInstrument = sampleIdx + 1;
        continue;
      }
      if (f.setSampleMappingVersion === 2 && cmd >= 240 && cmd < 248) {
        if (posIdx >= posListData.length) break;
        const sampleIdx = Math.floor(posListData[posIdx++] / 4);
        const mapIndex = cmd - 240;
        if (mapIndex === 0) currentInstrument = sampleIdx + 1;
        continue;
      }
    }
    if (f.enableF0TrackLoop && cmd < 240) continue;
    if (f.enableC0TrackLoop && cmd < 160) continue;
  }
  return events;
}
function bdParseTrackEvents(track, f, events, startTick, transpose, currentInstrument) {
  let tick = startTick;
  let pos = 0;
  let instrument = currentInstrument;
  const maxTicks = 65536;
  while (pos < track.length && tick < maxTicks) {
    const cmd = track[pos];
    if (cmd === 255) break;
    if (cmd < 127) {
      pos++;
      const note = cmd;
      const transposedNote = note + transpose & 127;
      const trackerNote = bdNoteToTrackerNote(transposedNote);
      if (pos >= track.length) break;
      let ticks = track[pos++];
      if (f.extraTickArg && ticks === 0) {
        if (pos >= track.length) break;
        ticks = track[pos++];
      }
      if (trackerNote > 0) {
        events.push({
          tick,
          note: trackerNote,
          instrument,
          effTyp: 0,
          eff: 0
        });
      }
      tick += Math.max(1, ticks);
      continue;
    }
    if (cmd === 127) {
      pos++;
      if (pos >= track.length) break;
      const ticks = track[pos++];
      tick += Math.max(1, ticks);
      continue;
    }
    if (cmd <= f.maxSampleMappingValue) {
      pos++;
      const index = f.getSampleMappingVersion === 1 ? cmd & 7 : cmd - 128;
      if (index === 0) {
        instrument = index + 1;
      }
      instrument = (cmd & 7) + 1;
      continue;
    }
    pos++;
    if (f.usesCxTrackEffects && cmd < 192 || f.uses9xTrackEffects && cmd < 155) {
      continue;
    }
    if (cmd === 192 && f.usesCxTrackEffects && f.enablePortamento || cmd === 155 && f.uses9xTrackEffects && f.enablePortamento) {
      pos += 3;
      continue;
    }
    if (cmd === 193 && f.usesCxTrackEffects && f.enablePortamento || cmd === 156 && f.uses9xTrackEffects && f.enablePortamento) continue;
    if (cmd === 194 && f.usesCxTrackEffects && f.enableVolumeFade || cmd === 157 && f.uses9xTrackEffects && f.enableVolumeFade) {
      pos += 3;
      continue;
    }
    if (cmd === 195 && f.usesCxTrackEffects && f.enableVolumeFade || cmd === 158 && f.uses9xTrackEffects && f.enableVolumeFade) continue;
    if (cmd === 196 && f.usesCxTrackEffects && f.enablePortamento || cmd === 159 && f.uses9xTrackEffects && f.enablePortamento) {
      pos += 1;
      continue;
    }
    if (cmd === 197 && f.usesCxTrackEffects && f.enablePortamento || cmd === 160 && f.uses9xTrackEffects && f.enablePortamento) continue;
    if (cmd === 198 && f.usesCxTrackEffects && f.enableVolumeFade || cmd === 161 && f.uses9xTrackEffects && f.enableVolumeFade) {
      pos += f.enableFinalVolumeSlide ? 3 : 1;
      continue;
    }
    if (cmd === 199 && f.usesCxTrackEffects && f.enableFinalVolumeSlide || cmd === 162 && f.uses9xTrackEffects && f.enableFinalVolumeSlide) continue;
    break;
  }
  return tick;
}
function bdBuildPatterns(channelEvents) {
  let maxTick = 0;
  for (const events of channelEvents) {
    for (const ev of events) {
      if (ev.tick > maxTick) maxTick = ev.tick;
    }
  }
  const totalRows = maxTick + 1;
  const numPatterns = Math.max(1, Math.ceil(totalRows / ROWS_PER_PATTERN));
  const patternLimit = Math.min(numPatterns, MAX_PATTERNS);
  const patterns = [];
  const channelEventMaps = channelEvents.map((events) => {
    const map = /* @__PURE__ */ new Map();
    for (const ev of events) map.set(ev.tick, ev);
    return map;
  });
  for (let p = 0; p < patternLimit; p++) {
    const startTick = p * ROWS_PER_PATTERN;
    const channels = [];
    for (let ch = 0; ch < 4; ch++) {
      const rows = [];
      const eventMap = channelEventMaps[ch];
      for (let r = 0; r < ROWS_PER_PATTERN; r++) {
        const ev = eventMap == null ? void 0 : eventMap.get(startTick + r);
        rows.push({
          note: (ev == null ? void 0 : ev.note) ?? 0,
          instrument: (ev == null ? void 0 : ev.instrument) ?? 0,
          volume: 0,
          effTyp: (ev == null ? void 0 : ev.effTyp) ?? 0,
          eff: (ev == null ? void 0 : ev.eff) ?? 0,
          effTyp2: 0,
          eff2: 0
        });
      }
      channels.push({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows
      });
    }
    patterns.push({
      id: `pattern-${p}`,
      name: `Pattern ${p}`,
      length: ROWS_PER_PATTERN,
      channels
    });
  }
  return { patterns, songPositions: patterns.map((_, i) => i) };
}
function extractBDPatterns(buf) {
  const offsets = bdFindOffsets(buf);
  if (!offsets) return null;
  const tracks = bdLoadTracks(buf, offsets);
  if (!tracks || tracks.length === 0) return null;
  const subSongs = bdLoadSubSongs(buf, offsets.subSongListOffset);
  if (!subSongs || subSongs.length === 0) return null;
  const song = subSongs[0];
  const f = offsets.features;
  const channelEvents = [];
  for (let ch = 0; ch < 4; ch++) {
    const plOffset = offsets.subSongListOffset + song.positionLists[ch];
    const posListData = bdLoadPositionList(buf, plOffset, f);
    if (!posListData) {
      channelEvents.push([]);
      continue;
    }
    const events = bdExtractChannelEvents(posListData, tracks, f);
    channelEvents.push(events);
  }
  const totalEvents = channelEvents.reduce((s, e) => s + e.length, 0);
  if (totalEvents === 0) return null;
  return bdBuildPatterns(channelEvents);
}
function isBenDaglishFormat(buffer, filename) {
  const buf = new Uint8Array(buffer);
  if (filename !== void 0) {
    const base = (filename.split("/").pop() ?? filename).toLowerCase();
    if (!base.endsWith(".bd") && !base.startsWith("bd.")) return false;
  }
  if (buf.length < 14) return false;
  if (u16BE(buf, 0) !== 24576) return false;
  const d1 = u16BE(buf, 2);
  if (d1 === 0 || d1 >= 32768 || (d1 & 1) !== 0) return false;
  if (u16BE(buf, 4) !== 24576) return false;
  const d2 = u16BE(buf, 6);
  if (d2 === 0 || d2 >= 32768 || (d2 & 1) !== 0) return false;
  if (u16BE(buf, 10) !== 24576) return false;
  const d3 = u16BE(buf, 12);
  if (d3 === 0 || d3 >= 32768 || (d3 & 1) !== 0) return false;
  const target = 2 + d1;
  if (target + 13 >= buf.length) return false;
  if (u32BE(buf, target) !== 1056989440) return false;
  if (u16BE(buf, target + 6) !== 15740) return false;
  if (u16BE(buf, target + 12) !== 16890) return false;
  return true;
}
async function parseBenDaglishFile(buffer, filename) {
  const baseName = filename.split("/").pop() ?? filename;
  const moduleName = baseName.replace(/\.bd$/i, "").replace(/^bd\./i, "") || baseName;
  const buf = new Uint8Array(buffer);
  const instruments = [];
  let samplesExtracted = false;
  {
    let sampleInfo1Off = -1;
    for (let i = 0; i < Math.min(buf.length - 4, 8192); i += 2) {
      if (u16BE(buf, i) !== 16890) continue;
      const disp = u16BE(buf, i + 2);
      const signedDisp = disp < 32768 ? disp : disp - 65536;
      const target = i + 2 + signedDisp;
      if (target < 0 || target + 16 > buf.length) continue;
      let count = 0;
      for (let j = 0; j < 64; j++) {
        const off = target + j * 4;
        if (off + 4 > buf.length) break;
        const v = u32BE(buf, off);
        if (v === 0 || v >>> 16 !== 0) break;
        count++;
      }
      if (count >= 3) {
        sampleInfo1Off = target;
        break;
      }
    }
    if (sampleInfo1Off > 0 && sampleInfo1Off < buf.length) {
      const sampleDescs = [];
      for (let i = 0; i < 64; i++) {
        const off = sampleInfo1Off + i * 4;
        if (off + 4 > buf.length) break;
        const v = u32BE(buf, off);
        if (v === 0 || v >>> 16 !== 0) break;
        sampleDescs.push(v);
      }
      for (let i = 0; i < sampleDescs.length; i++) {
        const descFileOff = sampleInfo1Off + sampleDescs[i];
        if (descFileOff + 12 > buf.length) continue;
        const sampleOff = u32BE(buf, descFileOff);
        const loopOff = u32BE(buf, descFileOff + 4);
        const lenWords = u16BE(buf, descFileOff + 8);
        const loopLenWords = u16BE(buf, descFileOff + 10);
        const pcmFileOff = sampleInfo1Off + sampleOff;
        const lenBytes = lenWords * 2;
        if (lenBytes > 0 && pcmFileOff > 0 && pcmFileOff + lenBytes <= buf.length) {
          const isFORM = pcmFileOff + 4 <= buf.length && buf[pcmFileOff] === 70 && buf[pcmFileOff + 1] === 79 && buf[pcmFileOff + 2] === 82 && buf[pcmFileOff + 3] === 77;
          let pcm;
          if (isFORM) {
            pcm = new Uint8Array(0);
            for (let j = pcmFileOff + 12; j < pcmFileOff + lenBytes - 8; j += 2) {
              if (buf[j] === 66 && buf[j + 1] === 79 && buf[j + 2] === 68 && buf[j + 3] === 89) {
                const bodyLen = u32BE(buf, j + 4);
                const bodyOff = j + 8;
                pcm = new Uint8Array(Math.min(bodyLen, buf.length - bodyOff));
                for (let k = 0; k < pcm.length; k++) pcm[k] = buf[bodyOff + k];
                break;
              }
            }
            if (pcm.length === 0) {
              pcm = new Uint8Array(lenBytes);
              for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
            }
          } else {
            pcm = new Uint8Array(lenBytes);
            for (let k = 0; k < lenBytes; k++) pcm[k] = buf[pcmFileOff + k];
          }
          const hasLoop = sampleOff !== loopOff && loopLenWords > 0;
          const loopStartBytes = hasLoop ? sampleInfo1Off + loopOff - pcmFileOff : 0;
          const loopEndBytes = hasLoop ? loopStartBytes + loopLenWords * 2 : 0;
          instruments.push(createSamplerInstrument(
            i + 1,
            `BD Sample ${i + 1}`,
            pcm,
            64,
            8287,
            Math.max(0, loopStartBytes),
            Math.max(0, loopEndBytes)
          ));
          samplesExtracted = true;
        }
      }
    }
  }
  if (!samplesExtracted || instruments.length === 0) {
    instruments.length = 0;
    for (let i = 0; i < DEFAULT_INSTRUMENTS; i++) {
      instruments.push({
        id: i + 1,
        name: `BD Sample ${i + 1}`,
        type: "synth",
        synthType: "Synth",
        effects: [],
        volume: 0,
        pan: 0
      });
    }
  }
  const patternResult = extractBDPatterns(buf);
  let patterns;
  let songPositions;
  if (patternResult) {
    patterns = patternResult.patterns;
    songPositions = patternResult.songPositions;
  } else {
    const emptyRows = Array.from({ length: 64 }, () => ({
      note: 0,
      instrument: 0,
      volume: 0,
      effTyp: 0,
      eff: 0,
      effTyp2: 0,
      eff2: 0
    }));
    patterns = [{
      id: "pattern-0",
      name: "Pattern 0",
      length: 64,
      channels: Array.from({ length: 4 }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false,
        solo: false,
        collapsed: false,
        volume: 100,
        pan: ch === 0 || ch === 3 ? -50 : 50,
        instrumentId: null,
        color: null,
        rows: emptyRows
      }))
    }];
    songPositions = [0];
  }
  if (patterns.length > 0) {
    patterns[0].importMetadata = {
      sourceFormat: "MOD",
      sourceFile: filename,
      importedAt: (/* @__PURE__ */ new Date()).toISOString(),
      originalChannelCount: 4,
      originalPatternCount: patterns.length,
      originalInstrumentCount: instruments.length
    };
  }
  return {
    name: `${moduleName} [Ben Daglish]`,
    format: "MOD",
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    bdFileData: buffer.slice(0),
    uadeEditableFileData: buffer.slice(0),
    uadeEditableFileName: filename
  };
}
export {
  isBenDaglishFormat,
  parseBenDaglishFile
};
