import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "card":    "0 1px 3px 0 rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .06)",
        "card-md": "0 4px 16px -2px rgb(0 0 0 / .10), 0 2px 6px -2px rgb(0 0 0 / .06)",
        "card-lg": "0 20px 40px -8px rgb(0 0 0 / .12), 0 8px 16px -4px rgb(0 0 0 / .08)",
        "brand":   "0 8px 24px -4px rgb(22 163 74 / .35)",
      },
      backgroundImage: {
        "gradient-brand":   "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
        "gradient-hero":    "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%)",
        "gradient-section": "linear-gradient(180deg, #f9fafb 0%, #ffffff 100%)",
      },
      animation: {
        "fade-in":      "fadeIn .4s ease both",
        "fade-up":      "fadeUp .5s ease both",
        "fade-up-slow": "fadeUp .7s ease both",
        "slide-up":     "slideUp .3s ease",
        "pulse-slow":   "pulse 3s infinite",
        "count-up":     "fadeIn .6s ease both",
        "float":        "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: "0" },                          to: { opacity: "1" } },
        fadeUp:  { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        slideUp: { from: { transform: "translateY(16px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
        float:   {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-12px)" },
        },
      },
      transitionTimingFunction: {
        "bounce-sm": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
