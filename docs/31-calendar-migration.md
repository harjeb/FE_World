# Calendar migration: explicit 120 → 500 or 500 adoption

New saves carry `flags.calendarVersion = 500`. This is independent of `players.version`, which remains the optimistic concurrency counter. Existing saves without a marker are **unknown**, even if their day looks like a 500-day save. Login does not infer or add their marker.

The migration requires an explicit source and individual player IDs. Run from the repository root with Node 24's built-in SQLite support; no dependencies are added. It reads raw SQLite records without running Store normalizers, settlement, rewards, or schema initialization.

## Operator procedure

1. Determine the source calendar from deployment/save provenance. A day value or displayed date is not evidence. Use `--from 500` to adopt existing 500-day saves without converting their dates or unit data.
2. Stop the API service, worker, scheduled jobs, admin tools, and **all other database writers**, and keep them stopped through backup, migration, verification, and any recovery. The CLI confirmation records your explicit source choice; it does **not** acquire external downtime or stop services. SQLite's transaction lock only protects the apply transaction.
3. Inspect the dry-run plan. Dry run is the default and opens the existing database read-only, without `openDb` or schema/pragma initialization:

   ```sh
   node tools/migrate-calendar.ts --db /path/to/save.db --player PLAYER_ID --from 120
   ```

   Repeat `--player ID` for each selected player. There is no implicit all-player mode. Unknown IDs, duplicate IDs, unsupported records, or activity locks refuse the operation.
4. Apply with a new, writable backup filename and matching confirmation:

   ```sh
   node tools/migrate-calendar.ts --db /path/to/save.db --player PLAYER_ID --from 120 --apply --confirm-calendar-source=120 --backup /safe/path/save-before-calendar.db
   ```

   For adoption, use `--from 500 --confirm-calendar-source=500`. Do not reuse a backup filename. Parent directories must already exist. Treat any failed/incomplete backup file as unusable until independently verified; retry with a new path.
5. Check the output, player marker/day/version, `calendar_migration_audit`, and application behavior against the backup before resuming services. Save the command output alongside the backup. A repeat with the same source is a no-op; a conflicting marker/source is refused. Already-current new saves are no-ops with `--from 500`.

The backup uses SQLite's online backup API, so committed data in WAL is included; copying only the live `.db` file is insufficient. The CLI reserves the backup path exclusively, checks the backup's `PRAGMA integrity_check`, and compares a logical SHA-256 fingerprint of its schema and every table with the source. Inside `BEGIN IMMEDIATE`, it rechecks that fingerprint and revalidates every selected player. Any change since backup refuses the apply. Fingerprinting reads the full database into memory table by table; schedule sufficient time and memory for large saves.

All selected players apply in one transaction. Units, active order/dispatch SQL columns and JSON, player day, calendar marker, optimistic version increment, quote invalidation, and audit insertion commit together. Any error rolls back all of them, including creation of the audit table. An existing audit row conflicts safely rather than being replaced. Frozen event/receipt/outbox data is not rewritten and migration does not enqueue gameplay events.

## Conversion rules

Dates are zero-based absolute coordinates. Each old 120-day year becomes 500 days, each old 30-day season becomes 125 days, and the fractional position within a season is rounded down:

```text
newDay = floor(oldDay / 120) * 500
       + floor((oldDay % 120) / 30) * 125
       + floor((oldDay % 30) * 125 / 30)

0 → 0, 29 → 120, 30 → 125, 119 → 495, 120 → 500
```

This preserves the source year and season. It does not force an old arena-day coordinate onto a new arena day. No new time is spent, and no resource, reward, recruitment, market refresh, annual entry, or age event is settled by the migration.

- Unit joined/retired/reincarnated dates and age epoch use the coordinate conversion. `ageBaseDays` is adjusted against the converted epoch so the unit's current fractional age scales consistently and its whole-year age stays unchanged. `baseAge` and `lifespanYears` stay in years. Missing age epoch falls back to the explicit joined day; missing base age days requires an explicit `baseAge`. Contradictory or stale whole-year ages refuse; no character defaults are guessed.
- Active production orders (growing or ready) and running dispatches use a **translation** by `newPlayerDay - oldPlayerDay` for both start and deadline. Their promised remaining action days, elapsed duration, output, dispatch `durationDays`, and duration-dependent rewards stay unchanged. Overdue deadlines remain overdue by the same number of action days. SQL deadline columns must match JSON before conversion and are updated together. Collected orders and returned/cancelled dispatches remain source-calendar history.
- `shopMonth`, `tavernQuarter`, `minigameQuarter`, play counts, festival year, and reward counters stay valid source period indices: proportional season conversion preserves their index. Inventory, gold, experience, equipment resources, real-month class purchases, ratings, leases, and wall-clock timestamps do not change.
- `flags.calendarMigration` records source, timestamp, old/new day, and the IDs of source snapshots. The audit contains the complete plan, preserving source-calendar provenance for unchanged historical rows. Preserve this metadata when maintaining saves.

## Refusals and historical isolation

Both conversion and adoption block every active battle (all rows, including those outside Store's latest-five query), runs in `battle`/`between_maps`, annual entries in `qualifier`/`knockout`, any unsettled arena day, and nonzero `festivalRound`. Resolve these through normal gameplay on the appropriate source-calendar deployment before retrying. Do not clear locks with ad hoc SQL.

Unrecognized pending `due_tasks` for a selected player, or global pending tasks, refuse. The known `month-snapshot` task is accepted only with null or empty-object payload; its wall-clock deadline is never converted. Source pending recruitment offers refuse: finish accepting/rejecting them first. Unknown top-level fields in converted unit/order/dispatch records or player flags, and unrecognized nested date fields, refuse for manual review. SQL/JSON disagreements, inconsistent ages, invalid dates, unknown states, or orphan unit run locks also refuse. Additional future/monthly-quest flag fields require an explicit migration policy before they can be admitted; the tool will not guess their calendar semantics.

Battle, replay, snapshot, arena, annual, reincarnation, memorial, legacy, event, and command receipt blobs remain untouched. Finished run/order/dispatch history is also retained. Historical coordinates remain in the **source** calendar; consult the audit and migration marker when interpreting them. An old120 arena history row whose numeric day equals the converted current day refuses the entire migration, avoiding accidental reuse of a settled historical arena record. Resolve that unusual case with a separately reviewed archival strategy; the tool neither deletes nor renumbers history.

Current arena opponent pools require explicit calendar 500 and exclude all snapshot IDs archived by a 120 migration. Unmarked players' snapshots are excluded until explicit adoption/conversion. Adoption from 500 admits existing snapshots without rewriting them. A new snapshot on the same numeric day as an old120 snapshot gets a distinct ID, preserving the frozen source row. Historical snapshot listing remains available.

## Recovery

Keep all services and writers stopped. Verify the backup with SQLite `PRAGMA integrity_check` (must return exactly `ok`) and confirm its player day/flags/version match the pre-migration plan. Preserve the failed/post-migration database **and its matching `-wal`/`-shm` sidecars** together in a separate recovery directory for investigation.

Restore the verified standalone backup to the service's database path only after moving the existing database and its sidecars away. Do not leave an old WAL beside the restored database, and do not copy a backup over a database held open by any process. Preserve ownership and permissions. Open the restored database with the application only after verification; then restart services. The restored save has the old calendar and may require the matching old deployment until migration succeeds. Restoring a backup discards every write after that backup, which is another reason downtime is required.

Tests use temporary SQLite files only. They cover dry-run database/WAL byte preservation, date and age boundaries, remaining order/dispatch days and rewards, resources/counters, 500 adoption, source mismatch/retry, activity/task/ambiguous-data refusals, history preservation, arena snapshot isolation, WAL backup/restore, backup revalidation, and transaction rollback.

```sh
node --test backend/api/calendar-migration.test.ts
```
