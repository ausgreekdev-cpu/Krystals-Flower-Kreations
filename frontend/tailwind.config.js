export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bloom: { 50: 'rgb(var(--bloom-50) / <alpha-value>)', 100: 'rgb(var(--bloom-100) / <alpha-value>)', 200: 'rgb(var(--bloom-200) / <alpha-value>)', 500: 'rgb(var(--bloom-500) / <alpha-value>)', 700: 'rgb(var(--bloom-700) / <alpha-value>)', 900: 'rgb(var(--bloom-900) / <alpha-value>)' },
        royal: { 50: 'rgb(var(--royal-50) / <alpha-value>)', 100: 'rgb(var(--royal-100) / <alpha-value>)', 200: 'rgb(var(--royal-200) / <alpha-value>)', 300: 'rgb(var(--royal-300) / <alpha-value>)', 400: 'rgb(var(--royal-400) / <alpha-value>)', 500: 'rgb(var(--royal-500) / <alpha-value>)', 600: 'rgb(var(--royal-600) / <alpha-value>)', 700: 'rgb(var(--royal-700) / <alpha-value>)', 800: 'rgb(var(--royal-800) / <alpha-value>)', 900: 'rgb(var(--royal-900) / <alpha-value>)', 950: 'rgb(var(--royal-950) / <alpha-value>)' }
      }
    }
  },
  plugins: []
}
