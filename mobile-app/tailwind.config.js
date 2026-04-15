/** @type {import('tailwindcss').Config} */
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
          bg: '#fafaf9',
          'bg-subtle': '#f5f5f4',
          'bg-inset': '#e7e5e4',
          'bg-card': '#ffffff',
          'bg-brand': '#000000',
          'text-primary': '#0a0a0a',
          'text-secondary': '#525252',
          'text-tertiary': '#a3a3a3',
          'text-placeholder': '#d4d4d4',
          'text-on-brand': '#ffffff',
          border: '#e5e5e5',
          'border-subtle': '#f5f5f5',
          accent: '#000000',
          'accent-hover': '#171717',
          'accent-subtle': '#f5f5f5',
          success: '#059669',
          warning: '#d97706',
          error: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
