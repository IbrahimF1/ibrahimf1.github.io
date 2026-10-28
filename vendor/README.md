# Vendored three.js

`three-dither.min.js` is a tree-shaken build of [three.js](https://threejs.org/)
r186.1, used only for the portfolio's Bayer-dither paper field.

It contains `WebGLRenderer`, `Scene`, `OrthographicCamera`, `PlaneGeometry`,
`ShaderMaterial`, `Mesh`, and `Vector2`. Nothing else from three.js is included.

- Source: `three@0.186.1` from npm
- Bundler: esbuild
- Size: 529 KB, about 133 KB gzipped
- License: MIT, see `three.LICENSE`

## Rebuilding

```powershell
npm install three esbuild
@'
export {
  WebGLRenderer,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  Mesh,
  Vector2
} from "three";
'@ | Set-Content -Encoding ascii entry.js
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=three-dither.min.js
```

The result is committed so the site has no build step and no runtime CDN
dependency. If you replace it, keep the three.js version and license note here up
to date.
