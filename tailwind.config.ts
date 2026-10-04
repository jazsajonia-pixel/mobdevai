import type { Config } from "tailwindcss";

const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'Geist Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        background: hsl("--background"),
        foreground: hsl("--foreground"),
        surface: { DEFAULT: hsl("--surface"), 2: hsl("--surface-2") },
        border: hsl("--border"),
        muted: { DEFAULT: hsl("--muted"), foreground: hsl("--muted-foreground") },
        primary: { DEFAULT: hsl("--primary"), foreground: hsl("--primary-foreground") },
        danger: { DEFAULT: hsl("--danger"), foreground: hsl("--danger-foreground") },
        warning: hsl("--warning"),
        success: hsl("--success"),
        ring: hsl("--ring"),
      },
      borderRadius: { lg: "12px", md: "8px", sm: "6px" },
      spacing: { safe: "env(safe-area-inset-bottom)" },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
        "fade-up": "fade-up 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
