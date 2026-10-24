# Accrynt 1.0.0

Production source promotion requested by the owner on 24 October 2026. This updates
`main`; it does not publish a GitHub release/tag or deploy a host.

- Removed the demo, its navigation/reset controls, optional sample loading, automatic
  synthetic seeding, demo theme selection and demo CSV/download naming.
- Production always opens the existing personal database. Legacy demo query strings
  do not seed or switch storage. Existing personal records/themes and old demo
  databases are preserved; no database is deleted or silently imported.
- Moved synthetic datasets and example-writing helpers to test fixtures. Browser
  regression tests now import synthetic data through the standard restore flow.
- Kept legacy synthetic-labelled backup import compatibility and its warning.
- Promoted package/app/lockfile metadata to 1.0.0 by explicit owner instruction.

The WebKit 27.2 native-select CSP warning and real-device/accessibility/production-host
checks documented in QA-v1.md remain unresolved. Version promotion does not mean
those checks passed. Final exact-commit CI evidence is recorded in the production PR.

## Hardening included from 1.0.0-rc.1

- Added a restrictive, provider-neutral production header/cache contract and a
  read-only post-deployment checker. Production preview now exercises that contract.
  Zod uses interpreted validation, avoiding a caught dynamic-code probe under no-eval CSP.
  WebKit 27.2 reports an upstream native-select CSP violation even on plain HTML;
  the strict check remains enabled and this validation blocker is documented.
- Expanded WebKit coverage to connected payments, stale forms, recurring bills and
  income receipts, failure/retry/draft protection, real downloads and fresh-profile
  recovery. A Chromium-to-Firefox case compares all seven financial tables and cash.
- Fixed ambiguous fingerprint shape-cache keys containing embedded NULs in raw
  native objects. Valid financial records retain identical SHA-256 witnesses; no
  schema or portable-format change is needed.
- Transaction entry initially focuses Description. Settings now explains backup
  verification, origin migration, unencrypted storage, USD/account-label scope and
  possible host access logs in compact optional disclosures.
- Updated only advisory-affected build dependencies: fast-uri 3.1.8 → 3.1.9 and
  serialize-javascript 7.1.2 → 7.1.4. Added weekly npm/Actions update proposals,
  read-only PR dependency review and a security reporting policy.
- Added reproducible small/six-year profiling, recovery/migration documentation,
  a deployment smoke procedure, manual evidence matrix and owner trial checklist.

Profiling did not justify a storage rewrite. A canonicalizer experiment yielded
little end-to-end benefit and was removed. Full legacy-writer witness checking and
consistent snapshots remain; large-workspace save latency is a documented candidate
limitation requiring representative-device acceptance, not a promised speedup.

The six-section Carbon × Glacier workspace, integer-cent accounting, explicit
income/payment semantics, historical receipts, atomic replacement, undo ordering,
personal-storage continuity, forward-only migrations and explicit PWA updates remain intact.

Known limits: USD only, descriptive account labels, manual planning, no bank/cloud
sync, no automatic opening-cash rollover or interest posting, memory-only drafts,
unencrypted records/backups and dependence on browser/profile/origin storage.
Downloads do not prove external saving. Raw recovery is unvalidated and not directly
importable. Real Safari/iOS, phone inputs/resume, actual 200%/400% zoom, manual screen
readers, production headers/cache/update/migration and owner trial remain required
gates in [QA-v1.md](QA-v1.md). The production hostname/provider, private security
reporting route and project license still require owner decisions. Only the owner-authorized source merge is included. No infrastructure activation,
deployment, DNS change, tag/release or permissions change is included.
