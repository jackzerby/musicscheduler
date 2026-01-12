import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        spotify: {
          black: '#000000',
          'dark-gray': '#121212',
          card: '#181818',
          'card-hover': '#282828',
          green: '#FFAB91',
          'green-hover': '#FFCCBC',
          white: '#FFFFFF',
          gray: '#B3B3B3',
          'light-gray': '#535353',
          'player-bg': '#181818',
          sidebar: '#000000',
        },
      },
      fontFamily: {
        spotify: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      spacing: {
        'sidebar': '230px',
        'player': '90px',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease forwards',
        'scale-press': 'scalePress 0.1s ease',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scalePress: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.96)' },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
