# Long-run and local process validation

Run with Node 24 (no dependencies):

```sh
node tools/sim/campaign.ts
node tools/sim/campaign.ts --encounters
node tools/sim/contention.ts
node --test backend/api/campaign.test.ts backend/api/contention.test.ts
```

Each CLI prints JSON. Both persistent harnesses create and remove a temporary SQLite database. Child processes use `process.execPath`. No existing account or database is touched.

## Persistent campaign

The default campaign creates a production account at D0 and calls COMPLETE_SETUP with a custom commoner (5 bonus points each in strength and defense) and Victor/Lina, then chooses the region-one route. Before dispatching, it earns an actual region-one field victory: only the immortal protagonist deploys, the existing `decide` AI chooses actions, and `UNIT_ACT` / `END_PHASE` execute them through production handlers. Available BEXP is assigned through `ASSIGN_BEXP` before each attempt. Defeats retain normal earned progression and do not risk the companions. The opening stops with a clear assertion failure after 20 unsuccessful battles or 1,000 actions in one battle; it never overrides RNG, grants resources, writes battle/unit/flag state directly, or bypasses unlock gates. It checks the settled victory and persisted region clearance before starting dispatches.

It retains those unit records, inventory and player resources. Each cycle starts individual region-one dispatches for active units, advances at most 30 days using REST, and checks that the actual lazy settlement returned every dispatch. At each annual boundary it starts a field encounter, retreats through the API, performs one weapon training action if affordable, closes SQLite and reopens it. A full snapshot must match across each reopen. After year eight another REST advances 30 days.

The report includes `openingBattles`, a `firstFieldVictory` check, annual day, levels, status, gold, BEXP, inventory, deaths, weapon experience, class mastery, returned dispatch count and settled encounter count (opening attempts plus annual retreats). Annual rows can land a few days beyond the boundary because sortie and training consume real days. There are no annual level assignments, seeded demonstration units, direct day edits or resource grants.

The action policy is reproducible, but production account/dispatch/battle UUIDs and random weapon drops are not deterministic. Checks therefore assert persisted state and monotonic activity rather than exact random rewards. The independent `--encounters` mode preserves the earlier eight-years × twelve-regions × two-encounters battle smoke: it creates fresh units at the enemy level and must not be called a persistent campaign.

Observed validation: `node --test backend/api/campaign.test.ts` passed in approximately 38 seconds on Node 24 while a separate random-account probe ran concurrently. Eight completed one-year probe campaigns each earned the opening victory within 1–3 attempts; the ten-run probe hit its 60-second command timeout before all runs completed. This sample is evidence that the bounded retry policy handles some production randomness, not a guarantee across all seeds. Exhausting its bound intentionally fails the suite with a clear opening-policy error.

The policy mainly exercises dispatch growth, calendar settlement and recovery. It demonstrates a real opening combat victory, but annual field encounters still settle by retreat. It does **not** demonstrate story completion, a viable eight-year battle strategy, or 40–60 hours of human balance evidence. Monthly quests are deliberately unused while that API changes.

## Process contention and crash recovery

The contention harness boots independent Node processes against one local WAL database, waits for all to open it, then releases them together. It checks duplicate REST command IDs, distinct REST IDs competing with a worker calling the real `syncPlayer` inside a Store transaction, and SQLite recovery after SIGKILL during an uncommitted player/event/outbox/receipt transaction. It reopens the database, checks the entire player against the pre-crash value, checks that the uncommitted receipt and event disappeared, and verifies both directions of event/outbox pairing.

Observed result after the concurrency fix: duplicate REST IDs both return success and advance exactly one day; two distinct REST IDs racing the worker both commit, leaving the player at D3. All three command receipts exist. Crash rollback and event/outbox pairing also pass in `backend/api/contention.test.ts`.

API requests now acquire the SQLite write transaction before loading and synchronizing the player. Dispatch checks the current player version and the command receipt inside that transaction, then commits the operation, version and receipt together. Worker synchronization also reloads inside the lock, and direct `syncPlayer` calls refresh stale versions before saving. The harness does not retry calls to hide failures. The duplicate-ID test remains a scheduling probe, not proof of every possible interleaving.

Limits: REST has no award, so duplicate reward settlement is not yet covered by this process harness. It uses production dispatch/Store calls, not HTTP sockets or the deployed worker loop. No deployment, power-loss durability, distributed filesystem behavior, or human playtime claim follows from these local checks.
