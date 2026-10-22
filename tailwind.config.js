/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: ['btn', 'btn-primary', 'btn-ok', 'btn-ghost', 'btn-danger'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['Newsreader', 'Georgia', 'Cambria', 'serif'],
      },
      colors: {
        ink: { 950: '#0C1A2E', 900: '#12243D', 800: '#1B3556', 700: '#2B4A73' },
        paper: '#F6F5F1',
        line: '#E5E2D9',
        brand: { 50: '#EEF4FB', 100: '#DCE8F7', 500: '#2C6BC0', 600: '#1E4F8F', 700: '#173F73' },
        gold: { 50: '#FBF5E8', 400: '#CFA458', 500: '#B88A3B' },
        ok: { 50: '#E9F6EF', 500: '#157A55', 600: '#0F6444' },
        warn: { 50: '#FFF6E0', 500: '#B97F05' },
        bad: { 50: '#FDECEC', 500: '#C03535' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(12,26,46,.04), 0 8px 24px -12px rgba(12,26,46,.10)',
        lift: '0 2px 4px rgba(12,26,46,.06), 0 16px 32px -14px rgba(12,26,46,.22)',
      },
      keyframes: {
        fadeUp: { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'none' } },
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        scaleIn: { '0%': { opacity: 0, transform: 'scale(.96)' }, '100%': { opacity: 1, transform: 'none' } },
        slideLeft: { '0%': { opacity: 0, transform: 'translateX(24px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        sweep: { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(220%)' } },
        floaty: { '0%,100%': { transform: 'translateY(0) scale(1)' }, '50%': { transform: 'translateY(-18px) scale(1.04)' } },
        pop: { '0%': { transform: 'scale(.4)', opacity: 0 }, '70%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)', opacity: 1 } },
        ping2: { '0%': { boxShadow: '0 0 0 0 rgba(30,79,143,.45)' }, '100%': { boxShadow: '0 0 0 10px rgba(30,79,143,0)' } },
      },
      animation: {
        'fade-up': 'fadeUp .5s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fadeIn .4s ease both',
        'scale-in': 'scaleIn .35s cubic-bezier(.2,.7,.2,1) both',
        'slide-left': 'slideLeft .4s cubic-bezier(.2,.7,.2,1) both',
        shimmer: 'shimmer 1.4s linear infinite',
        sweep: 'sweep 3.2s ease-in-out infinite',
        floaty: 'floaty 9s ease-in-out infinite',
        pop: 'pop .35s cubic-bezier(.2,.9,.3,1.3) both',
        ping2: 'ping2 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
}
