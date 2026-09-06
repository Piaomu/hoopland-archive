# Hoop League Archive: runbook for the OpenClaw assistant

This repo turns Hoop Land season save files into the public archive at
https://piaomu.github.io/hoopland-archive/. Driftwood drops a save file into a OneDrive folder;
your job is to notice it, ask whether to update the archive, and run the publish when told yes.

Repo: `C:\Users\drift\source\repos\hoopland-archive`
Inbox: `C:\Users\drift\OneDrive\hoop_land\archive\inbox`

## Detect (heartbeat)

Run, from the repo folder:

```
npm run -s status
```

It prints one JSON line, for example:

```
{"pending":[{"file":"PRO_LEAGUE_SAVE_FILE","mb":67.0,"stable":true,"ageMinutes":12}],"snapshots":[2105,2119]}
```

- `pending` empty: nothing to do, stay quiet.
- Any entry with `stable: false`: the file is still syncing from OneDrive. Stay quiet; check again next heartbeat.
- Otherwise: ask Driftwood on WhatsApp, once per file, something like
  "A new Hoop Land save (67 MB) landed in the archive inbox. Update the archive?"
  Remember which file names you have already asked about so you do not ask twice.

## Publish (only after Driftwood says yes)

Run, from the repo folder:

```
npm run -s publish
```

It ingests every file in the inbox, stores the raw snapshot and extract in OneDrive, rebuilds `data/`,
commits and pushes, waits for the GitHub Pages deploy, and prints the live URLs. It takes two to four
minutes. Report the final "live:" line to Driftwood, including any new season URLs. If it prints
"nothing to publish" or "waiting", say so.

If it fails, send the last few lines of output. Do not retry more than once, and do not run any git
commands other than through `npm run publish`.

## Rules

- Never publish without an explicit yes in the current conversation.
- Never delete files from the inbox, snapshots, or extracts folders.
- A file that fails to parse is moved to `inbox\failed` automatically; mention it, do not touch it.
