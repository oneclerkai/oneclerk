import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#fafaf7',
        panel: '#ffffff',
        accent: '#ffcd5c',
        'accent-soft': 'rgba(255,205,92,0.18)',
        primary: '#0d0d0f',
        muted: 'rgba(15,15,20,0.55)',
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'grid-pattern': `
          linear-gradient(rgba(15,15,20,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(15,15,20,0.04) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        'grid': '28px 28px',
      },
    },
  },
  plugins: [],
}
export default config
