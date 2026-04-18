import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calm neutral palette; single accent is slate-900.
        paper: '#fafaf9',
      },
    },
  },
  plugins: [],
}
export default config
