/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        sans: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      colors: {
        ink: "#1A1310",
        gold: "#E2883A",
        paper: {
          DEFAULT: "#F8F3E9",
          dim: "#EFE6D6",
        },
        signal: {
          red: "#C1432A",
          green: "#5C8449",
          amber: "#B8860B",
        },
      },
    },
  },
  plugins: [],
};
