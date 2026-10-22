/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Inter"',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        ios: {
          bg: '#060911',
          card: '#101624',
          border: 'rgba(255, 255, 255, 0.08)',
          emerald: '#10B981',
          sky: '#0EA5E9',
          amber: '#F59E0B',
          rose: '#F43F5E',
          violet: '#8B5CF6',
        },
      },
    },
  },
  plugins: [],
};
