import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './app/index.html', './landing/**/*.{ts,tsx,html}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        linen: 'var(--linen)',
        ink: 'var(--ink)',
        slate: 'var(--slate)',
        sage: 'var(--sage)',
        flag: 'var(--flag)',
        'linen-deep': 'var(--linen-deep)',
        hairline: 'var(--hairline)',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.01em' }],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(22, 32, 43, 0.06)',
        lift: '0 8px 24px -8px rgba(22, 32, 43, 0.24)',
      },
      keyframes: {
        seatPulse: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '45%': { transform: 'scale(1.35)', opacity: '0.65' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        flagPulse: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        seatPulse: 'seatPulse 320ms ease-out 1',
        flagPulse: 'flagPulse 480ms ease-in-out 1',
      },
    },
  },
  plugins: [],
} satisfies Config;
