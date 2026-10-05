/**
 * Formats whose engine runs the tune's own player program have nothing to
 * edit and open in the scope view (editor mode 'sc68'), each labelled as
 * itself (owner, 2026-10-05). ASAP, AY and QSF opened as an empty classic
 * grid; the scope view called every one of them "SC68".
 */
import { describe, it, expect } from 'vitest';
import { useFormatStore } from '@/stores/useFormatStore';
import { scopeFormatLabel } from '@/lib/tracker/scopeFormatLabel';

const bytes = () => new ArrayBuffer(16);

describe('player-program formats open in the scope view', () => {
  for (const [field, format] of [
    ['sndhFileData', 'SNDH'], ['sc68FileData', 'SC68'], ['asapFileData', 'SAP'],
    ['ayFileData', 'AY'], ['qsfFileData', 'QSF'],
  ] as const) {
    it(`${format}: scope view, labelled ${format}`, () => {
      useFormatStore.getState().applyEditorMode({ [field]: bytes() });
      const st = useFormatStore.getState();
      expect(st.editorMode).toBe('sc68');
      expect(scopeFormatLabel(st)?.format).toBe(format);
    });
  }

  // game-music-emu songs share one field; the label is read from the file's header.
  const header = (magic: string, size = 0x100): ArrayBuffer => {
    const b = new Uint8Array(size);
    for (let i = 0; i < magic.length; i++) b[i] = magic.charCodeAt(i);
    return b.buffer;
  };
  const vgm = (clocks: Record<number, number>): ArrayBuffer => {
    const buf = header('Vgm ');
    const dv = new DataView(buf);
    dv.setUint32(0x08, 0x150, true);
    dv.setUint32(0x34, 0x100 - 0x34, true);
    for (const [off, hz] of Object.entries(clocks)) dv.setUint32(Number(off), hz, true);
    return buf;
  };
  for (const [name, data, format, chip] of [
    ['NSF', header('NESM\x1a'), 'NSF', '2A03'],
    ['NSFE', header('NSFE'), 'NSFE', '2A03'],
    ['GBS', header('GBS\x01'), 'GBS', 'DMG APU'],
    ['HES', header('HESM'), 'HES', 'HuC6280'],
    ['KSS', header('KSCC'), 'KSS', 'AY-3-8910 + SCC'],
    ['SPC', header('SNES-SPC700 Sound File Data v0.30'), 'SPC', 'S-DSP'],
    ['VGM (Master System)', vgm({ 0x0C: 3579545 }), 'VGM', 'SN76489'],
    ['VGM (Mega Drive)', vgm({ 0x0C: 3579545, 0x2C: 7670453 }), 'VGM', 'YM2612 + SN76489'],
    ['GYM', header('GYMX'), 'GYM', 'YM2612 + SN76489'],
  ] as const) {
    it(`${name} on game-music-emu: scope view, labelled ${format} on ${chip}`, () => {
      useFormatStore.getState().applyEditorMode({ gmeFileData: data });
      const st = useFormatStore.getState();
      expect(st.editorMode).toBe('sc68');
      expect(scopeFormatLabel(st)).toMatchObject({ format, chip });
    });
  }

  it('S98 on ymfm: scope view, labelled S98 with its logged chips', () => {
    const buf = header('S983', 0x40);
    const dv = new DataView(buf);
    dv.setUint32(0x1C, 2, true);
    dv.setUint32(0x20, 1, true); dv.setUint32(0x24, 4_000_000, true);
    dv.setUint32(0x30, 5, true); dv.setUint32(0x34, 4_000_000, true);
    useFormatStore.getState().applyEditorMode({ s98FileData: buf });
    const st = useFormatStore.getState();
    expect(st.editorMode).toBe('sc68');
    expect(scopeFormatLabel(st)).toMatchObject({ format: 'S98', chip: 'YM2149 + YM2151' });
    // v1 has no device table: the format's default YM2608.
    useFormatStore.getState().applyEditorMode({ s98FileData: header('S981', 0x40) });
    expect(scopeFormatLabel(useFormatStore.getState())).toMatchObject({ format: 'S98', chip: 'YM2608' });
  });

  it('a plain module stays in the classic grid', () => {
    useFormatStore.getState().applyEditorMode({});
    expect(useFormatStore.getState().editorMode).toBe('classic');
    expect(scopeFormatLabel(useFormatStore.getState())).toBeNull();
  });
});
