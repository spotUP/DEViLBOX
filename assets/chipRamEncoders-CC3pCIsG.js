function encodeFCVolEnvelope(cfg) {
  const buf = new Uint8Array(59);
  let pos = 0;
  const volSpeed = Math.max(1, cfg.synthSpeed ?? 1);
  const atkVol = Math.min(64, Math.max(0, cfg.atkVolume ?? 0));
  const decVol = Math.min(64, Math.max(0, cfg.decVolume ?? 0));
  const susVol = Math.min(64, Math.max(0, cfg.sustVolume ?? 0));
  const atkLen = Math.max(0, cfg.atkLength ?? 0);
  const decLen = Math.max(0, cfg.decLength ?? 0);
  const relLen = Math.max(0, cfg.relLength ?? 0);
  pos = encodeRamp(buf, pos, 0, atkVol, atkLen, volSpeed);
  if (pos < 57 && atkVol > 0) {
    buf[pos++] = atkVol;
  }
  if (decLen > 0 && atkVol !== decVol) {
    pos = encodeRamp(buf, pos, atkVol, decVol, decLen, volSpeed);
  }
  if (pos < 57 && decVol !== susVol) {
    buf[pos++] = susVol;
  }
  if (pos < 56) {
    buf[pos++] = susVol;
    buf[pos++] = 232;
    buf[pos++] = 255;
  }
  if (relLen > 0 && susVol > 0) {
    pos = encodeRamp(buf, pos, susVol, 0, relLen, volSpeed);
  }
  if (pos < 58) buf[pos++] = 0;
  if (pos < 59) buf[pos++] = 225;
  return buf.subarray(0, pos);
}
function encodeRamp(buf, pos, fromVol, toVol, durationTicks, volSpeed) {
  if (durationTicks <= 0 || fromVol === toVol) return pos;
  const steps = Math.max(1, Math.round(durationTicks / volSpeed));
  if (steps <= 20 && pos + steps < 56) {
    for (let i = 1; i <= steps && pos < 56; i++) {
      const v = Math.round(fromVol + (toVol - fromVol) * i / steps);
      buf[pos++] = Math.max(0, Math.min(64, v));
    }
  } else if (pos + 4 < 56) {
    const delta = toVol - fromVol;
    const halfDur = Math.max(1, Math.ceil(durationTicks / 2));
    let speed = Math.round(delta / halfDur);
    if (speed === 0) speed = delta > 0 ? 1 : -1;
    speed = Math.max(-128, Math.min(127, speed));
    buf[pos++] = 234;
    buf[pos++] = speed < 0 ? speed + 256 & 255 : speed & 255;
    buf[pos++] = Math.min(255, durationTicks) & 255;
  }
  return pos;
}
function encodeSoundMonADSR(cfg, maxLen) {
  const len = Math.max(1, Math.min(256, maxLen));
  const buf = new Uint8Array(len);
  const atkVol = Math.min(64, Math.max(0, cfg.attackVolume ?? 64));
  const decVol = Math.min(64, Math.max(0, cfg.decayVolume ?? 32));
  const susVol = Math.min(64, Math.max(0, cfg.sustainVolume ?? 32));
  const relVol = Math.min(64, Math.max(0, cfg.releaseVolume ?? 0));
  const atkSpd = Math.max(1, cfg.attackSpeed ?? 4);
  const decSpd = Math.max(1, cfg.decaySpeed ?? 4);
  const susLen = Math.max(0, cfg.sustainLength ?? 0);
  const relSpd = Math.max(1, cfg.releaseSpeed ?? 4);
  let pos = 0;
  for (let i = 0; i < atkSpd && pos < len; i++) {
    buf[pos++] = Math.round(atkVol * (i + 1) / atkSpd);
  }
  if (atkVol !== decVol) {
    for (let i = 0; i < decSpd && pos < len; i++) {
      buf[pos++] = Math.round(atkVol + (decVol - atkVol) * (i + 1) / decSpd);
    }
  }
  const holdVol = susVol;
  const holdLen = susLen > 0 ? susLen : Math.max(1, len - pos - relSpd - 1);
  for (let i = 0; i < holdLen && pos < len; i++) {
    buf[pos++] = holdVol;
  }
  if (susVol !== relVol) {
    for (let i = 0; i < relSpd && pos < len; i++) {
      buf[pos++] = Math.round(susVol + (relVol - susVol) * (i + 1) / relSpd);
    }
  }
  while (pos < len) {
    buf[pos++] = relVol;
  }
  return buf;
}
function encodeFCFreqMacro(synthTable, arpTable) {
  const buf = new Uint8Array(64);
  let pos = 0;
  for (let i = 0; i < synthTable.length && pos < 60; i++) {
    const step = synthTable[i];
    if (step.transposition !== 0 && pos + 3 < 62) {
      buf[pos++] = 227;
      const t = step.transposition & 65535;
      buf[pos++] = t & 255;
      buf[pos++] = t >> 8 & 255;
    }
    if (pos + 2 < 62) {
      buf[pos++] = step.effect === 1 ? 226 : 228;
      buf[pos++] = Math.min(56, Math.max(0, step.waveNum)) + 10;
    }
  }
  const hasArp = arpTable.some((v) => v !== 0);
  if (hasArp && pos < 58) {
    const loopStart = pos;
    for (let i = 0; i < arpTable.length && pos + 3 < 60; i++) {
      if (arpTable[i] !== 0) {
        buf[pos++] = 227;
        const t = arpTable[i] & 65535;
        buf[pos++] = t & 255;
        buf[pos++] = t >> 8 & 255;
      }
    }
    if (pos + 2 < 62) {
      buf[pos++] = 224;
      buf[pos++] = loopStart & 63;
    }
  }
  if (pos < 64) buf[pos++] = 225;
  while (pos < 64) buf[pos++] = 225;
  return buf;
}
function generateSoundMonWaveform(waveType) {
  const buf = new Uint8Array(64);
  switch (waveType) {
    case 0:
      for (let i = 0; i < 64; i++) buf[i] = i < 32 ? 255 : 0;
      break;
    case 1:
      for (let i = 0; i < 64; i++) buf[i] = 255 - Math.round(i / 63 * 255);
      break;
    case 2:
      for (let i = 0; i < 64; i++)
        buf[i] = i < 32 ? Math.round(i / 31 * 255) : Math.round((63 - i) / 31 * 255);
      break;
    case 3:
      for (let i = 0; i < 64; i++) buf[i] = Math.round(Math.random() * 255);
      break;
    case 4:
      for (let i = 0; i < 64; i++) buf[i] = i < 16 ? 255 : 0;
      break;
    case 5:
      for (let i = 0; i < 64; i++) buf[i] = i < 8 ? 255 : 0;
      break;
    case 6:
      for (let i = 0; i < 64; i++) buf[i] = i >= 16 && i < 24 ? 255 : 0;
      break;
    case 7:
      for (let i = 0; i < 64; i++) buf[i] = i >= 48 ? 255 : 0;
      break;
    case 8:
      for (let i = 0; i < 64; i++) buf[i] = Math.round(128 + 127 * Math.sin(i / 64 * Math.PI * 2));
      break;
    case 9:
      for (let i = 0; i < 64; i++) {
        const t = i < 32 ? i / 31 : (63 - i) / 31;
        buf[i] = Math.round(128 + 127 * (2 * t - 1));
      }
      break;
    case 10:
      for (let i = 0; i < 64; i++) {
        const saw = 1 - i / 63 * 2;
        const sin2 = Math.sin(i / 64 * Math.PI * 4) * 0.3;
        buf[i] = Math.round(128 + 127 * Math.max(-1, Math.min(1, saw + sin2)));
      }
      break;
    case 11:
      for (let i = 0; i < 64; i++) {
        const sq = i < 32 ? 1 : -1;
        const h3 = Math.sin(i / 64 * Math.PI * 6) * 0.2;
        buf[i] = Math.round(128 + 127 * Math.max(-1, Math.min(1, sq * 0.8 + h3)));
      }
      break;
    case 12:
      for (let i = 0; i < 64; i++) {
        const s1 = Math.sin(i / 64 * Math.PI * 2);
        const s2 = Math.sin(i / 64 * Math.PI * 4);
        buf[i] = Math.round(128 + 127 * s1 * s2);
      }
      break;
    case 13:
      for (let i = 0; i < 64; i++) {
        const tri = i < 32 ? i / 31 * 2 - 1 : (63 - i) / 31 * 2 - 1;
        const s2 = Math.sin(i / 64 * Math.PI * 6);
        buf[i] = Math.round(128 + 127 * tri * s2);
      }
      break;
    case 14:
      for (let i = 0; i < 64; i++) {
        const mod = Math.sin(i / 64 * Math.PI * 4) * 2;
        buf[i] = Math.round(128 + 127 * Math.sin(i / 64 * Math.PI * 2 + mod));
      }
      break;
    case 15:
      for (let i = 0; i < 64; i++) {
        const mod = Math.sin(i / 64 * Math.PI * 6) * 3;
        buf[i] = Math.round(128 + 127 * Math.sin(i / 64 * Math.PI * 2 + mod));
      }
      break;
    default:
      buf.fill(128);
  }
  return buf;
}
export {
  encodeFCVolEnvelope as a,
  encodeFCFreqMacro as b,
  encodeSoundMonADSR as e,
  generateSoundMonWaveform as g
};
