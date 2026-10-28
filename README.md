# Ibrahim Faruquee — Portfolio

The main portfolio page: a warm editorial layout with self-hosted type, a film
hero, a Bayer-dither paper field, a seven-project work grid, and about,
experience, and contact chapters.

## Pages

| Path | What it is |
|---|---|
| `/index.html` | The portfolio |

## Files

- `index.html`: page markup
- `styles.css`: page styles and the self-hosted font faces
- `script.js`: navigation, scroll reveals, hero film, marquee, and mobile menu
- `dither.js`: optional three.js Bayer-dither paper field
- `vendor/three-dither.min.js`: the tree-shaken three.js build the field uses
- `assets/hero-fill.mp4`, `assets/hero-poster.webp`: the web-encoded hero film and its poster
- `assets/fonts/`: Manrope and Newsreader WOFF2 files
- `assets/optimized/`: project and portrait media

## Running it

From the repository root:

```powershell
python -m http.server 8123
```

Then open <http://127.0.0.1:8123/>.

A server is recommended: the fonts and the dither vendor module are loaded over
HTTP. The page content, navigation, and images still work without JavaScript;
the film, marquee motion, reveals, and dither are enhancements.
