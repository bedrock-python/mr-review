declare const _default: {
    darkMode: ["class", string];
    content: string[];
    theme: {
        extend: {
            colors: {
                bg: string;
                surface: string;
                "surface-2": string;
                border: string;
                text: string;
                "text-muted": string;
                accent: string;
                "accent-fg": string;
                severity: {
                    critical: string;
                    major: string;
                    minor: string;
                    suggestion: string;
                };
            };
            fontFamily: {
                sans: [string];
                mono: [string];
            };
            borderColor: {
                DEFAULT: string;
            };
        };
    };
    plugins: never[];
};
export default _default;
