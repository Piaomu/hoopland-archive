// Parse a raw Hoop Land season save file into a normalized Extract.
// The raw file is either {"seasonLeagues":[pro, college]} (exported save) or the bare pro
// league object (the game's own PRO_LEAGUE_SAVE_FILE in the save slot folder).

import type {
  Extract, Team, TeamSeason, WL, StatLine, PlayoffYear, Player, PlayerSeason, Coach, CoachTenure,
  RecordsBook, RecordEntry, AwardDef, Game, Transaction, TradeSide, SeasonDetail, CollegeTeam, DraftInfo,
} from './schema.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const wl = (a: number[] | undefined): WL => ({ w: a?.[0] ?? 0, l: a?.[1] ?? 0 });

function statLine(s: Raw): StatLine {
  return {
    GP: s.GP ?? 0, GS: s.GS ?? 0, MIN: Array.isArray(s.MIN) ? (s.MIN[0] ?? 0) : (s.MIN ?? 0),
    PTS: s.PTS ?? 0, FGM: s.FGM ?? 0, FGA: s.FGA ?? 0, TPM: s.TPM ?? 0, TPA: s.TPA ?? 0, FTM: s.FTM ?? 0, FTA: s.FTA ?? 0,
    REB: s.REB ?? 0, ORB: s.ORB ?? 0, AST: s.AST ?? 0, STL: s.STL ?? 0, BLK: s.BLK ?? 0, TO: s.TO ?? 0, PF: s.PF ?? 0,
    PM: s.PM ?? 0, DD: s.DD ?? 0, TD: s.TD ?? 0, POTG: s.POTG ?? 0, W: s.W ?? 0, L: s.L ?? 0,
  };
}

function teamSeason(s: Raw): TeamSeason {
  const r = s.seasonStats, p = s.playoffStats, f = s.finalsStats;
  return {
    yr: s.yr, GP: r.GP, W: r.W, L: r.L,
    home: wl(r.HOME), away: wl(r.AWAY), div: wl(r.DIV), conf: wl(r.CONF),
    PTS: r.PTS, OPP: r.OPP, FGM: r.FGM, FGA: r.FGA, TPM: r.TPM, TPA: r.TPA, FTM: r.FTM, FTA: r.FTA,
    REB: r.REB, ORB: r.ORB, AST: r.AST, STL: r.STL, BLK: r.BLK, TO: r.TO, PF: r.PF,
    strk: r.STRK, l10: r.L10 ?? [],
    seed: s.seed, round: s.round, rank: s.rank, pick: s.pick,
    po: { w: p.W, l: p.L }, fin: { w: f.W, l: f.L }, seriesWins: s.seriesWins,
  };
}

function parseTeams(L: Raw): Team[] {
  const nDiv = L.divisions.length;
  return L.teams.map((t: Raw): Team => ({
    id: t.id, abbr: t.shortName, name: t.name, city: t.city ?? '', logo: t.logoURL ?? '',
    colors: t.teamColors ?? [], division: t.division,
    conference: t.division < nDiv / 2 ? 0 : 1,
    firstYear: t.season?.[0]?.yr ?? L.season.startingYear,
    titles: [...(t.championships?.yearsWon ?? [])].sort((a: number, b: number) => a - b),
    retiredNumbers: (t.retiredNumbers ?? []).map((r: Raw) => ({ num: r.num, pid: r.pid, yr: r.yr })),
    seasons: (t.season ?? []).map(teamSeason),
  }));
}

function parsePlayoffs(L: Raw): PlayoffYear[] {
  const byYear = new Map<number, PlayoffYear>();
  for (const p of L.season.playoffs ?? []) {
    const rounds = (p.rounds ?? []).map((r: Raw) => (r.series ?? []).map((s: Raw) => ({
      top: s.topSeed, low: s.lowerSeed, winner: s.winner, games: s.currentGame, firstTo: s.firstTo,
    })));
    const existing = byYear.get(p.yr);
    // The save occasionally holds an empty duplicate entry for a year; keep the fuller one.
    if (!existing || rounds.length > existing.rounds.length) byYear.set(p.yr, { yr: p.yr, rounds });
  }
  return [...byYear.values()].sort((a, b) => a.yr - b.yr);
}

function playerSeasons(stats: Raw[], league: number): PlayerSeason[] {
  return (stats ?? []).filter((s) => s.league === league).map((s) => ({
    yr: s.yr, sal: s.sal ?? 0,
    rows: (s.season ?? []).map((r: Raw) => ({ tid: r.tid, ...statLine(r) })),
    po: (s.playoffs ?? []).map((r: Raw) => ({ tid: r.tid, ...statLine(r) })),
    fin: (s.finals ?? []).map((r: Raw) => ({ tid: r.tid, ...statLine(r) })),
  }));
}

function parsePlayer(p: Raw): Player {
  const d = p.history?.draft;
  const hi = p.careerStats?.seasonHighs ?? {};
  return {
    id: p.id, fn: p.fn, ln: p.ln, ctry: p.ctry ?? '', pos: p.pos, ht: p.ht, wt: p.wt, num: p.num,
    age: p.age, arc: p.arc ?? '', status: p.status, tid: p.tid,
    draft: d && d.yr ? { yr: d.yr, rd: d.rd, pk: d.pk, tid: d.tid } : null,
    collegeTid: p.history?.tid ?? 0,
    yearRetired: p.history?.yearRetired ?? 0, hofYear: p.history?.yearInducted ?? 0,
    causeOfDeath: p.history?.causeOfDeath ?? 0,
    awards: (p.awards ?? []).filter((a: Raw) => a.league === 0).map((a: Raw) => ({ id: a.id, years: [...a.yearsWon] })),
    seasons: playerSeasons(p.stats, 0),
    college: playerSeasons(p.stats, 1),
    highs: { PTS: hi.PTS, REB: hi.REB, AST: hi.AST, STL: hi.STL, BLK: hi.BLK, TPM: hi.TPM, FGM: hi.FGM, FTM: hi.FTM },
    injuries: (p.history?.injuries ?? []).map((i: Raw) => ({ yr: i.yr, age: i.age, gamesOut: i.gamesOut, major: i.majorSeverity, minor: i.minorSeverity })),
  };
}

function parsePlayers(L: Raw): Player[] {
  const out: Player[] = [];
  const seen = new Set<number>();
  const push = (p: Raw) => { if (!seen.has(p.id)) { seen.add(p.id); out.push(parsePlayer(p)); } };
  for (const t of L.teams) for (const p of t.roster ?? []) push(p);
  for (const p of L.freeAgents ?? []) push(p);
  for (const p of L.hallOfFame ?? []) push(p);
  for (const p of L.retirees ?? []) push(p);
  return out;
}

function parseCoaches(L: Raw): Coach[] {
  return (L.coaches ?? []).map((c: Raw): Coach => ({
    id: c.id, fn: c.fn, ln: c.ln, ctry: c.ctry ?? '', age: c.age, tid: c.tid, status: c.status,
    yearRetired: c.yearRetired ?? 0,
    awards: (c.awards ?? []).filter((a: Raw) => a.league === 0).map((a: Raw) => ({ id: a.id, years: [...a.yearsWon] })),
    tenures: (c.career?.teamHistory ?? []).map((h: Raw): CoachTenure => {
      const s = h.season?.[0] ?? {};
      return { yr: h.yr, tid: s.tid ?? -1, W: s.W ?? 0, L: s.L ?? 0, rank: h.rank ?? 0, round: h.round ?? 0,
        po: { w: h.playoffs?.W ?? 0, l: h.playoffs?.L ?? 0 }, fin: { w: h.finals?.W ?? 0, l: h.finals?.L ?? 0 } };
    }),
  }));
}

function parseRecords(L: Raw): RecordsBook {
  const conv = (list: Raw[]): RecordEntry[] => (list ?? []).map((r) => ({
    pid: r.pid, tid: r.tid, value: r.value, yr: r.yr,
    game: r.gameResults ? { home: r.gameResults.homeTeam, away: r.gameResults.awayTeam, hs: r.gameResults.homeScore, as: r.gameResults.awayScore } : null,
  }));
  const book = {} as RecordsBook;
  for (const scope of ['season', 'playoffs', 'finals'] as const) {
    book[scope] = {};
    for (const [stat, list] of Object.entries(L.records?.[scope] ?? {})) book[scope][stat] = conv(list as Raw[]);
  }
  return book;
}

// News feed type codes, as observed in saves. Unknown codes are kept with a generic label.
const NEWS_KINDS: Record<number, [string, string]> = {
  2: ['draft', 'Drafted'],
  3: ['signing', 'Signed'],
  5: ['release', 'Released'],
  7: ['trade', 'Trade'],
  9: ['performance', 'Player of the Game'],
  10: ['injury', 'Injured'],
  11: ['injury-return', 'Returned from injury'],
  16: ['contract-expired', 'Contract expired'],
  17: ['retirement', 'Retired'],
  18: ['extension-eligible', 'Extension eligible'],
  20: ['option-exercised', 'Option exercised'],
  21: ['free-agent', 'Became a free agent'],
  23: ['league-note', 'League note'],
  24: ['all-star', 'All-Star Weekend'],
  25: ['retired-number', 'Number retired'],
  26: ['coach-hired', 'Coach hired'],
  27: ['coach-departed', 'Coach departed'],
  29: ['coach-note', 'Coaching note'],
  30: ['re-signing', 'Re-signed'],
  31: ['roster-note', 'Roster note'],
  32: ['all-star', 'All-Star event'],
  33: ['all-star', 'All-Star Game'],
};
const COACH_TYPES = new Set([26, 27, 29]);

function parseDetail(L: Raw): SeasonDetail {
  const games: Game[] = [];
  (L.season.schedule ?? []).forEach((day: Raw, di: number) => {
    for (const g of day.results ?? []) games.push({
      gid: g.gId, day: di, home: g.homeTeam, away: g.awayTeam, hs: g.homeScore, as: g.awayScore, winner: g.winner,
      potg: g.potg, periods: g.periods, homeRec: [g.homeRecord?.[0] ?? 0, g.homeRecord?.[1] ?? 0],
      awayRec: [g.awayRecord?.[0] ?? 0, g.awayRecord?.[1] ?? 0], type: g.gameType ?? 0,
    });
  });
  const transactions: Transaction[] = [];
  for (const n of L.season.news ?? []) {
    if (n.type === 0) continue;
    const [kind, label] = NEWS_KINDS[n.type] ?? ['unknown', `Event type ${n.type}`];
    const t: Transaction = { day: n.date, phase: n.phase, type: n.type, kind, label, tid: n.tid, pid: n.pid, rating: n.rating };
    if (COACH_TYPES.has(n.type)) { t.coachId = n.pid; t.pid = 0; }
    const d = n.data ?? {};
    if (d.contract && (d.contract.yrs || d.contract.sal)) t.contract = { yrs: d.contract.yrs, sal: d.contract.sal, opt: d.contract.opt };
    if (d.draftPick?.yr) t.pick = { yr: d.draftPick.yr, rd: d.draftPick.rd, pk: d.draftPick.pk, tid: d.draftPick.tid };
    if (d.trade?.teams?.length) {
      t.trade = d.trade.teams.map((side: Raw): TradeSide => ({
        tid: side.tid, value: side.totalValue ?? 0,
        sent: (side.assets ?? []).map((a: Raw) => a.pid ? { pid: a.pid } : { pick: { yr: a.draftPick.yr, rd: a.draftPick.rd, pk: a.draftPick.pk, tid: a.draftPick.tid } as DraftInfo }),
      }));
    }
    if (d.retiredNumber?.pid) t.retiredNumber = { num: d.retiredNumber.num, pid: d.retiredNumber.pid, yr: d.retiredNumber.yr };
    if (n.type === 10 || n.type === 11) t.injury = { gamesOut: d.injury?.gamesOut ?? 0, major: d.injury?.majorSeverity ?? 0, minor: d.injury?.minorSeverity ?? 0 };
    if (n.gid) t.gid = n.gid;
    transactions.push(t);
  }
  const yr = L.season.currentYear;
  const bracket = (L.season.playoffs ?? []).find((p: Raw) => p.yr === yr && p.rounds?.length);
  const complete = !!bracket && bracket.rounds[bracket.rounds.length - 1]?.series?.[0]?.winner > 0;
  return { yr, phase: L.season.phase, complete, games, transactions };
}

export function parseSave(raw: Raw): Extract {
  const L: Raw = raw.seasonLeagues ? raw.seasonLeagues[0] : raw;
  const C: Raw | undefined = raw.seasonLeagues?.[1];
  const collegeTeams: CollegeTeam[] = (C?.teams ?? []).map((t: Raw) => ({ id: t.id, abbr: t.shortName, name: t.name, city: t.city ?? '' }));
  const awardsCatalog: AwardDef[] = (L.awards ?? []).map((a: Raw) => ({ id: a.id, name: a.name, shortName: a.shortName, enabled: !!a.enabled }));
  return {
    snapshotYear: L.season.currentYear, snapshotPhase: L.season.phase,
    buildVersion: L.meta?.buildVersion ?? '', extractedAt: new Date().toISOString(),
    league: {
      name: L.leagueName, shortName: L.shortName, startingYear: L.season.startingYear,
      conferences: L.conferences ?? [], divisions: L.divisions ?? [],
      totalGames: L.season.totalGames, playoffTeams: L.season.playoffTeams,
    },
    awardsCatalog,
    teams: parseTeams(L), playoffs: parsePlayoffs(L), players: parsePlayers(L), coaches: parseCoaches(L),
    records: parseRecords(L), collegeTeams, detail: parseDetail(L),
  };
}
