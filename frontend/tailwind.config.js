/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ms: {
          blue: "#0078D4",
          blueDark: "#106EBE",
          blueLight: "#2B88D8",
          blueMuted: "#EBF3FC",
          teal: "#008272",
          gray: "#F3F2F1",
          dark: "#201F1E",
          cardDark: "#1E293B",
          border: "#EDEBE9",
          green: "#107C41",
          amber: "#D83B01",
          purple: "#5C2D91"
        }
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "-apple-system", "sans-serif"]
      }
    },
  },
  plugins: [],
};
