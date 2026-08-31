# TIKTAK

An event seating planner that runs entirely in the browser. Import a guest list,
arrange tables, mark who can't sit together, print the chart.

No backend, no database, no accounts. The only network requests the app ever
makes are a licence check when someone activates Pro, and a cookieless page
counter on the landing page. Guest lists never leave the device.

- Landing page: `/`
- Planner: `/app/`

## Running it

```bash
npm install
npm run dev        # http://localhost:5173/app/
npm test           # 210 unit tests
npm run lint
npm run build      # -> dist/
npm run size       # build, then check the gzipped budget
```

## Deploying to GitHub Pages

The site is served from **https://tik-tak.online/** — an apex custom domain, so
`VITE_BASE` stays unset and the base path is `/`. `public/CNAME` already holds
the domain.

The workflow in `.github/workflows/deploy.yml` lints, typechecks, tests, checks
the bundle budget and publishes `dist/` on every push to `main`.

First-time setup:

1. **Repository settings → Pages → Source → GitHub Actions.**
2. **DNS at the registrar.** For an apex domain, four A records:

   ```
   @   A   185.199.108.153
   @   A   185.199.109.153
   @   A   185.199.110.153
   @   A   185.199.111.153
   www CNAME <user>.github.io.
   ```

   (Add the AAAA records too if the registrar supports them.) Then, in Pages,
   set the custom domain to `tik-tak.online` and tick **Enforce HTTPS** once the
   certificate has been issued — that can take up to an hour.
3. Nothing else. `public/.nojekyll` is already there, which stops Pages from
   swallowing the hashed asset filenames.

If the site ever moves to a project subpath (`<user>.github.io/<repo>/`), set a
repository variable `VITE_BASE` to `/<repo>/` and delete `public/CNAME`. Every
asset URL is base-aware, so nothing else needs touching.

## Payments

Pro is a one-time $19 licence key, validated from the browser.

- The vendor endpoint lives in `src/license/gate.ts` (`DEFAULT_CONFIG`).
  Lemon Squeezy is the default; `GUMROAD_CONFIG` is a drop-in alternative and
  needs a `productId`.
- Both vendors were checked for cross-origin access from a browser and both
  allow it, so no proxy is needed.
- Both answer a bad key with HTTP 404 *and* a JSON body — the client reads the
  body and never trusts the status code alone.
- Set the real checkout URL in `src/license/LicenseDialog.tsx` (`BUY_URL`).

Client-side gating can be bypassed by anyone willing to open a console. That is
a deliberate trade for having no backend at all, and no effort is spent on
obfuscation. See the comment at the top of `src/license/gate.ts`.

## Where things live

```
src/
  app/       shell, layout, persistence, first run
  store/     project store (zustand + zundo undo), ui store, selectors
  model/     types, seat geometry, constraint engine, auto-arrange, demo data
  panels/    guest list, inspector, toolbar, import, export, auto-arrange
  canvas/    SVG floor plan, table rendering, pan/zoom
  io/        CSV import and export, project files, PDF and place cards
  license/   licence gate and activation dialog
  ui/        buttons, fields, dialog
landing/     the hero that hydrates on the marketing page
scripts/     font baking, screenshots, OG image, bundle budget
```

## Regenerating build artefacts

Some checked-in files are generated. They are committed so a plain
`npm ci && npm run build` works without Python or a browser.

```bash
node scripts/build-pdf-font.mjs   # src/io/pdf/fraunces.ts (needs python3 + fonttools)
node scripts/shots.mjs            # public/shots/*.png (needs a running preview)
node scripts/og.mjs               # public/og.png
```

## Notes for whoever picks this up next

- **Undo grouping.** `withHistoryGroup` / `beginHistoryGroup` in
  `src/store/project.ts` collapse a gesture into one undo step by pausing zundo
  and pushing a snapshot by hand. It reaches into zundo's internals, so a major
  version bump of zundo needs checking there first.
- **PDF text.** jsPDF writes an invalid `/Ordering` in the embedded font's
  CIDSystemInfo, which makes readers ignore the ToUnicode map and the text
  stops being searchable. `fixCidOrdering` in `src/io/pdf/index.ts` corrects it
  in place with a same-length replacement. Removing it silently breaks search
  and copy in every exported PDF.
- **Embedded font.** Fontsource ships Fraunces split by unicode range, and the
  `latin-ext` file contains no basic Latin at all. `scripts/build-pdf-font.mjs`
  merges the ranges and asserts that common letters survive, because the failure
  mode is a PDF whose headings are silently blank.
- **jsPDF dead weight.** `html2canvas` and `dompurify` are aliased to a stub in
  `vite.config.ts`; the `.html()` path is never used and they cost ~58 kB
  gzipped.
