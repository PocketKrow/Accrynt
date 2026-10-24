# Accrynt 1.0.0-rc.1

Candidate prepared 24 October 2026. Not a published tag/release or final v1 approval.

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
demo isolation, forward-only migrations and explicit PWA updates remain intact.

Known limits: USD only, descriptive account labels, manual planning, no bank/cloud
sync, no automatic opening-cash rollover or interest posting, memory-only drafts,
unencrypted records/backups and dependence on browser/profile/origin storage.
Downloads do not prove external saving. Raw recovery is unvalidated and not directly
importable. Real Safari/iOS, phone inputs/resume, actual 200%/400% zoom, manual screen
readers, production headers/cache/update/migration and owner trial remain required
gates in [QA-v1.md](QA-v1.md). The production hostname/provider, private security
reporting route and project license still require owner decisions. No infrastructure
was activated and no merge, deployment, DNS change, tag, release or permissions
change was performed.
