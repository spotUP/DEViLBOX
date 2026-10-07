/**
 * The instrument list had no columns (owner 2026-10-07): slot, name, badges
 * and actions followed each row's own content, so nothing lined up. Every row
 * now shares one grid template and the same cells in the same order; the type
 * icon is one neutral token colour (the Sampler's rose read as an error) with
 * a tooltip naming the type.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { InstrumentList } from '../InstrumentList';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { instrumentColumns, instrumentGridTemplate } from '../instrumentListColumns';
import type { InstrumentConfig } from '@typedefs/instrument';

afterEach(cleanup);

function inst(id: number, synthType: string, name: string, extra: Partial<InstrumentConfig> = {}): InstrumentConfig {
  return { id, name, synthType, ...extra } as unknown as InstrumentConfig;
}

function load(list: InstrumentConfig[]): void {
  useInstrumentStore.setState({ instruments: list, currentInstrumentId: 99 });
}

const rows = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-instrument-id]'));

describe.each(['ft2', 'default'] as const)('instrument list columns (%s)', (variant) => {
  const LIST = [
    inst(1, 'Sampler', 'kick'),
    inst(2, 'Synth', ''),
    inst(3, 'Sampler', '  st-01:  spaced   art  '),
    inst(4, 'TB303', 'a name that is much too long for the panel to ever show in full'),
  ];

  it('rows share one grid template and the same number of cells', () => {
    load(LIST);
    const { container } = render(<InstrumentList variant={variant} />);
    const r = rows(container);
    expect(r).toHaveLength(4);
    // The list is one grid; every row is a subgrid spanning all of its tracks.
    for (const el of r) {
      expect(el.style.gridTemplateColumns).toBe('subgrid');
      expect(el.style.gridColumn).toBe('1 / -1');
    }
    const list = r[0].closest<HTMLElement>('.grid:not([data-instrument-id])')!;
    const tracks = list.style.gridTemplateColumns.split(/\s+(?![^(]*\))/).length;
    for (const el of r) expect(el.children.length - el.querySelectorAll(':scope > .pointer-events-none').length).toBe(tracks);
  });

  it('right-aligns every column except the instrument name', () => {
    load(LIST);
    const { container } = render(<InstrumentList variant={variant} />);
    for (const el of rows(container)) {
      expect(el.className).toMatch(/\bjustify-items-end\b/);
      expect((el.children[2] as HTMLElement).className).toMatch(/\bjustify-self-start\b/);
    }
  });

  it('shows no name for an unnamed instrument and keeps art spacing verbatim', () => {
    load(LIST);
    const { container } = render(<InstrumentList variant={variant} />);
    const names = rows(container).map((el) => (el.children[2] as HTMLElement).textContent);
    expect(names[1]).toBe('');
    expect(names[2]).toBe('  st-01:  spaced   art  ');
  });

  it('every synth type icon uses one neutral class and names the type in a tooltip', () => {
    load(LIST);
    const { container } = render(<InstrumentList variant={variant} />);
    const icons = Array.from(container.querySelectorAll<HTMLElement>('[data-instrument-type-icon]'));
    expect(icons).toHaveLength(4);
    const classes = new Set(icons.map((i) => (i.querySelector('svg')!.getAttribute('class')!.match(/\btext-\S+/g) ?? []).join(' ')));
    expect(classes.size).toBe(1);
    expect([...classes][0]).toMatch(/^text-/);
    for (const i of icons) expect(i.title.length).toBeGreaterThan(0);
    expect(new Set(icons.map((i) => i.title)).size).toBeGreaterThan(1);
    expect(container.innerHTML).not.toMatch(/text-(rose|red|orange|yellow|blue|green)-\d/);
  });
});

describe('instrument list status column', () => {
  it('reserves the Load Failed column on every row once one instrument failed', () => {
    load([inst(1, 'Sampler', 'ok'), inst(2, 'Sampler', 'broken', { loadError: 'bad sample' } as Partial<InstrumentConfig>)]);
    const { container, getAllByText } = render(<InstrumentList variant="ft2" />);
    expect(getAllByText('Load Failed')).toHaveLength(1);
    const r = rows(container);
    expect(r[0].children.length).toBe(r[1].children.length);
    expect(r[0].style.gridTemplateColumns).toBe(r[1].style.gridTemplateColumns);
  });
});

describe('column template', () => {
  const base = { artMode: false, longestNameLength: 10, showBadges: true, hasRole: false, hasStatus: false, actionSlots: 3 };
  it('sizes the name track to the widest art name and drops absent columns', () => {
    expect(instrumentGridTemplate({ ...base, artMode: true, longestNameLength: 31 })).toContain('31ch');
    expect(instrumentColumns({ ...base })).not.toContain('status');
    expect(instrumentColumns({ ...base, hasStatus: true })).toContain('status');
    expect(instrumentColumns({ ...base, showBadges: false })).toEqual(['slot', 'icon', 'name', 'actions']);
  });
});
