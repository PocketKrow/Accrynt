# Security reporting and maintenance

The v1 release candidate is under validation. `main` receives fixes; older builds
are not promised backports. Do not downgrade an existing database to an older writer.

The available contact route is [repository issues](https://github.com/PocketKrow/Accrynt/issues).
For a nonsensitive report, include the affected commit/version, browser/OS,
expected behavior and a minimal reproduction using **synthetic records only**.
Never attach personal financial records, backups, credentials, host logs or screenshots
containing private information to public issues.

A private reporting channel has **not been verified**. If the report requires
sensitive exploit details, open only a minimal request for a private contact route,
without those details, and wait for the maintainer's instructions. The owner must
establish and document a private route before claiming one is available. No response
deadline or confidential disclosure service is promised here.

Accrynt has no application account, server or bank integration. Financial data is
stored in the current origin's browser profile. Neither local records nor JSON/CSV
downloads are encrypted by Accrynt. An unlocked profile and extensions with access
to the site remain outside that protection. The website host may retain access logs;
the production host and its logging policy still need confirmation.

See [deployment controls](docs/DEPLOYMENT.md), [recovery](docs/RECOVERY.md), and the
[candidate release gates](docs/QA-v1.md). A passing dependency scan is point-in-time
evidence, not a security certification. Weekly Dependabot proposals and PR dependency
review remain subject to normal review and CI; no automatic merge is configured.
