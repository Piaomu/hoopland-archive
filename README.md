# Hoop League Archive

A Basketball-Reference-style historical archive for a [Hoop Land](https://www.koalitygame.com/hoop-land)
commissioner league, built from season save-file snapshots. Every season, franchise, player, coach,
award, and record gets a page. Seasons with a preserved snapshot also get the full transaction log and
game-by-game results.

## How it works

```
OneDrive/hoop_land/archive/inbox   ←  drop a copy of the save file here at the end of each season
        │  npm run inbox  (or npm run watch)
        ▼
OneDrive/hoop_land/archive/snapshots/HL_<year>.json.gz   raw save, kept forever
OneDrive/hoop_land/archive/extracts/HL_<year>.json       normalized per-snapshot extract
        │  merge
        ▼
data/                               merged league history (committed to git)
        │  npm run build  (Astro)
        ▼
dist/                               static site → GitHub Pages
```

Merge rules:

- Cross-year facts (standings ledgers, brackets, awards, records, coaching history) come from the newest snapshot.
- Per-year facts (trades, signings, injuries, game results) come only from the snapshot taken during that year.
- Players are unioned across snapshots, so older snapshots recover retirees the game later purges.

## Commands

```bash
npm run ingest -- <path-to-save-file>   # ingest one save (plain or .gz), then rebuild data/
npm run inbox                           # ingest everything waiting in the inbox, then rebuild
npm run rebuild                         # rebuild data/ from stored extracts only
npm run watch                           # poll the inbox forever
npm run dev                             # site dev server
npm run build                           # static build to dist/
```

Paths live in `archive.config.json`. Publishing is gated by `site.config.json`:
`publishedThroughYear` hides every season after that year, and `episodes` links a season page to its
documentary episode, e.g. `"2107": { "title": "Episode 4: 35 and 0", "url": "https://..." }`.

## Where the save file is

The game's live save for slot 1 is at
`%LOCALAPPDATA%Low\Koality Game\Hoop Land\Season Saves\Save Slot 01\PRO_LEAGUE_SAVE_FILE`.
Copy it into the inbox before advancing to the next season; the ingester reads the year from the file,
so the file name does not matter.

## Automating the inbox

`scripts/register-watcher.ps1` registers a Windows scheduled task that runs `npm run watch` at logon.
Run it once from an elevated PowerShell if you want the inbox picked up automatically.
