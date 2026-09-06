# Heartbeat Checklist

- Pokemon Skyquake Discord: prepare daily content suggestions, poll ideas, draft updates, and strategy notes; do not post directly without Driftwood's explicit approval.
- Pokemon Skyquake strategy: look for useful lessons from successful Pokemon fan games, online promotion patterns, server engagement tactics, and the game's current selling points or weaknesses.
- Foma upkeep: watch recent work for features that should update the README, in-app Help, or tutorial/demo project.
- Foma doc drift: compare feature claims in `foma/docs/*.md` against `foma/CHANGELOG.md`. Flag any doc asserting a gap the changelog says shipped — name the doc, the claim, and the contradicting entry. The roadmap docs age fast; the changelog is the source of truth for what exists.
- Foma job health: with Discord off there is no cron failure destination, so failed jobs are silent. Every few days run `openclaw cron list` and `openclaw cron runs` and report any Foma job with consecutive errors or a missed run.
- Hoop Land archive inbox: run `npm run -s status` in `C:\Users\drift\source\repos\hoopland-archive`. If `pending` lists a file with `stable: true` that you have not already asked about, ask Driftwood on WhatsApp whether to update the archive with it (name and size). When he says yes, run `npm run -s publish` there and report the final "live:" line. Full instructions: `OPENCLAW.md` in that repo. Never publish without a yes; never delete inbox files.
- Stay quiet when there is nothing useful to report; only interrupt Driftwood for concrete opportunities, stale documentation risk, time-sensitive Discord needs, or a new Hoop Land save waiting in the inbox.
