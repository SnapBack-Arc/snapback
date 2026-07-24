# Known drift: local migration filenames vs. remote tracking table

Investigated and accepted as-is during the Checkpoint 3 hygiene pass
(2026-07-24) — noted here so it isn't mistaken for a new or unexamined
problem in a future session.

## What's true

`supabase migration list` (run against the linked project,
`ytbtfmorkueoaihfgter`) shows several local migration files with no
matching entry in the remote's tracking table, and several remote entries
with no matching local file:

```
local:20260723070953 (settlement_retry_state)              -> remote: none
local:20260724043237 (payment_refund_state)                 -> remote: none
local:20260724101539 (dispute_insurance_premium)             -> remote: none
                                          remote:20260724043739 (unmatched)
                                          remote:20260724101603 (unmatched)
                                          remote:20260724101905 (unmatched)
```

(Plus older, pre-existing mismatches from before this session — several
`00XX_*.sql` numbered files were consolidations of migrations originally
applied under earlier timestamped names; that part isn't new.)

## Why it happened

These three were applied via the Supabase MCP's `apply_migration` tool
rather than the Supabase CLI (`supabase db push`). That tool runs the SQL
directly against the remote database and registers it in the tracking
table under a **timestamp it generates at call time**, not the timestamp
embedded in the local `.sql` filename — so every migration applied this
way creates a local-file/remote-entry pair that doesn't line up by name.

## Why it's not fixed

**The schema itself is not drifted.** Every column/enum value these three
migrations describe is confirmed live and working (verified functionally
throughout this session: `disputes.settlement_state`, `refund_pending`/
`refund_failed` on `payment_status`, `dispute_insurance_premium` on
`payment_kind`, `estimator_sessions.dispute_insurance_premium_usdc`). This
is a mismatch in *bookkeeping metadata only* — which filenames the remote
thinks correspond to which applied changes — not a functional bug.

Reconciling it would mean editing Supabase's internal migration-tracking
table directly, which is a real (if small) risk to take on close to a
deadline for a purely cosmetic problem. Decision: leave as-is.

## If this comes up again

Running `supabase migration list` or `supabase db push` against this
project will show these mismatches. That's expected, not a new
regression — check this file before assuming something broke. If/when
it's worth reconciling, the fix is to manually insert rows into
`supabase_migrations.schema_migrations` (or delete/reinsert) with the
correct local filenames' versions, or accept the drift permanently by
renaming the local files to match their actual remote-registered
versions.
