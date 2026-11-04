# Security and privacy

Credentials are read server-side from environment variables. The repository’s `.env.example` contains placeholders. Private data, credentials, media, raw model results, caches and build output are excluded from publication. The release scanner checks proposed files and reachable Git history and separately searches built JavaScript for the configured credential.

Users authenticate through salted scrypt passwords and random opaque sessions whose hashes are stored in the database. Cookies are HttpOnly and SameSite Strict. Production configuration requires HTTPS and secure cookies. Mutating browser requests validate Origin. Asset and case access is checked in the backend. Optional local mode permits same-origin loopback access and is rejected in production.

The public reviewer is a separate static service serving only the approved synthetic demo and reports. It rejects write methods and has no API route, database connection, worker access or model credential. The Compose HTTPS gateway routes only to this service. Investigator services bind to loopback and should be reached through a trusted tunnel or VPN.

Only use authorized footage. Original bytes and native artifacts are hash checked. External inference requires authorization, and uploaded provider files have explicit cleanup handling. Retention quarantine is reversible. Back up the SQLite database and evidence volume together, following [deployment](DEPLOYMENT.md).

Raw provider content, filenames, prompts and uploads are untrusted. Schema and frame-reference validation restrict accepted model outputs. FFmpeg calls use argument arrays and resource bounds. Decoder hardening, operator access, disk quotas and organizational privacy decisions remain deployment responsibilities. Review Meta terms for external processing of private footage.

Public source has no authorized project-wide open-source license. See [release notes](RELEASE.md) for provenance and dependency attribution.
