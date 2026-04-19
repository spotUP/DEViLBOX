import { describe, it, expect, beforeEach } from 'vitest';
import { useInstrumentStore } from '../useInstrumentStore';
import { resetStore } from './_harness';

describe('useInstrumentStore — lifecycle', () => {
  beforeEach(() => resetStore(useInstrumentStore));

  it('starts with an empty bank and a defined load version', () => {
    const s = useInstrumentStore.getState();
    expect(Array.isArray(s.instruments)).toBe(true);
    expect(s.instruments).toHaveLength(0);
    expect(typeof s.instrumentLoadVersion).toBe('number');
  });

  it('createInstrument populates the bank and returns a fresh id', () => {
    const id = useInstrumentStore.getState().createInstrument();
    const s = useInstrumentStore.getState();
    expect(typeof id).toBe('number');
    expect(s.instruments).toHaveLength(1);
    expect(s.instruments[0].id).toBe(id);
  });

  it('cloneInstrument produces a distinct id and grows the bank by one', () => {
    const sourceId = useInstrumentStore.getState().createInstrument();
    const cloneId = useInstrumentStore.getState().cloneInstrument(sourceId);
    const s = useInstrumentStore.getState();
    expect(s.instruments).toHaveLength(2);
    expect(cloneId).not.toBe(sourceId);
    expect(s.instruments.some((i) => i.id === cloneId)).toBe(true);
  });

  it('deleteInstrument removes the target but never the last survivor', () => {
    const a = useInstrumentStore.getState().createInstrument();
    const b = useInstrumentStore.getState().createInstrument();
    expect(useInstrumentStore.getState().instruments).toHaveLength(2);

    useInstrumentStore.getState().deleteInstrument(a);
    expect(useInstrumentStore.getState().instruments).toHaveLength(1);
    expect(useInstrumentStore.getState().instruments[0].id).toBe(b);

    // Trying to delete the last one is a no-op (length > 1 guard in the store).
    useInstrumentStore.getState().deleteInstrument(b);
    expect(useInstrumentStore.getState().instruments).toHaveLength(1);
  });

  it('setCurrentInstrument accepts an existing id and ignores unknown ones', () => {
    const id = useInstrumentStore.getState().createInstrument();
    useInstrumentStore.getState().setCurrentInstrument(id);
    expect(useInstrumentStore.getState().currentInstrumentId).toBe(id);

    const before = useInstrumentStore.getState().currentInstrumentId;
    useInstrumentStore.getState().setCurrentInstrument(-9999);
    expect(useInstrumentStore.getState().currentInstrumentId).toBe(before);
  });

  it('updateInstrument merges partial updates by id', () => {
    const id = useInstrumentStore.getState().createInstrument();
    useInstrumentStore.getState().updateInstrument(id, { name: 'regression-probe' });
    const inst = useInstrumentStore.getState().instruments.find((i) => i.id === id)!;
    expect(inst.name).toBe('regression-probe');
  });
});
