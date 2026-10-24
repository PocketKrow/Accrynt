# Back up, verify and move Accrynt

## Save and check a portable backup

1. Open **Settings → Download JSON backup**. Find the resulting file in your
   downloads and keep a copy outside the browser, on storage you control.
2. Preserve that original file. Open Accrynt in a **separate empty browser profile**
   at the intended destination address. Do not test replacement over your only live copy.
3. Select the file under **Backup & restore**, review its counts, export time and
   workspace label, then confirm replacement in that empty profile.
4. Compare saved months, bill amounts, recurring income, linked/partial payment
   receipts, debt balances/adjustments and Overview's cash breakdown. Check future
   entries separately from actuals. Keep both copies until satisfied.

A download notification or “No later tracked record changes” does not prove that
a file was saved, checked or recoverable. Backups contain unencrypted financial
records. Protect them and never post them publicly. CSV is a report, not a restorable backup.

## Move browser, device or website address

Export from the original browser/profile/address **before** moving. Transfer the
saved portable JSON privately, then perform the empty-profile restore and comparison
above. The destination does not fetch records from the old address.

Storage belongs to the exact origin (scheme, hostname and port) and profile. A new
PocketRelik subdomain, another browser, `localhost` instead of `127.0.0.1`, or HTTPS
instead of HTTP creates a separate store. **A redirect does not migrate IndexedDB.**
The final production hostname is not yet confirmed. Keep access to the original
origin until migration and external backup verification are complete. Personal and
synthetic demo stores are separate; review cross-workspace warnings carefully.

## When storage or an upgrade fails

| Situation | Action |
| --- | --- |
| Access is temporarily denied | Reopen the same profile/address, allow site storage, and use **Retry local storage**. Do not clear site data as a troubleshooting shortcut. |
| Browser storage was cleared, evicted, or the profile was removed | Restore a previously saved portable backup. Accrynt cannot recreate deleted records. Persistent-storage permission reduces some eviction risk but is not a backup. |
| Upgrade failed or a newer unsupported schema is detected | Stop using older builds. Preserve a raw recovery file if storage is readable, then use the matching fixed/newer app or seek help with synthetic diagnostics. Never delete the database to force an upgrade. |
| Portable export fails because records are damaged | Use **Download recovery data**. At the storage error screen, use the native raw recovery option. Preserve the original recovery file before any manual repair. |
| The recovery file is marked `accrynt-raw-recovery` | It is unvalidated, may contain corrupt/incompatible records and **cannot be directly imported**. Repair a copy with qualified help and validate it as a portable file before considering replacement. |
| Downloading or restore fails | Keep the original file and current profile intact. Record the visible error and browser/version. The replacement transaction must either commit all financial tables or leave them unchanged. |

Recovery cannot bypass denied storage or restore evicted data. Pre-replacement
safety downloads are initiated before restore/clear; confirm the file actually exists
yourself. Keep a pre-update portable export. A bad app deployment should be fixed
forward using the current schema, rather than opening records with an incompatible
older writer.

Portable imports support v1–v5, with a 64,000,000-byte UTF-8 ceiling and additional
review over 15,000,000 bytes. Files from unsupported future schemas are refused.
Account labels are descriptive, not independent account balances; amounts use USD.
