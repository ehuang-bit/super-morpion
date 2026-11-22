import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Figtree"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontWeight: {
        normal: '500',
        medium: '600',
        semibold: '700',
        bold: '800',
        extrabold: '900',
      },
    },
  },
  plugins: [],
};

export default config;
