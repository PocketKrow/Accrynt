# ADR 0003 — atomic revisions and honest portable-backup freshness

Accepted for v0.9, 18 October 2026. Portable financial schema stays v5. Native Dexie v5 appends `backupHealth: key` without changing the database names, the seven financial tables or historical migrations.

## Revision contract

One metadata row per database contains a random epoch, a monotonic safe-integer revision, reliability flag, per-table SHA-256 witnesses, optional exported epoch/revision/initiation timestamp and a bounded reminder snooze. Personal/demo databases isolate all of it. No financial payload, draft or health metadata is written to localStorage; financial portable exports exclude the metadata store entirely.

A small DBCore middleware adds the metadata store to every native readwrite transaction touching a financial table, including implicit and bulk operations. It serializes financial mutations within that transaction. Each successful nonempty mutation operation increments the revision and records the table's resulting content witness in the **same native transaction**. Connected operations can advance more than once: the revision is an ordering token, not a user-action count. Metadata failure aborts the native transaction even if a caller catches the error. Rollback removes both financial changes and revision changes. Partial bulk success explicitly retained by a caller is tracked; the repository's multi-table operations remain atomic.

A deliberate durable same-value `put`, missing-key delete or empty-table clear conservatively advances the revision. Repository idempotency paths that return before issuing a mutation do not advance it: retried transaction/payment requests, existing recurrence generation and repeated identical skipped-bill restoration remain clean. Reads, theme changes, export metadata and snoozes do not advance it. Clear, restore and demo reset **only clear financial tables**, keeping the epoch/counter monotonic. Exhausting the safe counter creates a new epoch and removes the old exported association. Missing/corrupt metadata produces a new **unreliable** epoch, never a fresh assertion.

Audited durable entry points: income/opening edits, monthly copy, obligation insert/edit/paid/delete and linked-row detachment, ordinary transaction insert/edit/delete, debt insert/edit/delete and statement events, connected payments/undo, balance adjustments/interest/reversal, recurring rule changes/generation, income skip/edit/restore, bill skip/restore, portable replacement, clear, optional example and demo seed/reset. All pass through the same database middleware. New code that writes these seven stores inherits tracking automatically.

## Older writers and content witnesses

Testing disproved the assumption that a native schema bump blocks older Dexie writers. Dexie retries a VersionError without specifying a version and can reopen a compatible newer database. Existing versionchange handling closes the old connection, but does **not** prohibit reopening it. This ADR does not claim otherwise or modify old migrations to fabricate a fence.

Each financial table has a SHA-256 witness over its primary-key-ordered rows with canonical property ordering. The v5 upgrade establishes witnesses from existing native rows without rewriting them. New databases start with implicitly empty witnesses. Before a tracked table mutation, its existing content is compared to the persisted witness; a mismatch permanently marks tracking unreliable before updating the witness. Missing witnesses for nonempty tables are also unknown.

Settings-only health reads compare all seven tables against the metadata from the **same consistent snapshot**. A legacy edit, deletion or same-count replacement while this build is absent therefore yields unknown after reload. Download metadata updates recheck the actual records under a native write transaction, so an untracked write cannot turn a mismatched snapshot current during export completion. An older same-content rewrite has no distinguishable content difference; the UI's precise assertion is only “No later **tracked** record changes,” and exact content still matches its snapshot. Witnesses do not certify the browser, detect malicious metadata tampering or prove an external file exists. A ready-time native-version guard refuses unsupported newer schemas, including compatible-looking ones with extra stores, into the existing storage recovery screen. It never exports an incomplete seven-table view or rewrites their records. Raw recovery can still preserve all native stores; no destructive fallback/reset runs.

Witnesses persist **hashes only**. Hashing occurs on committed storage snapshots and affected-table writes, never on editor keystrokes. Web Crypto hashing inside native writes is kept alive with Dexie.waitFor; no network is involved. Other routes retain their original financial snapshot query; only Settings/export verifies the complete witness set. Work is bounded by the current table size and adds no per-record storage queries. This deliberate compatibility cost is measured using the six-year fixture, including a transaction-table save. A future indexed/Merkle approach requires evidence; none is added here.

## Exact exported snapshot and initiation

`capturePortableSnapshot` reads all financial tables and metadata in one readonly transaction, checks the witness relationship, validates portable v5 and enforces the shared UTF-8 limit. Its captured revision belongs to those exact rows. Serialization/validation/size refusal cannot update health.

`initiatePortableDownload` invokes the browser download first. Only after successful initiation does it attempt a separate metadata transaction. That transaction retains the current mutation revision, verifies the current witness relationship, and records the captured epoch/revision. A write since capture therefore remains stale. A prior completed export cannot replace a newer exported revision; at equal revision, only the later initiation time wins. Epoch mismatch or unreliable metadata refuses association. Failure before initiation never records an export. If metadata persistence fails after the browser click, the file may have started downloading but freshness is not advanced; the error remains visible.

Restore ignores imported exportedAt for local health. Recovery downloads and mandatory pre-replacement safety snapshots deliberately do not advance portable freshness, even when their content happens to validate. Raw native recovery may preserve the local metadata as part of its explicitly unvalidated all-store envelope; that envelope is not a portable import.

## Wording and reminders

Settings shows: no portable download in this browser tracking history; “Backup download initiated [time]” with no later tracked changes; records changed since that snapshot; or freshness unknown. It never asserts saved-to-disk, synchronization, verification or recoverability. Unknown tracking remains conservative; restoring/importing data alone does not repair its provenance.

One nonblocking reminder is confined to Settings. It requires a populated workspace, a never-exported or changed state and either no export or an initiation at least exactly seven days ago. Unchanged exported records never remind solely due to age; unknown states explain the uncertainty instead. Dismissal persists a seven-day snooze per database and later writes do not clear it. A minute clock updates the open Settings view; pure tests exercise exact time boundaries without sleeping. No automatic downloads or startup modal nags.

## Compatibility and evidence

Portable v1–v4 import and pre-v0.9 v5 roundtrips retain receipts, links and financial semantics. Native v1/v2/v3 migrations still run before v5; existing v4 rows retain exact values. Rollback/recovery and old-writer behavior are exercised in storage tests, including reopening an actual declared-v4 connection after upgrade. Browser workflows exercise cross-tab mutation, restore, deletion, workspace isolation and repeat-entry failures. See [v0.9 QA](QA-v0.9.md) for executed results and limitations.
