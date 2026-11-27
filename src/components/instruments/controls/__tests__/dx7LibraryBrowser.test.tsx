/**
 * The library browser narrows 246 banks with a live filter and lists the matching voices in one flat list.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Dx7LibraryBrowser } from '../Dx7LibraryBrowser';
import { filterDX7Library, flattenDX7Matches, type DX7LibraryManifest } from '../../../../engine/dx7/dx7Library';

afterEach(cleanup);

const bank = (n: number, name: string, author: string, voices: string[]) =>
  ({ file: `b${n}.syx`, name, author, source: `https://example.test/${n}`, licence: 'CC0', voiceCount: voices.length, voices });
const SMALL: DX7LibraryManifest = {
  version: 1,
  banks: [
    bank(1, 'Rhodes Collection', 'Ann Author', ['E.PIANO 1', 'BASS 1', 'BRASS 1']),
    bank(2, 'Synth Bass Pack', 'Bo Builder', ['SUB BASS', 'WOBBLE', 'PLUCK']),
    bank(3, 'Strings and Pads', 'Cy Creator', ['STRINGS 1', 'WARM PAD']),
  ],
};

describe('filterDX7Library', () => {
  it('no query lists every bank with every voice', () => {
    expect(filterDX7Library(SMALL.banks, '').map((m) => m.voices.length)).toEqual([3, 3, 2]);
  });
  it('a word in a bank name keeps that bank with all its voices', () => {
    const m = filterDX7Library(SMALL.banks, 'rhodes');
    expect(m.map((x) => x.bank.name)).toEqual(['Rhodes Collection']);
    expect(m[0].voices).toEqual([0, 1, 2]);
  });
  it('a word in a voice name keeps the banks that hold it, listing only those voices', () => {
    const m = filterDX7Library(SMALL.banks, 'bass');
    expect(m.map((x) => [x.bank.name, x.voices])).toEqual([['Rhodes Collection', [1]], ['Synth Bass Pack', [0, 1, 2]]]);
  });
  it('words are combined across bank text and voice name, and the author is searchable', () => {
    expect(filterDX7Library(SMALL.banks, 'synth wobble')[0].voices).toEqual([1]);
    expect(filterDX7Library(SMALL.banks, 'cy creator').map((x) => x.bank.name)).toEqual(['Strings and Pads']);
    expect(filterDX7Library(SMALL.banks, 'nothing like this')).toEqual([]);
  });
  it('the shipped library has 246 banks and a search for "bass" narrows it', () => {
    const lib = JSON.parse(readFileSync(resolve(__dirname, '../../../../../public/data/sysex/dx7/manifest.json'), 'utf8')) as DX7LibraryManifest;
    expect(lib.banks).toHaveLength(246);
    const hits = filterDX7Library(lib.banks, 'bass');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(246);
  });
});

describe('flattenDX7Matches', () => {
  it('one row per matching voice, in bank order, carrying its bank and index', () => {
    const rows = flattenDX7Matches(filterDX7Library(SMALL.banks, 'bass'));
    expect(rows.map((r) => [r.bank.file, r.index, r.name])).toEqual([
      ['b1.syx', 1, 'BASS 1'], ['b2.syx', 0, 'SUB BASS'], ['b2.syx', 1, 'WOBBLE'], ['b2.syx', 2, 'PLUCK'],
    ]);
  });
});

describe('Dx7LibraryBrowser', () => {
  const rowsNow = () => within(screen.getByRole('listbox', { name: 'Voices' })).getAllByRole('option');

  it('lists every voice flat with its bank, filters live, and picking calls the loader with bank file and index', () => {
    const onPick = vi.fn();
    render(<Dx7LibraryBrowser library={SMALL} current={null} onPick={onPick} />);
    expect(rowsNow()).toHaveLength(8);
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'wobble' } });
    expect(rowsNow().map((r) => r.textContent)).toEqual(['WOBBLESynth Bass Pack / Bo Builder']);
    expect(screen.getByText('1 voice')).toBeTruthy();
    fireEvent.click(rowsNow()[0]);
    expect(onPick).toHaveBeenCalledWith('b2.syx', 1);
  });

  it('the sounding voice is highlighted', () => {
    render(<Dx7LibraryBrowser library={SMALL} current={{ file: 'b3.syx', index: 1 }} onPick={() => {}} />);
    const on = rowsNow().filter((r) => r.getAttribute('aria-selected') === 'true');
    expect(on).toHaveLength(1);
    expect(on[0].textContent).toContain('WARM PAD');
  });

  it('a search that matches nothing says so', () => {
    render(<Dx7LibraryBrowser library={SMALL} current={null} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No bank or voice matches/)).toBeTruthy();
  });
});
