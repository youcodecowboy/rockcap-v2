/** @type {import('tailwindcss').Config} */
// NativeWind colour namespace, kept in lockstep with lib/theme.ts (dark palette).
// NOTE: entity/status colours are theme-invariant and meaning-bearing. Static classes below
// (e.g. text-m-client) are fine; DYNAMIC classes like `bg-m-${type}` are NOT — NativeWind cannot
// JIT them. For entity-coloured elements driven by data, use inline style from useColors() instead.
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        m: {
          // backgrounds (dark)
          bg: '#0a0a0a',
          'bg-subtle': '#0f0f0f',
          'bg-inset': '#0d0d0d',
          'bg-card': '#111111',
          'bg-brand': '#e5e5e5', // primary surface inverts to light-on-dark
          // text (dark)
          'text-primary': '#e5e5e5',
          'text-secondary': '#b8b8b8',
          'text-tertiary': '#8a8a8a',
          'text-placeholder': '#6e6e6e',
          'text-on-brand': '#0a0a0a',
          // borders (dark)
          border: '#2a2a2a',
          'border-subtle': '#404040',
          // accent (inverted brand)
          accent: '#e5e5e5',
          'accent-hover': '#b8b8b8',
          'accent-subtle': '#111111',
          // semantic (web accent values)
          success: '#22c55e',
          warning: '#eab308',
          error: '#ef4444',
          // entity colours — theme-invariant; static use only
          prospect: '#eab308',
          client: '#22c55e',
          lender: '#14b8a6',
          project: '#6366f1',
          deal: '#3b82f6',
          contact: '#a855f7',
        },
      },
    },
  },
  plugins: [],
};
