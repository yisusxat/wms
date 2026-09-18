import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#2563EB',
        ink: '#111111',
        danger: '#DC2626',
      },
    },
  },
  plugins: [],
};

export default config;
