# Export and import

**Settings → Export** and **Settings → Import** move hosts, AI providers, saved review presets
and review history between mr-review instances, or into a backup, as one JSON file. Records
keep their ids, so a review still points at its host and its preset after the move, and
importing the same file twice never creates duplicates.

## Export

Choose what to include — hosts, AI providers, review presets, review history — and how host
tokens and provider API keys go into the file:

| Option | What the file holds |
|--------|---------------------|
| **Encrypt with a passphrase** (default) | Tokens and API keys encrypted under a passphrase you type twice. You need it to import the file |
| **Leave secrets out** | Everything except tokens and API keys. Re-enter them after importing |
| **Include secrets in plain text** | Tokens and API keys readable by anyone who gets the file. Only on an explicit choice |

Every review is exported, not only the 50 most recent the history list shows.

Encryption derives one key per file from the passphrase with PBKDF2-SHA256 (600 000
iterations, random salt) and encrypts each secret with it (Fernet: AES-128-CBC with an
HMAC). The salt, the iteration count and an encrypted check value are stored in the file's
`encryption` block; ids, names, URLs, presets and reviews are not encrypted.

## Import

1. Click **Choose file…** and pick an export. Nothing is imported yet: the file is checked,
   and a summary shows when it was exported, how many hosts, providers, presets and reviews
   it holds, how many of them already exist here, how its secrets are stored, and whether
   some reviews refer to a host or a preset that is neither here nor in the file.
2. Choose what happens to records that already exist here (the table below).
3. For an encrypted file, enter its passphrase.
4. Click **Import…** and confirm. **Replace existing** asks you to tick an extra
   acknowledgement when it would overwrite records.

If the import fails — a wrong passphrase, a file that is not an export — the file stays
loaded and one message says why, so you can fix the passphrase or the choice and try again.

Records are matched by id. Records only in the file are always added; records only here are
never removed.

| Strategy | A record that exists in both places |
|----------|-------------------------------------|
| **Keep existing** (`skip`) | Left exactly as it is here |
| **Merge** (`merge`) | Hosts and AI providers take the file's values, but favourite repositories and model lists are combined. Of two versions of a review or a review preset, the more recently updated one wins |
| **Replace existing** (`replace`) | Overwritten with the file's version, discarding local changes |

Under every strategy a record keeps its creation date, and a host or provider keeps its
local token or API key when the file carries none — an empty one counts as none, and
export never writes one. A record that would come out unchanged is reported as unchanged.

An encrypted file is decrypted completely before anything is written: a wrong passphrase
or a damaged secret rejects the whole import and leaves the data directory untouched.

Hosts and providers created from a file without secrets have an empty token or API key and
are listed in the import's warnings; add the secret in **Settings** before using them.

Preset names are unique here, ignoring case. A preset from the file whose name another
preset already has is imported as `<name> (imported)` and listed in the warnings. Reviews
that refer to a host or a preset that ends up neither here nor in the file are imported all
the same and counted in the warnings: without the host they cannot reach their merge
requests, without the preset their brief falls back to the built-in one.

## Over the API

| Route | What it does |
|-------|--------------|
| `POST /api/v1/data/export` | Body `{"include_hosts", "include_ai_providers", "include_review_presets", "include_reviews", "encryption_password" \| "include_plain_secrets"}`. Without either secret option, secrets are left out |
| `POST /api/v1/data/import/preview` | Body: the export file. Returns counts and overlap; writes nothing |
| `POST /api/v1/data/import` | Body: the export file plus `merge_strategy` and, for an encrypted file, `decryption_password` |

`import` answers `201` with per-kind counts of added (`*_imported`), updated (`*_updated`)
and unchanged (`*_skipped`) records, plus `warnings` and `errors`. It answers `400` when an
encrypted file comes without its passphrase or with a wrong one, and `422` when the body is
not a valid export file; neither writes anything, and validation errors never repeat the
submitted values back, so a token in a malformed file does not end up in a response or a
log.

Files from earlier versions (format `1.0`, where every secret carried its own salt) are
still imported.

**There is no authentication.** Anyone who can reach the API can export your tokens with
`include_plain_secrets`, so keep the port private — see the
[deployment rules](../agents.md#rules-that-break-a-deployment).
