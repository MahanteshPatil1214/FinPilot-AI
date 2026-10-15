/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF8F4',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#16191D',
          soft: '#2A2F36',
        },
        graphite: '#5B6169',
        muted: '#8A9099',
        line: {
          DEFAULT: '#E4E0D6',
          strong: '#D3CEC1',
        },
        accent: {
          DEFAULT: '#0F5C52',
          hover: '#0C4A42',
          soft: '#E6F0EE',
        },
        status: {
          matched: '#2F7D5B',
          matchedSoft: '#E7F1EC',
          partial: '#B7791F',
          partialSoft: '#F6EEDD',
          neutral: '#6B7280',
          neutralSoft: '#EEEDEA',
          risk: '#B4432C',
          riskSoft: '#F7E7E2',
          info: '#3A5A8C',
          infoSoft: '#E7ECF5',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        serif: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
      },
      boxShadow: {
        overlay: '0 8px 24px -8px rgba(22, 25, 29, 0.18)',
      },
      letterSpacing: {
        label: '0.06em',
      },
    },
  },
  plugins: [],
}
