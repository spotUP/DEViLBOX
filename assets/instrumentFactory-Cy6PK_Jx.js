import { e as useInstrumentStore, aP as DEFAULT_MODULAR_PATCH, p as DEFAULT_TB303 } from "./main-BbV5VyEH.js";
import "./client-DHYdgbIN.js";
import "./vendor-ui-AJ7AT9BN.js";
import "./vendor-react-Dgd_wxYf.js";
import "./vendor-utils-a-Usm5Xm.js";
import "./vendor-tone-48TQc1H3.js";
function findNextAvailableId(existingIds) {
  for (let id = 1; id <= 128; id++) {
    if (!existingIds.includes(id)) return id;
  }
  return 1;
}
function createDefaultTB303Instrument() {
  const existingIds = useInstrumentStore.getState().instruments.map((i) => i.id);
  const nextId = findNextAvailableId(existingIds);
  return {
    id: nextId,
    name: "TB-303",
    type: "synth",
    synthType: "TB303",
    tb303: { ...DEFAULT_TB303 },
    effects: [],
    volume: -6,
    pan: 0
  };
}
function createDefaultModularSynthInstrument() {
  const existingIds = useInstrumentStore.getState().instruments.map((i) => i.id);
  const nextId = findNextAvailableId(existingIds);
  return {
    id: nextId,
    name: "Modular Synth",
    type: "synth",
    synthType: "ModularSynth",
    modularSynth: { ...DEFAULT_MODULAR_PATCH },
    effects: [],
    volume: -6,
    pan: 0
  };
}
export {
  createDefaultModularSynthInstrument,
  createDefaultTB303Instrument
};
