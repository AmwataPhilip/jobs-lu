/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    fontFamily: {
      sans: ["Montserrat", "sans-serif"],
    },
    extend: {
      colors: {
        primary: "#fe5919",
        secondary: "#08bff3",
        disabled: "#B5B5B5",
      },
      backgroundColor: { info: "#DAE2F2", error: "#F7E8E7" },
    },
  },
  plugins: [],
};
