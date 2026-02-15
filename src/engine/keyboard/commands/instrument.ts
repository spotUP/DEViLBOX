/**
 * Instrument Commands - Instrument selection and navigation
 */

import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';

/**
 * Select previous instrument
 */
export function prevInstrument(): boolean {
  const { currentInstrumentId, instruments, setCurrentInstrument } = useInstrumentStore.getState();
  
  if (instruments.length === 0) return true;
  
  const currentIndex = instruments.findIndex(i => i.id === currentInstrumentId);
  const newIndex = currentIndex > 0 ? currentIndex - 1 : instruments.length - 1;
  const newInstrument = instruments[newIndex];
  
  setCurrentInstrument(newInstrument.id);
  useUIStore.getState().setStatusMessage(`Instrument: ${newInstrument.name || newInstrument.id}`, false, 1000);
  
  return true;
}

/**
 * Select next instrument
 */
export function nextInstrument(): boolean {
  const { currentInstrumentId, instruments, setCurrentInstrument } = useInstrumentStore.getState();
  
  if (instruments.length === 0) return true;
  
  const currentIndex = instruments.findIndex(i => i.id === currentInstrumentId);
  const newIndex = currentIndex < instruments.length - 1 ? currentIndex + 1 : 0;
  const newInstrument = instruments[newIndex];
  
  setCurrentInstrument(newInstrument.id);
  useUIStore.getState().setStatusMessage(`Instrument: ${newInstrument.name || newInstrument.id}`, false, 1000);
  
  return true;
}

/**
 * Select instrument by number (1-10 for Alt+1 through Alt+0)
 */
function createSetInstrumentCommand(num: number) {
  return function(): boolean {
    const { instruments, setCurrentInstrument } = useInstrumentStore.getState();
    
    // num is 1-10, array is 0-9
    const index = num - 1;
    if (index >= 0 && index < instruments.length) {
      const instrument = instruments[index];
      setCurrentInstrument(instrument.id);
      useUIStore.getState().setStatusMessage(`Instrument ${num}: ${instrument.name || instrument.id}`, false, 1000);
    } else {
      useUIStore.getState().setStatusMessage(`Instrument ${num} not loaded`, false, 1000);
    }
    
    return true;
  };
}

export const setInstrument1 = createSetInstrumentCommand(1);
export const setInstrument2 = createSetInstrumentCommand(2);
export const setInstrument3 = createSetInstrumentCommand(3);
export const setInstrument4 = createSetInstrumentCommand(4);
export const setInstrument5 = createSetInstrumentCommand(5);
export const setInstrument6 = createSetInstrumentCommand(6);
export const setInstrument7 = createSetInstrumentCommand(7);
export const setInstrument8 = createSetInstrumentCommand(8);
export const setInstrument9 = createSetInstrumentCommand(9);
export const setInstrument10 = createSetInstrumentCommand(10);
