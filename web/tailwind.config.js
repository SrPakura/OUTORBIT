/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Barlow Condensed"', '"Noto Sans JP"', 'sans-serif'],
        sans: ['"Inter"', '"Noto Sans JP"', 'system-ui', 'sans-serif'],
      },
      colors: {
        void: '#05010f',
        nebula: '#0c0521',
        cosmic: '#a855f7',
        cyanbolt: '#38bdf8',
      },
    },
  },
  plugins: [],
};
