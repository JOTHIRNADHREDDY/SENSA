# Vercel Build Warning Audit

## allowScripts Warnings
**CAUSE**: 
NPM 9+ security mechanisms (specifically the modern `ignore-scripts` handling) threw warnings for dependencies that required post-install scripts to run. Additionally, the frontend mistakenly contained backend dependencies (`firebase-admin` and `@google/genai`) which also triggered warnings.

**FIX**:
1. Removed the unused backend dependencies from the frontend (`firebase-admin` and `@google/genai`).
2. Added an explicit `"allowScripts"` block in `frontend/package.json` to deterministically approve essential build/vendor scripts:
   - `@firebase/util`: `true`
   - `esbuild`: `true`
   - `protobufjs`: `true`

**STATUS**: Resolved. `npm install` no longer produces `npm warn allow-scripts`.

---

## Chunk-size Warning
**LARGEST CHUNKS**: 
`index-xxxxxx.js` (1.46MB unminified / 373kB gzip)

**SIZE**: >500kB

**CAUSE**: 
Vite's default rollup behavior bundled all `node_modules` into a single monolithic chunk, triggering the 500kB default size limit warning. 

**OPTIMIZATION**: 
Implemented `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split node_modules into targeted vendor chunks:
- `firebase-vendor`: Contains all `firebase` and `protobufjs` code.
- `lucide-vendor`: Contains icon components.
- `vendor`: Contains the rest (including React and Motion).

To accommodate the Firebase SDK itself without arbitrarily ignoring other chunks, `build.chunkSizeWarningLimit` was set to `600`, which correctly suppresses the warning for the 550kB `firebase-vendor` chunk while keeping limits strict for application code.

**STATUS**: Resolved.

---

## Verification Metrics
- **Frontend tests**: PASS
- **TypeScript**: PASS
- **Build**: PASS
- **Clean clone**: PASS (Verified locally against isolated env state)
- **Vercel compatibility**: PASS (Changes are deterministic in `package.json` and do not require interactive input during deployment).
