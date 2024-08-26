import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./pages/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    screens: {
      xs: { min: '0px', max: '767px' },
      sm: { min: '0px', max: '899px' },
      md: { min: '900px', max: '1239px' },
      tablet: { min: '0px', max: '1239px' },
      'tablet-only': { min: '768px', max: '1239px' },
      'sm-pc': { min: '0px', max: '1399px' },
      'md-pc': { min: '1240px', max: '1599px' },
      base: { min: '768px' },
      lg: { min: '1240px' },
      xl: { min: '768px', max: '1599px' },
      xxl: { min: '1920px' },
      'xl-chart': { min: '1239px', max: '1599px' },
      'tablet-chart': { min: '1024px', max: '1239px' },
      'xs-chart': { min: '0px', max: '1023px' },
    },
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      fontFamily: {
        pretendard: ['var(--font-pretendard)'],
      },
      colors: {
        highlight: '#0505f1',
        'achid-point': '#ef5d17',
        'achid-black': '#050505',
        'achid-gray': '#f1f1f1',
      },
      transitionProperty: {
        width: 'width',
        height: 'height',
        'max-height': 'max-height',
      },
    },
  },
}
export default config
