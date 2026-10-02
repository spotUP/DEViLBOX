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
          bg: 'var(--color-bg)',
          bgSecondary: 'var(--color-bg-secondary)',
          bgTertiary: 'var(--color-bg-tertiary)',
          bgHover: 'var(--color-bg-hover)',
          bgActive: 'var(--color-bg-active)',
          border: 'var(--color-border)',
          borderLight: 'var(--color-border-light)',
        },
        // Text colors
        text: {
          primary: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)',
        },
        // Accent colors
        accent: {
          primary: 'var(--color-accent)',
          secondary: 'var(--color-accent-secondary)',
          highlight: 'var(--color-accent-highlight)',
          warning: 'var(--color-warning)',
          error: 'var(--color-error)',
          success: 'var(--color-success)',
        },
        // Tracker-specific colors
        tracker: {
          row: {
            even: 'var(--color-tracker-row-even)',
            odd: 'var(--color-tracker-row-odd)',
            highlight: 'var(--color-tracker-row-highlight)',
            current: 'var(--color-tracker-row-current)',
            cursor: 'var(--color-tracker-row-cursor)',
          },
          cell: {
            note: 'var(--color-cell-note)',
            instrument: 'var(--color-cell-instrument)',
            volume: 'var(--color-cell-volume)',
            effect: 'var(--color-cell-effect)',
            accent: 'var(--color-cell-accent)',
            slide: 'var(--color-cell-slide)',
            empty: 'var(--color-cell-empty)',
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
