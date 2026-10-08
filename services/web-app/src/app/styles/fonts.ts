// The web fonts ship with the app: loaded from a CDN they failed now and then, and the UI fell
// back to Helvetica. Only the weights of the type scale (400/500/600) and the scripts the UI
// and review text use (Latin, extended Latin, Cyrillic) are bundled. Each file carries a
// unicode-range, so the browser fetches only the scripts on screen.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-ext-400.css";
import "@fontsource/ibm-plex-sans/cyrillic-400.css";
import "@fontsource/ibm-plex-sans/latin-400-italic.css";
import "@fontsource/ibm-plex-sans/latin-ext-400-italic.css";
import "@fontsource/ibm-plex-sans/cyrillic-400-italic.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-ext-500.css";
import "@fontsource/ibm-plex-sans/cyrillic-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-ext-600.css";
import "@fontsource/ibm-plex-sans/cyrillic-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/cyrillic-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-ext-500.css";
import "@fontsource/jetbrains-mono/cyrillic-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
import "@fontsource/jetbrains-mono/latin-ext-600.css";
import "@fontsource/jetbrains-mono/cyrillic-600.css";
