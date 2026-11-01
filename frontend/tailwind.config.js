import tokens from './tokens/tailwind-tokens.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  darkMode: 'class',
  theme: {
    // The design tokens (tokens/tokens.json), every utility prefixed rw (brief 0047).
    extend: tokens,
  },
  plugins: [],
}
