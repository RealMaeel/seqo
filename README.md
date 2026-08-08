# SEQO — Simple EQ Overlay

**A log-powered companion overlay for EverQuest Legends on Windows 11.**
Live DPS meter · spell & proc analytics · loot tracking with real drop rates · item/zone/quest lookup · maps with live positioning · world travel routing · camp timers with placeholder support · rare-spawn, charm-break, buff-fade & AFK alerts · cross-computer sync.

SEQO never touches the game. It reads the log file EverQuest Legends already writes to disk — the same technique GamParse and nParse used safely for two decades of classic EQ. **No injection, no memory reading, no automation. Nothing for anti-cheat to object to.**

![Session view](docs/images/seqo-session-pets.png)

---

## Installation

### For players (recommended)

Grab **`SEQO-Setup-x.y.z.exe`** from the [Releases](../../releases) page and run it — installs per-user (no admin), adds a Start Menu entry, includes an uninstaller. A **portable** exe is also published for the no-install crowd (note: portable unpacks itself each launch, so it starts slower).

> **Windows SmartScreen** will say "Windows protected your PC" the first time, because SEQO isn't code-signed (certificates cost hundreds a year; this is a free fan tool). Click **More info → Run anyway**. The source is right here in this repo if you'd rather audit or build it yourself.

Your data (databases, settings) lives in `%APPDATA%\SEQO` and survives updates and uninstalls.

### From source (tinkerers)

1. Install [Node.js LTS](https://nodejs.org).
2. Download this repository (green **Code** button → Download ZIP) and unzip anywhere, e.g. `C:\SEQO`.
3. In that folder, open a terminal (click the address bar, type `cmd`, Enter) and run:
   ```
   npm install
   npm start
   ```

### Building releases (maintainers)

On Windows, `npm run dist` produces both `SEQO-Setup-x.y.z.exe` (installer) and `SEQO-Portable-x.y.z.exe` in `dist\`. Attach both to a GitHub Release. (Building Windows binaries from Linux requires wine.)

### First-time setup (two minutes)

1. In game, make sure logging is on (`/log`). Your log lives in the game's `Logs` folder as `eqlog_<Name>_<server>.txt`.
2. In SEQO: ⚙ **Settings → Character & Log → Choose…** and pick that file.
3. ⚙ **Settings → Maps → Download all maps ⟳** (one click; ~200 classic zone maps plus EQ Legends fixes).
4. Position the overlay, then press **Ctrl+Alt+O** to lock it and play.

> **Fullscreen note:** overlays can't draw over true exclusive fullscreen. Windows 11's default "fullscreen optimizations" usually makes it work anyway — if SEQO doesn't appear over the game, switch EQ Legends to **borderless/windowed fullscreen** (looks identical).

---

## The overlay itself

| Action | How |
|---|---|
| Move | drag the title bar (edit mode) |
| Resize | drag the gold corner grip — everything inside scales, keeping its ratio |
| Lock (click-through) | **Ctrl+Alt+O**, or the 🔒 button. While locked, clicks pass through to the game |
| Unlock | **Ctrl+Alt+O**, the on-screen **🔓** in the tab strip, or the tray menu |
| Show / hide | **Ctrl+Alt+H**, or single-click the tray icon |
| Minimize | the **—** button; SEQO appears in the taskbar while minimized, and leaves it again on restore |
| Style | opacity, font, size, accent color — ⚙ Settings → Appearance |

**Clicking while locked:** the tab strip and interactive lists stay usable even in click-through mode — controls become clickable the moment your mouse is over them, and everywhere else clicks reach the game. The strip dims while locked so it stays out of your way.

If a hotkey is stolen by another app (Discord and GeForce overlays are the usual suspects), SEQO warns you at launch and the on-screen controls cover everything.

---

## ⚔ Meter

Live per-fight combat stats: your DPS, total damage, max hit, crits, damage taken, and self-healing, plus a damage bar for every combatant — you, your pets, groupmates. Fights are detected automatically; eight quiet seconds ends one, and the meter shows your last fight while idle.

- **Pets count.** Summoned pets are detected from their speech; charmed mobs are recognized when they address you as Master. **Pet damage folds into your row** ("Maeel +🐾") and into your stat tiles — that's your real output. Toggle in Settings → Appearance.
- **Silent pet?** Some pets never speak. **Click its row on the meter** to mark it as yours (click again to unmark). Named pets are remembered forever; article-named mobs are treated as your active charm.
- **Damage shields count** ("burned by YOUR flames") and attribute correctly to you, groupmates, or enemies.

## 📊 Spells

Your damage by source — melee, each spell, each proc, damage shield — with totals, counts, averages, and crits.

- **Fight / Session toggle.** Fight shows the current (or last) fight; **Session** aggregates every fight since launch — thousands of swings, which is what makes proc rates statistically real.
- **Proc detection.** Damage from a spell you never cast is flagged as a proc with its rate per melee swing. The log can't distinguish procs from activated abilities, so **every badge is a button**: click to cycle **cast → proc → ability**. Corrections persist forever.
- Pets appear as 🐾 rows in both views; session header shows you + pets = combined.

## 💰 Loot

Every kill and every looted item is recorded automatically to a permanent database.

- **Recent drops** as they happen (with an on-screen toast), session coin earned.
- **Drop rates (all time):** click a mob to expand its items — `Fine Steel Rapier: 12/21 (57%)`. Rates are per witnessed kill, recorded **per zone** (the same mob name can drop differently in different zones), and sharpen forever as you play.
- **Difficulty tiers handled correctly:** EQ Legends' D0–D4 tiers (Awakened/Adaptive/Fused/Refined) drop the same items at +N levels, so drop rates **pool across tiers** for maximum sample size — while **mob strength records per tier**, since that's what scales.
- **Items are links** — click any item to open its wiki page in the Lookup tab.
- **Wiki export** generates a full, ready-to-paste contribution document, organized by zone. Each mob's entry includes: the pooled drop table with rates and sample size, a **strength-by-difficulty table** (max hit, average hit, sample, and casts seen per tier — higher tiers add classes to mobs, and your data shows it), and **measured respawn times** from your camp cycles. Everything is phrased in the wiki's own terminology (`[[Difficulty Level]]`, D-labels) so editors can use it verbatim.
- With an eqlwiki account configured you can **submit directly**: to your personal sandbox page (default, zero risk) or to each mob's talk page. What you see in the export window is exactly what gets posted.

![Wiki export](docs/images/seqo-wiki-submit.png)

## 📖 Lookup

A **local-first** game database: everything is served from a cache on your disk; the network is touched only when you click an update button.

- **Current zone:** entering a zone is detected from the log. Click **Update ⟳** once per zone to pull its named mobs, their drops (with rarities), the zone spawn timer, and its quest list from [eqlwiki.com](https://eqlwiki.com) — offline forever after. Your own kill counts and observed drop rates display beside the wiki's data.
- **Search** covers everything cached plus your loot history; **Wiki ⟳** searches online and caches what you open.
- **Item pages** include an **upgrade slider (+0…+10)** that recomputes stats using the game's documented tier rules — +10% per tier (+5% weapon damage), minimum +1, delay unchanged.
- **Check for updates** (Settings → Wiki & Data) compares cached page revisions against the wiki and re-downloads only what changed.

## 🗺 Map

Real zone maps with your position — safely.

- Type **/loc** in game (put it on a hotbutton) — every press moves your dot, with a trail and a freshness timer. This is the nParse technique: log-based, ban-safe.
- Zone maps auto-load on zone entry; resolution self-heals and learns. If a zone isn't recognized, pick its map from the dropdown once — SEQO remembers.
- **🌍 World** toggles a travel map of all of Norrath: every zone, every connection (⛵ boats, ✦ portals), your location in green. **Click any destination** and SEQO highlights the shortest route and spells it out — crossings counted, boats marked.

![World map routing](docs/images/seqo-worldmap.png)

## ⏱ Timers

**Camp timers:** every kill starts a repop countdown automatically. The duration comes from (best first): a cycle *learned* from your own kill-to-kill gaps (marked ⟲ — it keeps the shortest plausible gap, so it only gets more accurate), the zone's spawn timer from the wiki, or a count-up until your second kill teaches it.

- **Camp a mob:** type its name in the "Camp a mob…" box (suggestions from the zone's named list and your history) or ★ any timer row. Camped mobs pin to the **camp bar at the bottom of the overlay — visible on every tab** — and alert when the repop is due.
- Measured respawn cycles also flow into the **wiki export**, per zone and difficulty tier — camp data most wikis have never had.
- **Placeholders:** click **+PH** on a camp, then click the placeholder's row. Any linked PH death resets and teaches the shared spawn cycle — proper classic camp mechanics. Links persist per zone.
- **UP NOW:** if a tracked mob shows any combat activity, its timer flips to ⚔ UP NOW instead of a stale countdown, and resets when it dies.

![Camp timers with PH](docs/images/seqo-ph-timers.png)

**Spell timers:** Settings → Alerts → *Spell timers*, one per line: `Mesmerization = 42` (or `m:ss`). Casting the spell starts a countdown chip on the Meter; recasting restarts it; interrupts and resists cancel it (a chip on screen means the cast landed). Ranks match automatically — "Mesmerization" covers Mesmerization VI. Red at 6 seconds, ping at zero.

![Spell timers](docs/images/seqo-spell-timers.png)

## 🔔 Alerts

Every alert type has its own sound, so you know what happened without looking:

| Alert | Sound | Trigger |
|---|---|---|
| ⭐ Rare up | triple ping | any activity from a zone-named or camped mob (5-min per-mob cooldown) |
| ⏲ Repop due | double ping | a pinned camp's countdown reaches zero |
| 💔 Charm broke | descending "uh-oh" | the charm spell's wear-off line — no false positives |
| ⚔ AFK attack | hi-lo siren | see AFK watch below |
| 👁 Invisibility | rising sweep | the *early warning* ("starting to appear") **and** the drop |
| 🫧 Buff fade | soft boop | any effect ending on you — see below |

- **Buff fades are automatic.** Legends uses a uniform format ("The cool breeze fades."), and SEQO attributes each to its spell line: *Breeze/Clarity (mana regen)*, *Tashani (magic-resist debuff)* — debuffs ending are announced as good news ("Debuff gone"). Unknown effects are **self-learned** by correlating the fade with the cast that produced it, so one cast-fade cycle teaches SEQO your exact spell, permanently.
- **Muted alerts:** every buff/fade alert seen this session appears in Settings → Alerts with a checkbox — tick to silence the spammy ones forever, unmute anytime.
- **Volume:** a dedicated slider with live preview, independent of game and system volume. **Test all alerts 🔔** plays the full set.

**😴 AFK watch:** click **AFK** in the tab strip before stepping away. If anything attacks you, the siren and border flash repeat every 2.5 seconds until you click AFK off **or your character acts** — a real melee swing or cast. Pets fighting, damage shields, and DoT ticks don't count as "back". A charmed pet turning on you also stops being counted as yours the moment its charm-break is detected.

## ⚙ Character & housekeeping

- **Character switcher:** the dropdown lists every `eqlog_*` file in your Logs folder — switch characters instantly. The loot database is shared; the meter resets.
- **Log clearing:** EQ appends to the log forever. Settings shows the current size with **Clear log now**, an optional auto-clear on exit, and an archive-first option (timestamped copy in `Logs\archive\`). Clearing is safe while the game runs and never loses tracked data — the databases already recorded everything.

## 🔗 Sync between computers

- **Shared data folder:** point it at a folder inside Dropbox / Google Drive / OneDrive. Your loot database and game database (drop rates, learned respawns, zone mappings, pet names, PH links, corrections, cached wiki pages) live there and sync via your cloud client. Changes from the other computer reload live with a toast. Play on one computer at a time; window layout and log paths stay per-machine on purpose.
- **Synced game files:** add your character's loadout/UI files (like `Maeel_neriak_LO1.ini`) and they mirror through the shared folder — newest copy wins, with a `.seqo.bak` backup before every overwrite. Camp your character before switching PCs so the game writes its files first.

---

## Troubleshooting

- **Overlay not visible over the game** → switch EQ Legends to borderless/windowed fullscreen.
- **Nothing updating** → check the log file is selected (Settings → Character & Log) and logging is on in game.
- **Map dropdown only says "auto"** → you have no map files yet; click **Download all maps ⟳**.
- **Dot moves the wrong way on the map** → tell us the zone; it's a one-line axis fix.
- **Hotkeys don't work** → another app owns them; SEQO warns at launch, and every function has an on-screen or tray alternative.
- **Wiki login fails** → use a **bot password** from `Special:BotPasswords` (format `YourName@botname`), not your account password.

## Credits

- Zone maps: the [nParse](https://github.com/nomns/nparse) project's classic map set and [Brewall's maps](https://www.eqmaps.info/); EQ Legends zone fixes from [crande25/eql-maps](https://github.com/crande25/eql-maps).
- Game data: [eqlwiki.com](https://eqlwiki.com) via its MediaWiki API — support the wiki, contribute your drop data.
- Built with Electron. Field-tested and shaped by real EverQuest Legends combat logs.

## License

MIT — do what you like, no warranty. SEQO is a fan project, unaffiliated with Daybreak Game Company.
