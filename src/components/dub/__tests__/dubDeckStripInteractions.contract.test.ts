/**
 * G15 contract: DubDeckStrip must keep the intended interaction model for
 * global and per-channel dub controls.
 *
 * We intentionally source-lock this file instead of mounting the component:
 * DubDeckStrip imports the live WebAudio/Tone stack, and the bug class we
 * care about here is UI wiring drift — e.g. a hold button becoming a click,
 * a toggle button accidentally calling holdStart, or channel/master buttons
 * diverging. This test makes those regressions fail in CI without needing
 * a browser audio graph.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '..', 'DubDeckStrip.tsx'),
  'utf8',
);

/**
 * The move button's look lives beside the deck, not inside it.
 *
 * Lifted out on 2026-09-23 when the deck gained a second layout that follows
 * the performer's hardware: two layouts each deciding their own colours would
 * be two decks. The assertions about the BUTTON read this file; the ones about
 * the deck's rows and tables still read the deck.
 */
const STYLE = readFileSync(
  resolve(__dirname, '..', 'moveButtonStyle.ts'),
  'utf8',
);

describe('DubDeckStrip — move grouping contract (G15)', () => {
  it('keeps representative globals in the intended interaction groups', () => {
    expect(SOURCE).toMatch(/moveId:\s*'springSlam'[\s\S]*group:\s*'click'/);
    expect(SOURCE).toMatch(/moveId:\s*'masterDrop'[\s\S]*group:\s*'hold'/);
    // Ghost moved from TOGGLE to HOLD on 2026-09-23 — "ghost should no be a
    // toggle it should be a hold". Ring is the representative toggle now.
    expect(SOURCE).toMatch(/moveId:\s*'ghostReverb'[\s\S]*group:\s*'hold'/);
    expect(SOURCE).toMatch(/moveId:\s*'ringMod'[\s\S]*group:\s*'toggle'/);
    expect(SOURCE).toMatch(/moveId:\s*'delayPresetQuarter'[\s\S]*group:\s*'rate'/);
  });

  it('renders CLICK globals as one-shot onClick fireTrigger buttons', () => {
    const clickBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'click'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(clickBlock, 'CLICK group render block not found').not.toBeNull();
    expect(clickBlock![0]).toMatch(/onClick=\{\(\) => \{/);
    expect(clickBlock![0]).toMatch(/fireTrigger\(m\.moveId\)/);
    expect(clickBlock![0]).not.toMatch(/holdStart\(m\.moveId\)/);
    expect(clickBlock![0]).not.toMatch(/handleToggle\(m\.moveId\)/);
  });

  it('renders HOLD globals with pointer-held start/release semantics', () => {
    // These used to inline the pointer handlers at every hold site, and the
    // assertions here matched that markup literally. The X26 fix replaced all
    // four copies with one `holdButtonProps` helper — no behaviour changed,
    // but three tests failed because they pinned the spelling instead of the
    // semantics. Assert the semantics: a hold global takes its pointer props
    // from the shared helper, and is not also a click or a toggle.
    const holdBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'hold'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(holdBlock, 'HOLD group render block not found').not.toBeNull();
    expect(holdBlock![0]).toMatch(/holdButtonProps\(m\.moveId\)/);
    // The block may wrap onPointerDown to refuse when no send is up, but it
    // must still delegate to the helper's handler rather than replace it.
    expect(holdBlock![0]).toMatch(/props\.onPointerDown\(e\)/);
    expect(holdBlock![0]).not.toMatch(/onClick=/);
    expect(holdBlock![0]).not.toMatch(/handleToggle\(m\.moveId\)/);
  });

  it('gives every hold site all four ways out of a held state', () => {
    // pointerup alone is not enough: a capture can vanish without one, which
    // is how a click left crushBass held on for ever.
    const helper = SOURCE.match(/const holdButtonProps = useCallback\([\s\S]*?\}\), \[holdStart, holdEnd\]\);/);
    expect(helper, 'holdButtonProps helper not found').not.toBeNull();
    for (const handler of ['onPointerDown', 'onPointerUp', 'onPointerCancel', 'onLostPointerCapture']) {
      expect(helper![0], handler).toContain(handler);
    }
    // Two release paths plus the start, each guarded — an unguarded
    // releasePointerCapture throws and skips the holdEnd after it.
    expect(helper![0].match(/try \{ e\.currentTarget\.(set|release)PointerCapture/g) ?? []).toHaveLength(3);
  });

  it('renders TOGGLE globals as latch-on/latch-off handleToggle buttons', () => {
    const toggleBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'toggle'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(toggleBlock, 'TOGGLE group render block not found').not.toBeNull();
    expect(toggleBlock![0]).toMatch(/onClick=\{\(\) => \{/);
    expect(toggleBlock![0]).toMatch(/handleToggle\(m\.moveId\)/);
    expect(toggleBlock![0]).not.toMatch(/holdStart\(m\.moveId\)/);
  });

  it('renders RATE globals as mutually exclusive preset buttons', () => {
    const rateBlock = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === 'rate'\)\.map\(\(m\) => \{[\s\S]*?\}\)\}/);
    expect(rateBlock, 'RATE group render block not found').not.toBeNull();
    expect(rateBlock![0]).toMatch(/onClick=\{\(\) => handleRatePreset\(m\.moveId\)\}/);
    expect(rateBlock![0]).not.toMatch(/fireTrigger\(m\.moveId\)/);
  });
});

describe('DubDeckStrip — channel/master button semantics contract (G15)', () => {
  it('keeps per-channel ops classified as hold vs trigger', () => {
    expect(SOURCE).toMatch(/moveId:\s*'channelMute'[\s\S]*kind:\s*'hold'/);
    expect(SOURCE).toMatch(/moveId:\s*'channelThrow'[\s\S]*kind:\s*'trigger'/);
    expect(SOURCE).toMatch(/moveId:\s*'skankEchoThrow'[\s\S]*kind:\s*'hold'/);
    expect(SOURCE).toMatch(/moveId:\s*'dubStab'[\s\S]*kind:\s*'trigger'/);
  });

  it('uses the same op.kind split for the ALL channels master column', () => {
    const masterOpsBlock = SOURCE.match(/CHANNEL_OPS\.map\(\(op\) => \{[\s\S]*?hoverProps\(`ALL ·/m);
    expect(masterOpsBlock, 'master CHANNEL_OPS block not found').not.toBeNull();
    const block = masterOpsBlock![0];
    expect(block).toMatch(/const isHold = op\.kind === 'hold'/);
    expect(block).toMatch(/onClick=\{isHold \? undefined : \(\) => \{/);
    // Fires across the RESOLVED target now, not blindly across every channel:
    // no target is every channel, a target is exactly that one.
    expect(block).toMatch(/for \(const ch of targetChannels\) fireTrigger\(op\.moveId, ch\)/);
    // Master cannot use the shared helper: one button holds every channel, so
    // it fans holdStart/holdEnd out across the visible channels itself. It
    // must still cover all four exits, or a master hold can strand N channels
    // rather than one.
    for (const handler of ['onPointerDown', 'onPointerUp', 'onPointerCancel', 'onLostPointerCapture']) {
      expect(block, handler).toContain(handler);
    }
    expect(block).toMatch(/holdStart\(op\.moveId, ch\)/);
    expect(block.match(/holdEnd\(op\.moveId, ch\)/g) ?? [], 'every exit must end the hold').toHaveLength(3);
  });

  /**
   * The per-channel op columns are GONE (2026-09-23).
   *
   * There is no second `CHANNEL_OPS.map` to assert a kind split for. What
   * replaced this test is `dubTarget.test.ts`, which pins that the map appears
   * exactly once and that the panel resolves a target instead of firing at a
   * hardcoded channel list. Re-proving the same wiring from two directions is
   * what the house rule says to merge, not duplicate.
   */
});

/**
 * The always-visible live row.
 *
 * Asked for on 2026-09-21: "this fx wet slider is full width we could fit a
 * lot of the stuff that is hidden behind the tiny settings cog here" /
 * "stuff that are important live". Intensity in particular existed only
 * inside AutoDubPanel, behind a cog the size of a fingernail, which is the
 * wrong place for the control that decides how busy the performer is.
 *
 * These lock the three properties that make a control usable live: it is on
 * the strip itself, it follows the value while a move drives it, and the row
 * survives a narrow deck.
 */
describe('DubDeckStrip — the live sliders', () => {
  // Since 2026-10-04 the sliders sit IN the header row (a fragment under
  // `busEnabled`), not on a row of their own: "the sliders are very wide,
  // these two rows can be compacted to one row".
  const LIVE_ROW = SOURCE.match(
    /\{busEnabled && \(\s*<>[\s\S]*?\n        <\/>\s*\)\}/,
  );
  const HEADER = SOURCE.match(/\{\/\* Header row \*\/\}[\s\S]*?<div className="([^"]*)">/);

  it('renders the sliders at all, inside the header row', () => {
    expect(LIVE_ROW, 'live slider block not found').not.toBeNull();
    expect(HEADER, 'header row not found').not.toBeNull();
    const headerStart = SOURCE.indexOf('{/* Header row */}');
    const sliderStart = SOURCE.indexOf(LIVE_ROW![0]);
    const shapeStart = SOURCE.indexOf("<span className=\"text-text-muted ml-2\">SHAPE</span>");
    expect(sliderStart).toBeGreaterThan(headerStart);
    expect(sliderStart).toBeLessThan(shapeStart);
  });

  it('carries the controls a performer rides, not just the wet level', () => {
    const row = LIVE_ROW![0];
    expect(row).toMatch(/setDubBus\(\{ returnGain:/);
    expect(row).toMatch(/setAutoDubIntensity\(/);
    expect(row).toMatch(/setDubBus\(\{ echoIntensity:/);
  });

  it('puts intensity on the strip rather than only behind the settings cog', () => {
    // The whole point of the change: AutoDubPanel may keep its own copy, but
    // reaching the cog must not be the only way to change how busy the
    // performer is.
    expect(SOURCE).toMatch(/type="range"[\s\S]{0,200}setAutoDubIntensity\(/);
  });

  it('follows the bus faders live instead of freezing at the stored value', () => {
    // X17's fault class: a fader read straight from the store sits still while
    // a move drives the parameter, so the row lies about what the bus is doing.
    expect(SOURCE).toMatch(/useLiveDubParam\('dub\.returnGain'/);
    expect(SOURCE).toMatch(/useLiveDubParam\('dub\.echoIntensity'/);
    const row = LIVE_ROW![0];
    expect(row).toContain('liveReturnGain');
    expect(row).toContain('liveEchoIntensity');
  });

  it('greys intensity out when the performer is switched off', () => {
    expect(LIVE_ROW![0]).toMatch(/disabled=\{!autoDubEnabled\}/);
  });

  it('wraps rather than squashing its sliders into stubs on a narrow deck, and caps them on a wide one', () => {
    // The header row wraps; the sliders inherit that.
    expect(HEADER![1]).toContain('flex-wrap');
    const row = LIVE_ROW![0];
    // EVERY control keeps a floor wide enough to still be draggable, and a
    // cap so two sliders do not run the full width of a wide deck (the
    // 2026-10-04 complaint). Counted against the sliders actually present
    // rather than a fixed number - this said "three" and broke when VINYL
    // joined on 2026-09-22.
    const sliders = row.match(/type="range"/g) ?? [];
    expect(sliders.length).toBeGreaterThanOrEqual(3);
    expect(row.match(/min-w-\[9rem\]/g) ?? []).toHaveLength(sliders.length);
    expect(row.match(/max-w-\[16rem\]/g) ?? []).toHaveLength(sliders.length);
  });
});

/**
 * The move rows as columns.
 *
 * Asked for on 2026-09-21: the four rows wrapped independently, so a button
 * was as wide as its own label and nothing lined up between rows.
 */
describe('DubDeckStrip — move rows line up as columns', () => {
  it('defines one grid for all four rows rather than a class per row', () => {
    expect(SOURCE).toMatch(/const MOVE_ROW_GRID = 'grid grid-cols-\[repeat\(auto-fill,minmax\(7rem,1fr\)\)\] gap-1\.5/);
  });

  it('uses that one grid on every move row', () => {
    // Four rows: click, rate, hold, toggle. A row left on flex-wrap is a row
    // that stops lining up with the other three.
    expect((SOURCE.match(/className=\{MOVE_ROW_GRID\}/g) ?? [])).toHaveLength(4);
    const rows = SOURCE.match(/GLOBAL_MOVES\.filter\(m => m\.group === '\w+'\)/g) ?? [];
    expect(rows).toHaveLength(4);
    expect(SOURCE).not.toMatch(/<div className="flex gap-1\.5 flex-wrap">/);
  });

  it('makes each button fill its column instead of hugging its label', () => {
    // Equal tracks are pointless if the buttons inside them are not equal.
    expect((SOURCE.match(/w-full text-center/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps a label on one line, so no button is taller than its row', () => {
    // Both button sizes: the move rows' 'md' and the channel strips' 'sm'.
    const base = STYLE.match(/const BASE = \{[\s\S]*?\} as const;/);
    expect(base, 'the shared base classes moved').not.toBeNull();
    expect((base![0].match(/whitespace-nowrap/g) ?? []).length, 'both sizes').toBe(2);
  });
});

/**
 * Tooltips in place of the reserved status line.
 *
 * Asked for on 2026-09-21: "the hidden status line above the buttons that
 * shows when i hover a button can be replaced with tooltips to leave more
 * vertical space".
 */
describe('DubDeckStrip — hover help costs no vertical space', () => {
  it('no longer reserves a row for a status line', () => {
    expect(SOURCE).not.toContain('hoverHint');
    expect(SOURCE).not.toContain('setHoverHint');
  });

  it('renders the shared tooltip once', () => {
    expect(SOURCE).toContain('useHoverTooltip()');
    expect((SOURCE.match(/\{moveTooltip\}/g) ?? [])).toHaveLength(1);
  });

  it('describes every move button through it', () => {
    // Four global rows, the ALL column and the per-channel column.
    // Was 6; the per-channel op buttons took one of them with them when the
    // channel section lost its rack.
    expect((SOURCE.match(/\{\.\.\.hoverProps\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('leaves no native title on a button that already has a tooltip', () => {
    // Both at once is two tooltips on one button, one of them a second late.
    // Other controls on the deck — faders, the filter select, the channel name
    // — still use `title`, and should: they have no tooltip of their own.
    const lines = SOURCE.split('\n');
    const doubled = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes('{...hoverProps('))
      .filter(({ i }) => lines.slice(i + 1, i + 3).some((l) => l.includes('title=')))
      .map(({ i }) => i + 1);
    expect(doubled, `buttons with a tooltip AND a native title, at line(s) ${doubled.join(', ')}`)
      .toEqual([]);
  });

  it('keeps the press-and-hold wording the native title used to carry', () => {
    expect(SOURCE).toMatch(/hoverProps\(`\$\{m\.label\} — \$\{m\.title\} \(press-and-hold\)/);
  });

  it('drops the tooltip when the deck is panicked out from under it', () => {
    expect(SOURCE).toMatch(/hideTooltip\(\); window\.dispatchEvent\(new Event\('dub-panic'\)\)/);
  });
});

describe('DubDeckStrip — the header row stays reachable', () => {
  it('wraps instead of running off the edge', () => {
    // Reported 2026-09-21: the row ran past the right edge with a control cut
    // in half. The parent scrolls vertically only, so overflow was just clipped.
    const header = SOURCE.match(/<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">/);
    expect(header, 'header row is not a wrapping flex row').not.toBeNull();
  });

  it('keeps the most-used controls first, so what wraps is what is reached for least', () => {
    const order = ['DUB DECK ', 'Bus ', 'STYLE', 'ECHO', 'AUTO DUB'];
    let at = 0;
    for (const label of order) {
      const i = SOURCE.indexOf(label, at);
      expect(i, `${label} out of order in the header`).toBeGreaterThan(-1);
      at = i;
    }
  });
});
