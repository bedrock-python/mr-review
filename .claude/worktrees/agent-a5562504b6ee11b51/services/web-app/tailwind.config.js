export default {
    darkMode: ["class", '[data-theme="ink"]'],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                bg: "rgb(var(--bg) / <alpha-value>)",
                surface: "rgb(var(--surface) / <alpha-value>)",
                "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
                border: "rgb(var(--border) / <alpha-value>)",
                text: "rgb(var(--text) / <alpha-value>)",
                "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
                accent: "var(--accent)",
                "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
                severity: {
                    critical: "var(--severity-critical)",
                    major: "var(--severity-major)",
                    minor: "var(--severity-minor)",
                    suggestion: "var(--severity-suggestion)",
                },
            },
            fontFamily: {
                sans: ["var(--font-sans)"],
                mono: ["var(--font-mono)"],
            },
            borderColor: {
                DEFAULT: "rgb(var(--border))",
            },
        },
    },
    plugins: [],
};
