/** Tailwind v4 has no `tailwind.config`: the theme lives in `app/globals.css`
 * under `@theme`. This file exists only to hand CSS to the Tailwind PostCSS
 * plugin. */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
