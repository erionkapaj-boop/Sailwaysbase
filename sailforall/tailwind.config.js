/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        sea: {
          50: '#eef7ff',
          100: '#dcefff',
          200: '#b6ddff',
          300: '#7fc4ff',
          400: '#41a5ff',
          500: '#1585f5',
          600: '#0a68d1',
          700: '#0952a8',
          800: '#0c4587',
          900: '#0f3b6f'
        },
        sun: {
          400: '#ffb020',
          500: '#f59300',
          600: '#c97600'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.04)',
        card: '0 1px 3px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.05)'
      }
    }
  },
  plugins: []
}
