export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bloom: { 50: '#FFF7F0', 100: '#FDE8E0', 200: '#FAD5C8', 500: '#B85C5C', 700: '#4A2C2A', 900: '#2B1A1A' },
        royal: { 50: '#F5F3FF', 100: '#EDE9FE', 200: '#DDD6FE', 300: '#C4B5FD', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9', 800: '#5B21B6', 900: '#4C1D95', 950: '#2E1065' }
      }
    }
  },
  plugins: []
}
