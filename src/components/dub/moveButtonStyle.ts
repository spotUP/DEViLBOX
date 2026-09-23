/**
 * The look of a dub move button — shared by every shape the deck draws in.
 *
 * Lifted out of `DubDeckStrip` on 2026-09-23 when the deck gained a second
 * shape that follows the performer's hardware. Two shapes that each decided
 * their own colours would be two decks: Wobble amber in one and grey in the
 * other, and a fix to one never reaching the other. The colour of a move is a
 * property OF THE MOVE, so it lives in one place and both shapes read it.
 */

/**
 * Every colour a move button may carry. A union, not `string`: the class
 * helper below is a switch over LITERAL Tailwind classes (the JIT needs them
 * spelled out), and a token with no case fell to the idle default — so the
 * button never showed an active state at all. Riddim (`accent-error/60`),
 * Float, Build, Emph and Liquid were all invisible when held: "ui button does
 * not light up the midi controller does" (2026-09-23). The `never` default
 * makes a missing case a type error.
 */
export type MoveColor =
  | 'accent-primary' | 'accent-primary/70' | 'accent-primary/50' | 'accent-primary/40'
  | 'accent-secondary' | 'accent-secondary/80' | 'accent-secondary/70'
  | 'accent-highlight' | 'accent-highlight/70' | 'accent-highlight/40'
  | 'accent-warning' | 'accent-warning/70'
  | 'accent-error' | 'accent-error/70' | 'accent-error/60'
  | 'accent-success' | 'accent-success/70'
  | 'text-primary';

export const colorClasses = (token: MoveColor, active: boolean, size: 'md' | 'sm' = 'md') => {
  // nowrap: on the column grid a wrapped label would make one button taller
  // than its row.
  // 'sm' is the channel-card size: nine ops in a 3x3 grid beside the fader.
  // At 'md' the same nine stacked in one column ran ~600 px and the deck,
  // capped at 60 % of the viewport, clipped every card — "the sliders dont
  // fit not even in fullscreen" (2026-09-23, asked several times).
  const base = size === 'sm'
    ? 'px-1 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap transition-all duration-150 '
    : 'px-2.5 py-1 rounded border text-xs font-bold whitespace-nowrap transition-all duration-150 ';
  const idle = 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary ';
  switch (token) {
    // Bright opaque backgrounds — dark text has 9-12:1 contrast
    case 'accent-primary':      return base + (active ? 'bg-accent-primary text-text-inverse border-accent-primary shadow-[0_0_6px_var(--color-accent-primary)]' : idle + 'hover:border-accent-primary hover:text-accent-primary');
    case 'accent-highlight':    return base + (active ? 'bg-accent-highlight text-text-inverse border-accent-highlight' : idle + 'hover:border-accent-highlight hover:text-accent-highlight');
    case 'accent-warning':      return base + (active ? 'bg-accent-warning text-text-inverse border-accent-warning' : idle + 'hover:border-accent-warning hover:text-accent-warning');
    case 'accent-success':      return base + (active ? 'bg-accent-success text-text-inverse border-accent-success' : idle + 'hover:border-accent-success hover:text-accent-success');
    // Dark or semi-transparent backgrounds — white text is required for visibility
    case 'accent-primary/70':   return base + (active ? 'bg-accent-primary/70 text-white border-accent-primary/70' : idle + 'hover:border-accent-primary/70 hover:text-accent-primary');
    case 'accent-primary/50':   return base + (active ? 'bg-accent-primary/50 text-white border-accent-primary/50' : idle + 'hover:border-accent-primary/50 hover:text-accent-primary');
    case 'accent-primary/40':   return base + (active ? 'bg-accent-primary/40 text-white border-accent-primary/40' : idle + 'hover:border-accent-primary/40 hover:text-accent-primary');
    case 'accent-secondary/80': return base + (active ? 'bg-accent-secondary/80 text-white border-accent-secondary/80' : idle + 'hover:border-accent-secondary/80 hover:text-accent-secondary');
    case 'accent-highlight/40': return base + (active ? 'bg-accent-highlight/40 text-white border-accent-highlight/40' : idle + 'hover:border-accent-highlight/40 hover:text-accent-highlight');
    case 'accent-error/60':     return base + (active ? 'bg-accent-error/60 text-white border-accent-error/60' : idle + 'hover:border-accent-error/60 hover:text-accent-error');
    case 'accent-secondary':    return base + (active ? 'bg-accent-secondary text-white border-accent-secondary' : idle + 'hover:border-accent-secondary hover:text-accent-secondary');
    case 'accent-secondary/70': return base + (active ? 'bg-accent-secondary/70 text-white border-accent-secondary/70' : idle + 'hover:border-accent-secondary/70 hover:text-accent-secondary');
    case 'accent-highlight/70': return base + (active ? 'bg-accent-highlight/70 text-white border-accent-highlight/70' : idle + 'hover:border-accent-highlight/70 hover:text-accent-highlight');
    case 'accent-warning/70':   return base + (active ? 'bg-accent-warning/70 text-white border-accent-warning/70' : idle + 'hover:border-accent-warning/70 hover:text-accent-warning');
    case 'accent-error':        return base + (active ? 'bg-accent-error text-white border-accent-error' : idle + 'hover:border-accent-error hover:text-accent-error');
    case 'accent-error/70':     return base + (active ? 'bg-accent-error/70 text-white border-accent-error/70' : idle + 'hover:border-accent-error/70 hover:text-accent-error');
    case 'accent-success/70':   return base + (active ? 'bg-accent-success/70 text-white border-accent-success/70' : idle + 'hover:border-accent-success/70 hover:text-accent-success');
    case 'text-primary':        return base + (active ? 'bg-text-primary text-dark-bg border-text-primary' : idle + 'hover:border-text-primary hover:text-text-primary');
    default: {
      // Exhaustive: a token added to MoveColor without a case does not compile.
      const missing: never = token;
      return base + idle + String(missing);
    }
  }
};
