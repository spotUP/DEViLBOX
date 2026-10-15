/**
 * The library browser narrows 246 banks with a live filter and picks a voice in two levels (bank, then voice).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Dx7LibraryBrowser } from '../Dx7LibraryBrowser';
import { filterDX7Library, type DX7LibraryManifest } from '../../../../engine/dx7/dx7Library';

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

describe('Dx7LibraryBrowser', () => {
  it('typing in the filter narrows the bank list, and picking a voice calls the loader with bank file and index', () => {
    const onPick = vi.fn();
    render(<Dx7LibraryBrowser library={SMALL} current={null} onPick={onPick} />);
    const banks = () => within(screen.getByRole('listbox', { name: 'Banks' })).getAllByRole('option');
    expect(banks()).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'wobble' } });
    expect(banks().map((b) => b.textContent)).toEqual(['Synth Bass Pack']);
    expect(screen.getByText(/1 of 3 banks, 1 voice$/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Voices' })).getByText('WOBBLE'));
    expect(onPick).toHaveBeenCalledWith('b2.syx', 1);
  });

  it('browsing another bank lists its voices; the sounding voice is highlighted; the chosen bank shows its attribution', () => {
    render(<Dx7LibraryBrowser library={SMALL} current={{ file: 'b3.syx', index: 1 }} onPick={() => {}} />);
    const voices = within(screen.getByRole('listbox', { name: 'Voices' }));
    expect(voices.getByText('WARM PAD').closest('[role=option]')?.getAttribute('aria-selected')).toBe('true');
    expect(voices.getByText('STRINGS 1').closest('[role=option]')?.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText(/Cy Creator/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Banks' })).getByText('Rhodes Collection'));
    expect(within(screen.getByRole('listbox', { name: 'Voices' })).getByText('E.PIANO 1')).toBeTruthy();
    expect(screen.getByText(/Ann Author/)).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://example.test/1');
  });

  it('a search that matches nothing says so', () => {
    render(<Dx7LibraryBrowser library={SMALL} current={null} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search the library'), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No bank or voice matches/)).toBeTruthy();
  });
});
