// Tailwind configuration for "Botanical Studio" aesthetic
// Uses CSS variables (RGB triplets) so dark mode works via .dark class
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bloom: {
          50: 'rgb(var(--bloom-50) / <alpha-value>)',
          100: 'rgb(var(--bloom-100) / <alpha-value>)',
          200: 'rgb(var(--bloom-200) / <alpha-value>)',
          500: 'rgb(var(--bloom-500) / <alpha-value>)',
          700: 'rgb(var(--bloom-700) / <alpha-value>)',
          900: 'rgb(var(--bloom-900) / <alpha-value>)',
        },
        royal: {
          50: 'rgb(var(--royal-50) / <alpha-value>)',
          100: 'rgb(var(--royal-100) / <alpha-value>)',
          200: 'rgb(var(--royal-200) / <alpha-value>)',
          300: 'rgb(var(--royal-300) / <alpha-value>)',
          400: 'rgb(var(--royal-400) / <alpha-value>)',
          500: 'rgb(var(--royal-500) / <alpha-value>)',
          600: 'rgb(var(--royal-600) / <alpha-value>)',
          700: 'rgb(var(--royal-700) / <alpha-value>)',
          800: 'rgb(var(--royal-800) / <alpha-value>)',
          900: 'rgb(var(--royal-900) / <alpha-value>)',
          950: 'rgb(var(--royal-950) / <alpha-value>)',
        },
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface-2) / <alpha-value>)',
        surface3: 'rgb(var(--surface-3) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        highlight: 'rgb(var(--highlight) / <alpha-value>)',
        // Botanical-specific named colors (static, for direct use)
        terracotta: { DEFAULT: '#C4786B', light: '#D4908A', dark: '#A8625A' },
        sage: { DEFAULT: '#9CAF88', light: '#B8C9A8', dark: '#7A9068' },
        rose: { DEFAULT: '#D4A5A5', light: '#E0B8B8', dark: '#C08888' },
        ivory: '#FFF8E7',
        paper: { 50: '#FAF8F5', 100: '#F5F1EB', 200: '#EDE8E0', 300: '#E0D9CE' },
        charcoal: {
          50: '#F5F5F5', 100: '#E0E0E0', 200: '#B0B0B0',
          300: '#808080', 400: '#505050', 500: '#3A3A3A',
          600: '#2A2A2A', 700: '#1E1E1E', 800: '#141414', 900: '#0A0A0A',
        },
        success: { 50: 'rgb(var(--success-50) / <alpha-value>)', 200: 'rgb(var(--success-200) / <alpha-value>)', 800: 'rgb(var(--success-800) / <alpha-value>)' },
        warning: { 50: 'rgb(var(--warning-50) / <alpha-value>)', 200: 'rgb(var(--warning-200) / <alpha-value>)', 800: 'rgb(var(--warning-800) / <alpha-value>)' },
        danger: { 50: 'rgb(var(--danger-50) / <alpha-value>)', 200: 'rgb(var(--danger-200) / <alpha-value>)', 800: 'rgb(var(--danger-800) / <alpha-value>)' },
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0', sm: '4px', DEFAULT: '6px', md: '8px',
        lg: '12px', xl: '16px', '2xl': '20px', '3xl': '24px', full: '9999px',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'soft-lg': '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)',
        'soft-xl': '0 16px 40px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
        'warm': '0 4px 12px rgba(196, 120, 107, 0.15)',
        'sage': '0 4px 12px rgba(156, 175, 136, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}