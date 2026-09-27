import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: 'var(--color-primary)',
        ink: 'var(--color-foreground)',
        danger: 'var(--color-destructive)',
        accent: 'var(--color-accent)',
        surface: 'var(--color-background)',
        card: 'var(--color-card)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
      },
      borderRadius: {
        card: '12px',
        control: '8px',
      },
    },
  },
  plugins: [],
};

export default config;
