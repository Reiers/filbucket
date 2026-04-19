import type { Config } from 'tailwindcss'

/**
 * FilBucket design tokens — iCloud-style.
 * Palette: white canvas + soft pastel service tiles.
 * Type: Inter for everything (SF Pro analogue), IBM Plex Mono for microcopy.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-sunk': 'var(--surface-sunk)',
        'surface-elev': 'var(--surface-elev)',

        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-mute': 'var(--ink-mute)',
        'ink-faint': 'var(--ink-faint)',

        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',

        // Pastel service-tile palette (iCloud-inspired).
        sky:        'var(--accent-sky)',
        'sky-fill': 'var(--accent-sky-fill)',
        'sky-deep': 'var(--accent-sky-deep)',

        lavender:        'var(--accent-lavender)',
        'lavender-fill': 'var(--accent-lavender-fill)',
        'lavender-deep': 'var(--accent-lavender-deep)',

        mint:        'var(--accent-mint)',
        'mint-fill': 'var(--accent-mint-fill)',
        'mint-deep': 'var(--accent-mint-deep)',

        peach:        'var(--accent-peach)',
        'peach-fill': 'var(--accent-peach-fill)',
        'peach-deep': 'var(--accent-peach-deep)',

        rose:        'var(--accent-rose)',
        'rose-fill': 'var(--accent-rose-fill)',
        'rose-deep': 'var(--accent-rose-deep)',

        sunflower:        'var(--accent-sunflower)',
        'sunflower-fill': 'var(--accent-sunflower-fill)',
        'sunflower-deep': 'var(--accent-sunflower-deep)',

        brand:       'var(--brand)',
        'brand-fill': 'var(--brand-fill)',

        ok:       'var(--ok)',
        'ok-fill': 'var(--ok-fill)',
        warn:      'var(--warn)',
        'warn-fill': 'var(--warn-fill)',
        err:       'var(--err)',
        'err-fill': 'var(--err-fill)',
      },
      fontFamily: {
        sans: [
          'var(--font-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'ui-monospace',
          'SFMono-Regular',
          'monospace',
        ],
      },
      fontSize: {
        display: ['clamp(2.25rem, 5.5vw, 3.75rem)', { lineHeight: '1.05', letterSpacing: '-0.035em' }],
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        // iCloud-style soft inner ring used on interactive tiles.
        ring: 'inset 0 0 0 1px rgba(0, 0, 0, 0.06)',
        'ring-strong': 'inset 0 0 0 1px rgba(0, 0, 0, 0.08), 0 4px 12px -2px rgba(17, 17, 26, 0.08)',
      },
      borderRadius: {
        // Apple uses very specific rounding values. Match them.
        tile: '18px',
        'tile-lg': '24px',
        pill: '999px',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        smooth: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
export default config
