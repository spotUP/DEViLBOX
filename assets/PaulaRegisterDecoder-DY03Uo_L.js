const PAULA_REG_LCH = 0;
const PAULA_REG_LCL = 1;
const PAULA_REG_LEN = 2;
const PAULA_REG_PER = 3;
const PAULA_REG_VOL = 4;
const PAULA_REG_DAT = 5;
function decodePaulaRegister(channel, reg, value) {
  const prefix = `paula.${channel}`;
  switch (reg) {
    case PAULA_REG_PER:
      return [{ paramId: `${prefix}.period`, value: Math.min(1, value / 65535) }];
    case PAULA_REG_VOL:
      return [{ paramId: `${prefix}.volume`, value: Math.min(1, value / 64) }];
    case PAULA_REG_LCH:
      return [{ paramId: `${prefix}.sampleAddrHi`, value: value / 65535 }];
    case PAULA_REG_LCL:
      return [{ paramId: `${prefix}.sampleAddrLo`, value: value / 65535 }];
    case PAULA_REG_LEN:
      return [{ paramId: `${prefix}.sampleLen`, value: Math.min(1, value / 65535) }];
    case PAULA_REG_DAT:
      return [{ paramId: `${prefix}.data`, value: value / 65535 }];
    default:
      return [];
  }
}
export {
  decodePaulaRegister
};
