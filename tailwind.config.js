// Theme colours are CSS variables, which Tailwind cannot fade on its own:
// with a plain 'var(--x)' an opacity modifier such as bg-accent-primary/20
// generated no CSS at all, so every faded tint in the app was silently
// missing. color-mix takes Tailwind's <alpha-value>, so /NN works and a
// class without a modifier stays the solid colour.
const tone = (name) => `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Tests hold no UI classes. Scanning them only costs time, and a test
    // deleted while the dev server runs left a stale path that failed the
    // whole CSS build with ENOENT.
    "!./src/**/__tests__/**",
    "!./src/test/**",
  ],
  theme: {
    // Breakpoint scale — MUST stay identical to BREAKPOINTS in
    // src/hooks/useBreakpoint.ts, which is the app's only threshold source.
    // Declared as a full replacement (not `extend`) so the variants stay in
    // ascending order: an `extend` would append `wide` AFTER `2xl`, letting a
    // `wide:` utility beat a `2xl:` one on a large screen.
    // `wide` is the app's own threshold — enough room for the tracker's side
    // instrument panel. The rest are Tailwind's stock values, kept as-is.
    screens: {
      sm: '640px',
      md: '768px',
      wide: '900px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      // `h-screen` / `min-h-screen` / `max-h-screen` resolve to the app's own
      // viewport-height variable, defined once in `src/index.css` and upgraded
      // to `100dvh` where the browser has it. Overriding the core `screen` key
      // means the 14 existing `h-screen` sites follow without being edited.
      height: {
        screen: 'var(--app-vh)',
      },
      minHeight: {
        screen: 'var(--app-vh)',
      },
      maxHeight: {
        screen: 'var(--app-vh)',
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      colors: {
        // Theme-aware colors using CSS variables
        dark: {
          bg: tone('--color-bg'),
          bgSecondary: tone('--color-bg-secondary'),
          bgTertiary: tone('--color-bg-tertiary'),
          bgHover: tone('--color-bg-hover'),
          bgActive: tone('--color-bg-active'),
          border: tone('--color-border'),
          borderLight: tone('--color-border-light'),
        },
        // Text colors
        text: {
          primary: tone('--color-text'),
          secondary: tone('--color-text-secondary'),
          muted: tone('--color-text-muted'),
          inverse: tone('--color-text-inverse'),
        },
        // Accent colors
        accent: {
          primary: tone('--color-accent'),
          secondary: tone('--color-accent-secondary'),
          highlight: tone('--color-accent-highlight'),
          warning: tone('--color-warning'),
          error: tone('--color-error'),
          success: tone('--color-success'),
        },
        // Tracker-specific colors
        tracker: {
          row: {
            even: tone('--color-tracker-row-even'),
            odd: tone('--color-tracker-row-odd'),
            highlight: tone('--color-tracker-row-highlight'),
            current: tone('--color-tracker-row-current'),
            cursor: tone('--color-tracker-row-cursor'),
          },
          cell: {
            note: tone('--color-cell-note'),
            instrument: tone('--color-cell-instrument'),
            volume: tone('--color-cell-volume'),
            effect: tone('--color-cell-effect'),
            accent: tone('--color-cell-accent'),
            slide: tone('--color-cell-slide'),
            empty: tone('--color-cell-empty'),
          }
        }
      },
      fontFamily: {
        sans: ['var(--theme-font-sans)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--theme-font-mono)', 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      fontSize: {
        'tracker': '12px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
      divideColor: {
        DEFAULT: 'var(--color-border)',
      },
      boxShadow: {
        'glow': '0 0 20px var(--color-accent-glow)',
        'glow-sm': '0 0 10px var(--color-accent-glow)',
        'inner-glow': 'inset 0 0 20px var(--color-accent-glow)',
      },
      keyframes: {
        // Indeterminate progress bar — a bright chunk sweeping left-to-right
        // across a muted bar. Used for "rendering / analyzing" states where
        // we don't have chunk-level progress from the pipeline.
        'indeterminate': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'indeterminate': 'indeterminate 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
