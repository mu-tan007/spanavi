/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1a2332',
          light: '#243044',
          dark: '#111927',
        },
        gold: {
          DEFAULT: '#c8a45a',
          light: '#d4b76e',
          dark: '#b8943a',
        },
        slate: {
          750: '#293548',
          850: '#1a2332',
        }
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans JP"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}
