# This branch contains the following

Branch `webdood` of github.com/webdood/openclaw. Rule: every commit on this branch updates this file
(what changed, and why) before it is checked in. The pre-commit hook refuses a commit that does not stage it.

## Base

- Cut 2026-11-23 from upstream/main at 8bc8109271dd (openclaw 2026.11.7 dev line).
- Previous fork branch kept as `webdood-old` (tip 601a9ef79f45, based on the v2026.10.5 release line).

## Carried over from webdood-old (status per item; update as each lands)

Legend: PENDING = not yet ported. PORTED <sha> = on this branch. DROPPED = decided unnecessary, reason given.

### Windows state-dir junction fixes (~/.openclaw -> C:\OpenClaw; OPENCLAW_STATE_DIR=C:\OpenClaw)

- PENDING 01ee3f9c7077 fix(plugins): resolve junction ancestors to the native root before fs-safe admission.
  Why: every plugin under <stateDir>\npm\projects failed "resolved path escapes plugin package directory" when the
  state dir was reached through the junction. Upstream has since shipped its own junction/realpath work
  (45f50f25, feccbe07, #185917): re-check whether this is still needed before porting.
- PENDING d6c17860bebc fix(plugins): key plugin captures by native realpath and case-fold lookups on win32.
  Why: whatsapp/sms/signalwire-sms failed "Bundled companion is outside the plugin's captured module graph"
  because realpathSync (junction spelling "C:\openclaw") and realpathSync.native ("C:\OpenClaw") disagreed.
- PENDING aa139c729329 fix(plugins): tolerate dangling dependency junctions during capture.
  Why: existsSync follows a dangling junction -> EEXIST on the second link -> codex/whatsapp doctor contracts
  failed to load -> doctor --fix refused the plugin state migration (2026-10-20). lstat the link instead.

### Windows runtime fixes

- PENDING d7a27d56864f fix(agents): locate Claude CLI transcripts under CLAUDE_CONFIG_DIR, key by observed cwd on win32.
  Why: with CLAUDE_CONFIG_DIR set and the junctioned state dir, every transcript probe missed, sessions were
  invalidated "missing-transcript" and each turn started a fresh Claude session.
- PENDING 8a0d588f2e36 fix(sessions): post a plain env copy to the session history worker on win32.
  Why: the case-insensitive env Proxy cannot be structured-cloned -> DataCloneError -> every webchat turn died.

### Operability

- PENDING 493f8031d151 doctor: say that database snapshots are in progress before going quiet.
  Why: doctor printed nothing for ~7 min during snapshots and kept getting killed as "hung".
- PORTED 90ad4c409369 build: source maps on by default (opt-out with OUTPUT_SOURCE_MAPS=0). Cherry-picked 2026-11-24, clean.

### TUI feature (fork-only; no upstream equivalent)

- PENDING 4257d441e337 + 62f70ef8604f feat(tui): terminal window title follows the session name (/name foo).

### Browser extension (MV3 reconnects)

- PENDING 9d28bd349322 + 12026b0234d5 fix(browser): stabilize extension transport across MV3 reconnects
  (re-attach shared tabs on resync, keep the alias map on empty snapshots, createTab window fallback).
  Note: original commit says validation was still pending.

### Probably drop

- DROPPED 601a9ef79f45 fix(sqlite-wal): busyTimeoutMs default 0 -> 3000. Superseded by 1d9b15ab5aac above.
  Finding 2026-11-23: every production caller (state DB, agent DB, memory-core, proxy-capture, logbook,
  team-reports, workboard) already passes an explicit 5000; only tests omit it. The default is never reached
  at runtime, so this patch does not change gateway behaviour and does not touch the pinned-reader WAL growth.
  Applies cleanly, but DROP unless a real caller with the option omitted is found.

## New on this branch

- 1d9b15ab5aac fix(sqlite-wal): non-zero default busy timeout for WAL maintenance connections.
  What: configureSqliteWalMaintenance now defaults busyTimeoutMs to 500 ms (DEFAULT_SQLITE_BUSY_TIMEOUT_MS) when a
  caller omits it, and always applies PRAGMA busy_timeout instead of skipping it. Explicit callers unchanged.
  Why: upstream's 0 meant any lock contention on such a connection failed instantly with no retry budget.
  Note: today every production caller passes 5000, so this only bites a future caller that omits the option.
- (this commit) ThisBranchContainsTheFollowing.md added, and git-hooks/pre-commit refuses any commit that does not
  stage it. Why: so the branch always says exactly what it carries and why. Escape hatch: git commit --no-verify.
