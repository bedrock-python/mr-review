// The web fonts ship with the app: loaded from a CDN they failed now and then, and the UI fell
// back to Helvetica. fonts.css declares IBM Plex Sans and JetBrains Mono at the weights of the
// type scale (400/500/600, plus Plex 400 italic) for Latin, extended Latin and Cyrillic, woff2
// only, each with its unicode-range: a page fetches only the scripts it shows.
// Regenerate it with `node scripts/generate-fonts-css.mjs` after bumping @fontsource/*.
import "./fonts.css";
