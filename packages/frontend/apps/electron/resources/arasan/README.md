# Arasan engine binaries

This folder is filled by `scripts/fetch-arasan.mjs` (pinned in
`third_party/arasan/version.json`).

Expected files after fetch:

- `arasanx-64-avx2.exe` — preferred Windows build
- `arasanx-64.exe` — SSE2 fallback
- `arasanv8-20260622.nnue` — NNUE weights (MIT, same license)
- `LICENSE`

Binaries are gitignored. Run:

```
node scripts/fetch-arasan.mjs
```
