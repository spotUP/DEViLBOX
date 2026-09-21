/**
 * Instrument names that are really a picture.
 *
 * Reported 2026-09-21 with jennipha / daddytwang: the drawing is spelled down
 * the instrument list, and the ordinary rendering destroys it — truncation eats
 * the long rows, runs of spaces collapse, and the type badges land in the
 * middle of the art.
 *
 * The interesting part is telling art from names, because getting it wrong in
 * either direction is worse than doing nothing: a false positive turns an
 * ordinary song's list into unreadable pre-formatted rows, and a false negative
 * leaves the reported case broken.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { artScore, isArtLine, namesContainArt, ART_RUN_THRESHOLD } from '../asciiArtNames';

/** The shape the report was about: a drawing spelled down the names. */
const ART_LIST = [
  '   _____       ',
  '  /     \\      ',
  ' | () () |     ',
  '  \\  ^  /      ',
  '   |||||       ',
  'greets to all!',
  'jennipha@ijs.si',
];

/** An ordinary tracker song's instrument list. */
const ORDINARY_LIST = [
  'bassdrum', 'snare', 'hihat closed', 'hihat open',
  'bassline', 'strings', 'lead', 'fx sweep',
];

describe('artScore', () => {
  it('scores a word near zero', () => {
    expect(artScore('bassdrum')).toBe(0);
  });

  it('scores a row of drawing characters near one', () => {
    expect(artScore('/|\\_-()')).toBe(1);
  });

  it('ignores spaces on both sides of the ratio', () => {
    // Spaces are the canvas, not the ink. Counting them would make a sparse
    // row of art look like prose.
    expect(artScore('  /\\  ')).toBe(1);
    expect(artScore('  hat  ')).toBe(0);
  });

  it('is zero for an empty or blank name', () => {
    expect(artScore('')).toBe(0);
    expect(artScore('    ')).toBe(0);
  });
});

describe('isArtLine', () => {
  it('takes a row that is mostly drawing characters', () => {
    expect(isArtLine('  /     \\  ')).toBe(true);
  });

  it('takes a row held apart by interior spaces', () => {
    // How a drawing holds its shape, and something no ordinary name needs.
    expect(isArtLine('|    |')).toBe(true);
    expect(isArtLine('o     o')).toBe(true);
  });

  it('leaves an ordinary name alone', () => {
    for (const name of ORDINARY_LIST) expect(isArtLine(name), name).toBe(false);
  });

  it('leaves a name with ordinary punctuation alone', () => {
    // One hyphen or dot is not a drawing.
    expect(isArtLine('hihat-closed')).toBe(false);
    expect(isArtLine('tr-808 kick')).toBe(false);
    expect(isArtLine('lead (soft)')).toBe(false);
  });
});

describe('namesContainArt', () => {
  it('finds the reported case', () => {
    expect(namesContainArt(ART_LIST)).toBe(true);
  });

  it('leaves an ordinary song alone', () => {
    expect(namesContainArt(ORDINARY_LIST)).toBe(false);
  });

  it('needs a run, not a count', () => {
    // A single instrument called `--->` is not a picture. Scattered odd names
    // through an ordinary list must not flip the whole list into art mode.
    const scattered = ['kick', '--->', 'snare', '<<<>>>', 'hat', '/|\\'];
    expect(namesContainArt(scattered)).toBe(false);
  });

  it('takes exactly a run of the threshold length', () => {
    const run = ['kick', '/    \\', '|    |', '\\    /', 'snare'];
    expect(run.filter(isArtLine)).toHaveLength(ART_RUN_THRESHOLD);
    expect(namesContainArt(run)).toBe(true);
  });

  it('does not take a run one short of the threshold', () => {
    expect(namesContainArt(['kick', '/    \\', '|    |', 'snare'])).toBe(false);
  });

  it('handles an empty list and blank names', () => {
    expect(namesContainArt([])).toBe(false);
    expect(namesContainArt(['', '', '', ''])).toBe(false);
  });
});

/**
 * One reachability test: a detector nothing consults changes nothing.
 */
describe('the list switches mode on it', () => {
  const LIST = readFileSync(
    join(__dirname, '..', '..', '..', 'components', 'instruments', 'InstrumentList.tsx'),
    'utf8',
  );
  const CSS = readFileSync(join(__dirname, '..', '..', '..', 'index.css'), 'utf8');

  it('asks the detector about the names it is about to render', () => {
    expect(LIST).toContain('namesContainArt(');
    expect(LIST).toMatch(/visibleInstruments\.map\(\(i\) => i\.name/);
  });

  it('keeps the spaces and drops the truncation in art mode', () => {
    // Both are needed: `truncate` eats the long rows, and without
    // `whitespace-pre` the runs of spaces that hold the shape collapse.
    expect(LIST).toContain('whitespace-pre');
    expect(LIST).toMatch(/artMode[\s\S]{0,120}truncate/);
  });

  it('scrolls the picture as one image, not row by row', () => {
    // Each row scrolling on its own would shear the drawing apart.
    expect(LIST).toContain('overflow-x-auto instrument-list--art');
    expect(LIST).toMatch(/artMode \? ' w-max min-w-full' : ''/);
  });

  it('takes the badges out of the middle of the drawing', () => {
    expect(CSS).toMatch(/\.instrument-list--art \.instrument-badge \{\s*display: none;/);
  });
});
