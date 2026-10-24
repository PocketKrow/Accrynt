# Production deployment contract

No hosting provider or production URL is established by the current repository.
The GitHub repository has no homepage and reports `has_pages: false`; its workflow
validates code and does not deploy. The connector did not permit reading the
deployments collection. These observations do not establish live-host behavior.
The future PocketRelik subdomain is an owner decision. No domain is hardcoded here.

## Build and serve

Use Node 22.12+ (22.x) or 24+ and the committed npm lockfile:

```bash
npm ci
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
git diff --check
```

Serve the complete **dist/** directory from a dedicated HTTPS origin at `/`, with
correct MIME types. This is a static application; there is no server-side secret,
API, database service or runtime `npm start` requirement. `npm run preview` is a
local validation server, not the production server. Fragment routes use `/#/plan`,
etc.; missing assets must return 404 rather than an HTML fallback. Deploy the build
atomically and retain previously versioned assets while existing tabs update.

Map every response header in [deployment/headers.json](../deployment/headers.json)
to the actual host's response-header configuration. Merely copying that JSON to
dist does not activate it. Vite preview applies it for the browser suite. The policy
permits same-origin scripts, stylesheets, fonts, images, fetches, workers and the
manifest; it forbids inline/evaluated scripts, frames, plugins and form submission.
Dynamic chart dimensions use CSSOM property assignment. WebKit 27.2 has a separately
reproduced native-select CSP regression; see the exact blocker in QA-v1.md. Do not
relax the production policy to hide that engine warning.
There is no blanket `unsafe-inline`, `unsafe-eval`, wildcard, remote CDN or blob
script permission. JSON/CSV Blob downloads do not require such script permissions.

| Resource | Required cache behavior |
| --- | --- |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `Cache-Control: no-cache` (revalidate); never immutable |
| `/assets/<name>-<hash>.js` and `.css` | `public, max-age=31536000, immutable` |
| Other icons/fonts/workbox files | Revalidation is safe; only add long immutable caching if the URL changes with content |

Apply anti-framing via both CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`,
`nosniff`, `no-referrer` and the supplied permissions restrictions. Set HTTPS redirects
and an appropriate HSTS policy only after the owner confirms the host/domain scope;
do not preload or force subdomains without that decision. Do not add third-party
scripts, remote fonts or analytics without revisiting the privacy and CSP contract.
Host access logs may include IPs, URLs and request metadata. The host's retention
and access policy must be documented separately; local financial storage does not
prove that the host collects nothing.

## Verify the deployed candidate (owner/host operator)

Record candidate commit, deployment identifier, final URL, date, browser/OS and result.
From the exact checked-out candidate, retain its dist build and run:

```bash
# Replace this value with the confirmed final origin; do not use a proposed name.
ACCRYNT_ORIGIN='https://your-confirmed-origin'
node scripts/check-host.mjs "$ACCRYNT_ORIGIN"
```

The checker makes read-only GETs, rejects redirects, compares served HTML to local
dist, checks common security headers, cache controls and asset MIME types. It does
not activate hosting or certify browser behavior. Then use a disposable profile and
synthetic records to complete:

1. Open all six sections in both themes. Inspect DevTools requests and console:
   only expected same-origin files, no CSP violations or personal payload requests.
2. Set opening cash, add bill/income, record a receipt and connected payment, and
   compare cash breakdown, debt and Ledger. Download JSON and CSV under the real headers.
3. Restore the actual JSON in a second empty profile; compare all records and totals.
4. Visit online until the production worker controls navigation; close/reopen offline
   and confirm records and local fonts work. Online-first installation remains necessary.
5. Stage a subsequent compatible build, confirm an explicit **Update and reload**
   prompt, and test Keep editing plus Save and continue on a dirty form. Reopen offline.
6. Record real Safari/iOS install, persistence, download/restore and update results.
   Automated WebKit is separate evidence. Check the host log/privacy policy.

If the origin changes, follow [export/import migration](RECOVERY.md) before losing
access to the old one. Redirects do not move records. These checks remain Pending
until a real URL is supplied and exercised.

## Bad-build recovery

Keep the previous deployment artifact and a pre-update portable backup. If a bad
shell is served, first preserve reachable data, then deploy a corrected build that
understands the **current** native schema. Correct cache headers and let the explicit
worker update replace the shell. If the UI cannot open, preserve raw recovery before
considering any repair. Do not clear IndexedDB or recommend an incompatible older
writer as a rollback. Any host-level rollback must first prove current-schema write
compatibility. There is no automatic destructive reset.

References checked 23 October 2026:
[CSP Level 3](https://www.w3.org/TR/CSP3/),
[Zod no-eval configuration](https://zod.dev/compile),
[MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy),
[MDN cache controls](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control),
[GitHub dependency review](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action),
[Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
