/** @type {import('tailwindcss').Config} */
module.exports = {
  corePlugins: {
    preflight: false, // Disable Tailwind's reset to avoid conflicts with Docusaurus
  },
  content: [
    './src/**/*.{js,jsx,ts,tsx,mdx}',
    './docs/**/*.{md,mdx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#ccff00',
          50: '#f8ffe5',
          100: '#eeffb8',
          200: '#e0ff85',
          300: '#d4ff52',
          400: '#ccff00',
          500: '#b8e600',
          600: '#99cc00',
          700: '#739900',
          800: '#4d6600',
          900: '#263300',
        },
        surface: {
          dark: '#0a0a0a',
          darker: '#050505',
          card: '#0c0c0c',
          elevated: '#111111',
          border: 'rgba(255, 255, 255, 0.1)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
