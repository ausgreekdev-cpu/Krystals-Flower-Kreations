// Tailwind configuration for "Botanical Studio" aesthetic
// Refined, organic, premium — warm paper tones, serif headings, soft radius
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paper palette
        paper: {
          50: '#FAF8F5',
          100: '#F5F1EB',
          200: '#EDE8E0',
          300: '#E0D9CE',
        },
        // Charcoal for dark surfaces
        charcoal: {
          50: '#F5F5F5',
          100: '#E0E0E0',
          200: '#B0B0B0',
          300: '#808080',
          400: '#505050',
          500: '#3A3A3A',
          600: '#2A2A2A',
          700: '#1E1E1E',
          800: '#141414',
          900: '#0A0A0A',
        },
        // Accent palette — organic, muted
        terracotta: {
          DEFAULT: '#C4786B',
          light: '#D4908A',
          dark: '#A8625A',
          glow: 'rgba(196, 120, 107, 0.3)',
        },
        sage: {
          DEFAULT: '#9CAF88',
          light: '#B8C9A8',
          dark: '#7A9068',
          glow: 'rgba(156, 175, 136, 0.3)',
        },
        rose: {
          DEFAULT: '#D4A5A5',
          light: '#E0B8B8',
          dark: '#C08888',
          glow: 'rgba(212, 165, 165, 0.3)',
        },
        ivory: '#FFF8E7',
        // Semantic
        success: { 50: '#F0FDF4', 200: '#BBF7D0', 800: '#166534' },
        warning: { 50: '#FFFBEB', 200: '#FDE68A', 800: '#92400E' },
        danger: { 50: '#FEF2F2', 200: '#FECACA', 800: '#991B1B' },
      },
      fontFamily: {
        heading: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
        full: '9999px',
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
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}