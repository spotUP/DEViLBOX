/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', 'monospace'],
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
      boxShadow: {
        'glow': '0 0 20px var(--color-accent-glow)',
        'glow-sm': '0 0 10px var(--color-accent-glow)',
        'inner-glow': 'inset 0 0 20px var(--color-accent-glow)',
      },
    },
  },
  plugins: [],
}
