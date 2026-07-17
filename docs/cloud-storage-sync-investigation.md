# Cloud Storage & Local→Cloud Sync — Investigation & Decision

**Date:** 2026-06-26
**Author:** Investigation with Claude (research-backed)
**Status:** Decision reached — see TL;DR

---

## TL;DR (decisions)

1. **For RockCap's actual file problem: build a Google Drive adapter.** Keep Google Drive (client does not want another subscription). Mirror file metadata into Convex, preview via Drive's embed, read changes via polling (reuse the Gmail pattern). Near-real-time, no new cost, ~weeks of work.
2. **Box was evaluated and is the stronger *product*, but rejected on the client's "no more subscriptions" constraint.** Its advantages (payload-carrying webhooks, embedded Box Sign, compliance) don't outweigh that constraint for a 3-person team. Design retained below in case the constraint changes.
3. **"Build our own sync system" (a "Clerk for file sync") was investigated deeply.** Verdict: a genuine, unfilled market gap — but structurally defended and graveyard-adjacent. **Do not build it as a product on the current thesis.** A single-OS, single-tenant *internal* version is buildable and would double as cheap product validation.

---

## 1. The problem

The client (3-person UK property-finance firm) uses Google Drive as their de-facto state/collaboration tool: employees in multiple countries edit real Excel files locally; saving auto-uploads via the Drive desktop client; that's their version control. The pain in the app today:

- Download file from app → edit → re-upload → bump version number. No real-time. Lots of download/upload churn — poor UX.

Goal: edits to files (in a cloud-synced folder) should reflect in the deployed app **in real time**, without the manual dance.

**Key fact that simplifies everything:** they use **native `.xlsx`** (real binary files), not native Google Sheets. This keeps every layer in the "clean" lane — lossless storage, clean previews, lossless migration, faithful editing round-trips.

---

## 2. The core architecture (vendor-neutral)

The "real-time" requirement splits into two problems:

1. **Storage → backend** (the work): detect a file changed in cloud storage and pull its metadata.
2. **Backend → app UI in real time** (already solved): **Convex** reactive queries push to all clients automatically once a row updates.

So "cloud storage visible live in the app" reduces to: **keep a Convex table in sync with the storage folder.** The storage vendor is the blob store + change feed; Convex holds metadata + drives the live UI.

```
User edits file locally
  → desktop client auto-uploads
  → storage change feed registers it
  → [adapter] polls/receives webhook
  → upserts row in Convex
  → Convex pushes to subscribed clients
  → app updates instantly
```

This architecture is **identical regardless of vendor** (Drive, Box, OneDrive, self-hosted). Choosing a vendor changes *which API the adapter calls*, not the design. It reuses patterns already in the repo: the Gmail inbound adapter, the Companies House sync, the `documents` metadata table, the `approvals` write-gate.

### Link, not duplicate (avoiding drift)

- **Metadata** is always mirrored into Convex (cheap; powers list/search/reactivity).
- **Bytes** stay canonical in the storage (Drive/Box). Don't snapshot bytes into Convex for human-edited files — that's what causes drift.
- **Derived analysis** (v4 pipeline output) is cached in Convex, **stamped with the storage's version/etag**, so it only re-runs when the source moves.
- **Previews**: embed the storage's own preview (Drive `/preview` iframe / Box Content Preview). Zero drift, zero storage. Works org-wide since the team shares one Workspace/enterprise.

---

## 3. Storage backend options compared

| Option | Verdict |
|---|---|
| **Google Drive** (incumbent) | ✅ **CHOSEN** — no new subscription; works; weakest change-notification ergonomics but fine with polling |
| **Box** | Strong product, rejected on subscription constraint (design retained) |
| **OneDrive / SharePoint (Graph)** | Best-engineered change pipeline + cheap; not chosen (another subscription, MS-centric) |
| **Self-host Nextcloud/Seafile on own S3** | The "own it" answer without building a sync engine; heavier ops; only if data-sovereignty becomes a hard requirement |
| **Build our own sync engine** | See §7 — trap as a product; viable only as a single-OS internal MVP |

### Why not "Drive/object-storage as the app's only object store"

Raw object storage (S3/R2/B2) has **no desktop sync agent** — the agent only ever comes bundled with a product (Box/Dropbox/Drive) or a self-host platform (Nextcloud/Seafile). Drive is a *collaboration product*, not a CDN: rate-limited, auth-gated URLs, availability coupled to a user's account. Partition by authority:

- **Human-collaborated files** → Drive canonical, app references.
- **App-generated files** (v4 output, generated briefs) → app's own store (Convex/Blob) canonical, optionally mirrored to Drive.
- Dividing question: *"Do humans collaborate on this file in the cloud folder?"*

---

## 4. The chosen build — Google Drive adapter

| Piece | Drive answer | Cost |
|---|---|---|
| Mac sync folder | Google Drive for Desktop (already have it) | $0 |
| Auth | OAuth — **reuse/extend the existing Gmail OAuth app**, add Drive scopes | $0 |
| Change detection | **Poll the Changes API on a cron** (`startPageToken` → `changes.list`) — same as Gmail 5-min polling | $0 (free quota) |
| Metadata → Convex → reactive UI | New `driveFiles` table; Convex reactivity = live UI | — |
| Previews in-app | Drive embed (`/file/d/{id}/preview`) — works org-wide | $0 |
| Write-back (folders, move/file) | Drive API, **approval-gated** per CLAUDE.md "no autonomous external action" | $0 |
| Migration | None — stay put | $0 |

### `driveFiles` row shape (sketch)
`{ driveFileId (string), name, mimeType, parentFolderId, modifiedTime, version/headRevisionId, dealId?, docType?, stage?, syncStatus, lastSyncedAt }`

### Real-time / near-real-time
- **Polling (recommended):** no webhook channels to renew; near-real-time (1–2 min); matches proven Gmail pattern. For 3 users, imperceptible.
- Push (`changes.watch`) is available for instant updates but needs a domain-verified HTTPS endpoint + channel-renewal cron (channels expire weekly, **server**-renewed — not a user re-login).

### Login longevity (the "log in every week?" question)
- Webhook channel expiry ≠ user login. With polling there are no channels at all.
- OAuth: **one-time consent + silent refresh forever.** The 7-day refresh-token expiry **only** applies to apps left in **"Testing"** publishing status. Mark the OAuth app **"Internal"** (single Workspace) → no expiry, no Google verification needed. **Already solved for Gmail** — same OAuth system, can extend the same app.

### Honest trade-offs vs Box (cost of staying on Drive)
1. Change notifications clunkier → use polling → near-real-time, not instant.
2. No Box Sign / Governance / Shield (optional extras the client doesn't want anyway).
3. Native-Google-Sheets footgun → irrelevant (all real `.xlsx`).

---

## 5. Box integration design (retained, not chosen)

If the subscription constraint ever changes, Box is the stronger product. Key facts:

- **Auth (single-enterprise — RockCap's case):** JWT or CCG app authorized once by the firm's Box admin, acting as a **Service Account** (+ `As-User` intra-enterprise). No per-user OAuth. (Per-user OAuth only needed for multi-tenant SaaS serving *clients'* Box accounts.)
- **UI Elements** (official `box-ui-elements` React): **Content Explorer** (browse), **Content Preview** (Excel viewer, view+annotate only), **Content Uploader** (push files). Next.js caveats: client-only (`dynamic ssr:false`), `transpilePackages`, `IntlProvider`, `--legacy-peer-deps`, Node `<20.11` engine pin.
- **Browser auth:** downscoped tokens (Token Exchange) — mint parent server-side, downscope per-file, ship child to browser.
- **Webhooks (V2):** payload-carrying (often no follow-up poll), **never expire**, two-key HMAC over body+timestamp (reject >10min), ack <30s. **No `FILE.VERSION` trigger** — new versions arrive as `FILE.UPLOADED`. Back with **Events API `stream_position` cursor** reconciliation (dedupe by `event_id`) to never drift.
- **SDK:** `box-node-sdk` v10 (generated TS-first).
- **Write-back safety:** file `lock` (blocks other users) **+** `If-Match: <etag>` (blocks own job clobbering) → 412.

### Box platform extras (verdicts)
- **Box Sign — USE.** Bundled, unlimited, embeddable (`iframeable_embed_url`) — facility letters/KYC/term sheets signed inside the app. Strongest net-new value.
- **Box Metadata — mirror only.** Convex authoritative; write subset (`dealId/docType/stage`) so Box search/Governance can act on the taxonomy.
- **Shield + Governance — only if regulated** (WORM/17a-4, legal hold, GDPR retention, malware scan). Paid add-ons.
- **Box AI — SKIP** (overlaps the Claude v4 pipeline; meters AI Units; pay twice).
- **Box Relay — SKIP** (Convex checklist/cadence/approvals already owns workflow).
- **Box Skills Kit — IGNORE** (legacy; use a `FILE.UPLOADED` webhook into the existing pipeline instead).

### In-app editing (nice-to-have)
- **Tier 0 (recommended):** "Open in Excel for the web" deep-link → edits auto-save back. Near-zero code; needs M365. Opens in a new tab (faithful editing can't be embedded without becoming a Microsoft WOPI/CSPP host).
- **Tier 1 (real inline):** Univer (Pro, commercial, server-side) — multi-week, imperfect on macro/pivot-heavy finance models. Only if inline editing becomes a funded core requirement.

### Migration (Drive → Box, if ever)
- **Box Shuttle**, free up to 10 TB. ~1 TB is well inside free tier → **$0**.
- All-native-`.xlsx` → **byte-for-byte lossless** (the conversion trap only hits native Google Sheets — none here).
- Manual fixup: external collaborators + public links don't map; freeze Drive at cutover.
- Pattern: pilot → bulk → delta passes → freeze → final delta → cutover. (Migrate first, integrate second.)

### Pricing
- **Box Business, 3 seats, ~$20/user/mo annual = ~$720/yr.** Unlimited storage (1 TB trivial), desktop sync, full API + UI Elements + webhooks, unlimited Box Sign.
- **No separate Box Platform license** — that paid product (~$500/mo, MAU-based) is only for apps serving *external, non-licensed* users. RockCap's internal-app-on-own-enterprise is covered by Business. **This is the biggest cost lever.**
- Migration $0. Skip Platform/Sign-add-on/Governance.

---

## 6. The "build our own sync system" question

The client likes the idea of *owning* the layer and possibly *expanding/productizing* it ("Clerk for file sync"). Investigated thoroughly. Two separate questions:

### Q1 — Build a sync engine to solve RockCap's own need? **No.**
Disproportionate. Box solves it for ~$720/yr; even an MVP is 3–6 person-months of specialized distributed-systems work. And **finance/Excel is the worst vertical for local sync** (Microsoft's own docs say desktop sync *causes* workbook conflicts, steer to Excel Online).

### Q2 — Build it as a product? **Only under strict, currently-unmet conditions.**

**It is a real gap.** As of mid-2026 there is **no "Clerk for file sync with a desktop folder"** — nothing fuses (a) drop-in DX + (b) native Mac/Windows sync folder + (c) per-user bucket provisioning + (d) real-time app sync. Confirmed by targeted search (YC/Show HN/Product Hunt); Tonsky's "Local, first, forever" essay confirms the gap from inside the local-first community.

**But it's a structurally defended, graveyard-adjacent gap:**
- **Tombstones:** Dropbox killed its Sync/Datastore API (2015, "too complex + low adoption"); **Bitcasa** (white-label embeddable cloud-sync SDK) went bankrupt ~2017; **MongoDB killed Realm/Atlas Device Sync** (2025); **ElectricSQL abandoned** its bidirectional stack (2024).
- **The data-sync gold rush deliberately abandoned files** — PowerSync, Convex, InstantDB, Jazz, Ditto all sync metadata and punt blobs to S3 (binaries have no merge semantics; need different transport). So "blob → S3, sync pointer" is now free and ubiquitous, absorbing most use cases.
- **Demand is shifting from *sync* to *stream/mount*** (Frame.io Drive, LucidLink) for the large-file verticals that most justify a local folder.

**Why Clerk's playbook can't be run on it (four walls Clerk never faced):**
1. Unbounded correctness — conflict resolution is provably not fully automatable.
2. Brutal storage/egress COGS (what bankrupted Bitcasa) vs Clerk's penny-per-user records.
3. Catastrophic failure mode — one data-loss bug ends trust + company.
4. No `npm install` — needs two signed/notarized native agents (macOS File Provider + Windows Cloud Filter); no shared abstraction except commercial **IT Hit** (.NET-only).

**Streaming vs sync (definition):** *Sync* = file copied to local disk, two copies reconciled (the hard problem). *Streaming/mount* = cloud bucket presented as a virtual drive, bytes fetched on-demand block-by-block + cached (Netflix-for-files). Streaming sidesteps reconciliation entirely (one copy + cache) and is more future-aligned for large files.

---

## 7. If it were built — the architecture (it IS literally possible)

Every component is a known, shipping technology. No missing primitive.

```
END-USER DEVICE
  [1] Desktop Agent — registers sync root (File Provider/Cloud Filter), shows folder, fswatch
  [2] Sync Engine  — local state DB (SQLite), 3-tree reconciler (Local/Remote/Synced), conflict policy
  [3] Transport    — content-defined chunking, resumable multipart, dedup by hash
        │ change events / byte streams                ▲ hydrate-on-open
        ▼                                             │
CLOUD CONTROL PLANE ("the product")
  [4] Backend — auth + per-user BUCKET PROVISIONING + metadata DB + change fan-out (webhooks+WS) + SDK/CLI
        │                                             ▲ webhook on every change
        ▼                                             │
  [5] OBJECT STORAGE (S3/R2/B2) — bytes, prefix-per-user      [6] DEVELOPER'S APP — webhook → DB → reactive UI
```

**Developer DX (the target spec — validated as correct):**
```bash
brew install yoursync          # install agent like any CLI
yoursync login                 # auth to control plane
yoursync init my-app           # project + API keys
yoursync storage create        # provision bucket / per-user prefix
yoursync mount ~/MyAppFiles    # register sync root → folder appears
# drop webhook URL + keys into the app env → boom
```

**Flow:** edit `model.xlsx` → save → OS callback → engine diffs → transport chunks+uploads to user's bucket → backend records version + fires webhook → app updates DB → reactive UI updates live. Reverse: app `files.put()` → backend → push to agent → materialize in folder.

**Per-user storage:** prefix-per-user in a shared bucket + scoped STS/R2 tokens (scalable) — *not* bucket-per-user (S3 ~1,000-bucket cap).

**Proof each piece exists:** native folder = File Provider + Cloud Filter (IT Hit wraps both); engine = Dropbox "Nucleus" reference design; transport = desync (BSD) + S3 multipart; provisioning = STS/R2 scoped tokens; fan-out = ordinary pub/sub.

**Where "possible" meets "hard":** boxes [1] and [2]. A *working* version is months; making box [2] never lose data under weird concurrency (conflicts, offline, Office temp-file-rename, partial uploads) is the years. rclone shipped one-way sync in 2014; trustworthy two-way (`bisync`) only stabilized 2025 — an 11-year gap, by experts.

### MVP scope (build-for-self + product validation)
- **One OS (Mac), single-tenant, one prefix on R2, watched-folder (no files-on-demand), conflict-copy on divergence, webhook → demo app.**
- ~3–6 person-months. Delivers RockCap real value regardless, and converts "should we bet years?" into "we have it working — do 50 others want it?"

---

## 8. Recommendation

1. **Ship the Google Drive adapter for RockCap** (no new subscription, weeks, reuse Gmail OAuth + polling). This fully solves the stated problem.
2. **Treat the sync product as a validate-first venture bet, not a build-first one.** If the client's itch is real, run a **1-week buyer-validation sprint** (can he name 50+ buyers who need a *folder*, not streaming/upload? Will they trust a small team with zero-data-loss SLAs?) before any product build.
3. **If a build is wanted regardless**, the single-OS internal MVP (§7) is the disciplined first step — it's the cheapest possible way to get a real artifact and a real answer.
4. **"Own it" ≠ "build the sync engine."** If owning the storage is the emotional driver, self-hosted Nextcloud/Seafile-on-R2 gets there with no engine-building.

---

## 9. Key sources

- **Drive API:** push notifications & changes — developers.google.com/workspace/drive/api/guides/push, /manage-changes, /limits
- **Box:** developer.box.com (webhooks v2, downscope, UI Elements, Sign), box.com/shuttle, box.com/pricing
- **OS substrate:** Apple File Provider (developer.apple.com/documentation/fileprovider); Windows Cloud Filter (learn.microsoft.com/.../cfapi/build-a-cloud-file-sync-engine); IT Hit User File System (userfilesystem.com)
- **Engines/foundations:** rclone (rclone.org/bisync), Syncthing, desync (github.com/folbricht/desync), librsync
- **Graveyard:** Dropbox Sync/Datastore deprecation (dropbox.tech); Bitcasa (en.wikipedia.org/wiki/Bitcasa); MongoDB Realm EOL (mongodb.com forums); ElectricSQL pivot (electric.ax/blog/2024/07/17/electric-next)
- **Data-sync category:** PowerSync attachments, Jazz FileStreams, Ditto attachments, Convex file storage
- **Local-first / the gap:** Tonsky "Local, first, forever" (tonsky.me/blog/crdt-filesync); "Sync Engines Are the Future" (HN)
- **Dropbox engine:** "Rewriting the heart of our sync engine" (Nucleus, Rust) — dropbox.tech
