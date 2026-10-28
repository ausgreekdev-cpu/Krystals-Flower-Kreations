// Tailwind configuration for "Brutalist Cyber-Craft" aesthetic
// High-tech, night-shift maker studio. Dark mode only.
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: '#090909',
        carbon: '#1A1A1A',
        steel: '#2A2A2A',
        ash: '#404040',
        smoke: '#666666',
        bone: '#E0E0E0',
        magenta: {
          DEFAULT: '#FF007F',
          dim: '#CC0066',
          glow: 'rgba(255, 0, 127, 0.4)',
        },
        acid: {
          DEFAULT: '#BFFF00',
          dim: '#99CC00',
          glow: 'rgba(191, 255, 0, 0.4)',
        },
        alert: '#FF3333',
        ok: '#00FF88',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"Fira Code"', 'monospace'],
        sans: ['"Fira Code"', 'monospace'],
      },
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },
      borderWidth: {
        DEFAULT: '1px',
        2: '2px',
        3: '3px',
        4: '4px',
      },
      boxShadow: {
        'magenta-glow': '0 0 12px rgba(255, 0, 127, 0.4), 0 0 24px rgba(255, 0, 127, 0.15)',
        'acid-glow': '0 0 12px rgba(191, 255, 0, 0.4), 0 0 24px rgba(191, 255, 0, 0.15)',
        'brutal': '4px 4px 0px 0px #FF007F',
        'brutal-acid': '4px 4px 0px 0px #BFFF00',
      },
      animation: {
        'blink': 'blink 1s step-end infinite',
        'scan': 'scan 2s linear infinite',
        'flicker': 'flicker 0.15s infinite',
      },
      keyframes: {
        blink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        flicker: {
          '0%': { opacity: '1' },
          '50%': { opacity: '0.8' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}