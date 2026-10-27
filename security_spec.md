# Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Global Safety Net**: Every path not explicitly matched is denied (`allow read, write: if false;`).
2. **Verified Authentication**: All write operations require `isSignedIn()` and `request.auth.token.email_verified == true`.
3. **Path Variable Hardening (`isValidId`)**: All single-document operations (`get`, `create`, `update`, `delete`) validate document IDs against `^[a-zA-Z0-9_\-]+$` with `.size() <= 128`.
4. **No Unbounded List Queries**: The application uses direct document lookups (`get`) on `/global_boards/{boardId}`, `/challenges/{roomId}`, and `/pilots/{pilotId}`. `list` operations are completely disabled (`allow list: if false;`) across all collections to eliminate query-scraping and O(N) read amplification.
5. **Strict Schema & Key Whitelisting (`isValid[Entity]`)**:
   - `LeaderboardBoard`: Requires exact keys `['ownerId', 'topPilotName', 'topScore', 'entries', 'createdAt', 'updatedAt']`, bounded `entries.size() <= 20` with string element check, and server timestamps (`request.time`).
   - `ChallengeRoom`: Requires exact keys, valid enum `status` (`waiting`, `active`, `completed`), terminal state lock (`existing().status != 'completed'`), and action-based `affectedKeys().hasOnly(...)` transitions.
   - `PilotProfile`: Strictly isolated to the owner (`request.auth.uid == pilotId`), with `ownerId == request.auth.uid`, immutable `createdAt` and `ownerId`, and bounded `missedWordIds.size() <= 50`.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: `auth = null` attempting `create` on `/pilots/user1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'user1', token: { email_verified: false } }` attempting `create` on `/global_boards/unit2` -> `PERMISSION_DENIED`.
3. **Shadow / Ghost Field Injection**: Adding `"isAdmin": true` to `/pilots/user1` payload -> Rejected by `hasOnly()`.
4. **Identity Spoofing on Create**: User `attacker` creating `/pilots/victim` or setting `ownerId: 'victim'` -> Rejected by `ownerId == request.auth.uid && pilotId == request.auth.uid`.
5. **Owner Mutation on Update**: Changing `ownerId` on `/challenges/ROOM01` during update -> Rejected by `incoming().ownerId == existing().ownerId`.
6. **CreatedAt Tampering**: Forging client-side `createdAt` or mutating `createdAt` on update -> Rejected by `incoming().createdAt == request.time` / `incoming().createdAt == existing().createdAt`.
7. **Terminal State Bypass**: Attempting to update `/challenges/ROOM01` after `existing().status == 'completed'` -> Rejected by terminal state lock.
8. **Resource Poisoning (1MB String)**: Sending a 5000-char string for `pilotName` -> Rejected by `.size() <= 40`.
9. **ID Poisoning**: Creating `/challenges/invalid id with spaces!` -> Rejected by `isValidId(roomId)`.
10. **Array Overflow**: Sending 100 items in `entries` on `/global_boards/unit2` -> Rejected by `entries.size() <= 20`.
11. **PII / Profile Cross-Read**: User `userA` attempting `get` on `/pilots/userB` -> Rejected by `request.auth.uid == pilotId`.
12. **Unauthorized Collection Scraping**: Any user attempting `list` on `/pilots`, `/challenges`, or `/global_boards` -> Rejected because `list` is forbidden.
