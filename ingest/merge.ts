// Merge every per-snapshot Extract into the data/ folder the site builds from.
//
// Rules:
//  - Cross-year facts (team ledgers, brackets, awards, records, coaches) come from the newest snapshot,
//    because the game carries them forward.
//  - Per-year facts (transactions, game log) come only from the snapshot taken during that year.
//  - Players are unioned across snapshots: older snapshots recover retirees the game later purged.

import fs from 'node:fs';
import path from 'node:path';
import type { Extract, Player, PlayerSeason, StatLine, Team, TeamSeason, SeasonDetail, Coach } from './schema.js';

export interface SeasonAward { id: number; pid: number; tid: number }
export interface Leader { pid: number; tid: number; value: number; GP: number }
export interface SeasonFile {
  yr: number; complete: boolean; hasDetail: boolean; champion: number; runnerUp: number;
  standings: (TeamSeason & { tid: number })[];
  bracket: Extract['playoffs'][number] | null;
  awards: SeasonAward[];
  leaders: Record<string, Leader[]>;
  draft: { pk: number; rd: number; pid: number; tid: number }[];
  retirements: number[]; hof: number[];
  retiredNumbers: { tid: number; num: number; pid: number }[];
  coaches: { id: number; tid: number; W: number; L: number }[];
  detail: SeasonDetail | null;
}

const STAT_KEYS: (keyof StatLine)[] = ['GP','GS','MIN','PTS','FGM','FGA','TPM','TPA','FTM','FTA','REB','ORB','AST','STL','BLK','TO','PF','PM','DD','TD','POTG','W','L'];

export function sumRows(rows: StatLine[]): StatLine {
  const out = Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as unknown as StatLine;
  for (const r of rows) for (const k of STAT_KEYS) (out as any)[k] += r[k] ?? 0;
  return out;
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function loadExtracts(dir: string): Extract[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Extract)
    .sort((a, b) => b.snapshotYear - a.snapshotYear || b.snapshotPhase - a.snapshotPhase);
}

function mergePlayers(extracts: Extract[]): Player[] {
  const byId = new Map<number, Player>();
  for (const p of extracts[0].players) byId.set(p.id, p);
  for (const ex of extracts.slice(1)) for (const p of ex.players) {
    if (!byId.has(p.id)) byId.set(p.id, { ...p, recoveredFrom: ex.snapshotYear });
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

function buildSeason(yr: number, base: Extract, players: Player[], detail: SeasonDetail | null): SeasonFile {
  const standings = base.teams.flatMap((t) => {
    const s = t.seasons.find((x) => x.yr === yr);
    return s ? [{ tid: t.id, ...s }] : [];
  }).sort((a, b) => (b.W / Math.max(1, b.W + b.L)) - (a.W / Math.max(1, a.W + a.L)) || b.W - a.W);
  const bracket = base.playoffs.find((p) => p.yr === yr && p.rounds.length) ?? null;
  const finalSeries = bracket?.rounds[bracket.rounds.length - 1]?.[0];
  const champion = finalSeries?.winner ?? 0;
  const runnerUp = finalSeries ? (finalSeries.winner === finalSeries.top ? finalSeries.low : finalSeries.top) : 0;
  const complete = champion > 0;

  const awards: SeasonAward[] = [];
  const draft: SeasonFile['draft'] = [];
  const retirements: number[] = []; const hof: number[] = [];
  const totals: { pid: number; tid: number; line: StatLine }[] = [];
  for (const p of players) {
    for (const a of p.awards) if (a.years.includes(yr)) {
      const row = p.seasons.find((s) => s.yr === yr)?.rows.at(-1);
      awards.push({ id: a.id, pid: p.id, tid: row?.tid ?? p.tid });
    }
    if (p.draft?.yr === yr) draft.push({ pk: p.draft.pk, rd: p.draft.rd, pid: p.id, tid: p.draft.tid });
    if (p.yearRetired === yr) retirements.push(p.id);
    if (p.hofYear === yr) hof.push(p.id);
    const s = p.seasons.find((x) => x.yr === yr);
    if (s && s.rows.length) totals.push({ pid: p.id, tid: s.rows.at(-1)!.tid, line: sumRows(s.rows) });
  }
  draft.sort((a, b) => a.rd - b.rd || a.pk - b.pk);
  awards.sort((a, b) => a.id - b.id);

  const maxGP = Math.max(1, ...standings.map((s) => s.GP));
  const minGP = Math.ceil(maxGP * 0.6);
  const leaders: Record<string, Leader[]> = {};
  const perGame = (k: keyof StatLine) => totals.filter((t) => t.line.GP >= minGP)
    .map((t) => ({ pid: t.pid, tid: t.tid, value: t.line[k] / t.line.GP, GP: t.line.GP }))
    .sort((a, b) => b.value - a.value).slice(0, 10);
  for (const k of ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TPM'] as const) leaders[k] = perGame(k);
  leaders.FGP = totals.filter((t) => t.line.GP >= minGP && t.line.FGA >= 5 * t.line.GP)
    .map((t) => ({ pid: t.pid, tid: t.tid, value: t.line.FGM / t.line.FGA, GP: t.line.GP })).sort((a, b) => b.value - a.value).slice(0, 10);
  leaders.TPP = totals.filter((t) => t.line.GP >= minGP && t.line.TPA >= 2 * t.line.GP)
    .map((t) => ({ pid: t.pid, tid: t.tid, value: t.line.TPM / t.line.TPA, GP: t.line.GP })).sort((a, b) => b.value - a.value).slice(0, 10);

  const retiredNumbers = base.teams.flatMap((t) => t.retiredNumbers.filter((r) => r.yr === yr).map((r) => ({ tid: t.id, num: r.num, pid: r.pid })));
  const coaches = base.coaches.flatMap((c) => c.tenures.filter((t) => t.yr === yr).map((t) => ({ id: c.id, tid: t.tid, W: t.W, L: t.L })));

  return { yr, complete, hasDetail: !!detail, champion, runnerUp, standings, bracket, awards, leaders, draft, retirements, hof, retiredNumbers, coaches, detail };
}

export function mergeAll(extractsDir: string, dataDir: string): { years: number[]; snapshots: number[] } {
  const extracts = loadExtracts(extractsDir);
  if (!extracts.length) throw new Error(`No extracts found in ${extractsDir}`);
  const base = extracts[0];
  const players = mergePlayers(extracts);
  const detailByYear = new Map<number, SeasonDetail>();
  for (const ex of extracts) if (!detailByYear.has(ex.detail.yr)) detailByYear.set(ex.detail.yr, ex.detail);

  fs.rmSync(path.join(dataDir, 'seasons'), { recursive: true, force: true });
  const years: number[] = [];
  const champions: { yr: number; tid: number; runnerUp: number; w: number; l: number }[] = [];
  for (let yr = base.league.startingYear; yr <= base.snapshotYear; yr++) {
    const season = buildSeason(yr, base, players, detailByYear.get(yr) ?? null);
    writeJson(path.join(dataDir, 'seasons', `${yr}.json`), season);
    years.push(yr);
    if (season.complete && season.bracket) {
      const f = season.bracket.rounds.at(-1)![0];
      champions.push({ yr, tid: season.champion, runnerUp: season.runnerUp, w: f.firstTo, l: f.games - f.firstTo });
    }
  }

  const teams: Team[] = base.teams.map((t) => ({ ...t, titles: champions.filter((c) => c.tid === t.id).map((c) => c.yr) }));
  writeJson(path.join(dataDir, 'teams.json'), teams);
  writeJson(path.join(dataDir, 'players.json'), players);
  writeJson(path.join(dataDir, 'players-index.json'), players.map((p) => {
    const yrs = p.seasons.map((s) => s.yr);
    const tids = [...new Set(p.seasons.flatMap((s) => s.rows.map((r) => r.tid)))];
    const career = sumRows(p.seasons.flatMap((s) => s.rows));
    return { id: p.id, fn: p.fn, ln: p.ln, pos: p.pos, from: yrs[0] ?? 0, to: yrs.at(-1) ?? 0, tids, hof: p.hofYear > 0,
      GP: career.GP, PTS: career.PTS, REB: career.REB, AST: career.AST, awards: p.awards.reduce((n, a) => n + a.years.length, 0) };
  }));
  writeJson(path.join(dataDir, 'coaches.json'), base.coaches);
  writeJson(path.join(dataDir, 'records.json'), base.records);
  writeJson(path.join(dataDir, 'league.json'), {
    name: base.league.name, shortName: base.league.shortName, startingYear: base.league.startingYear,
    currentYear: base.snapshotYear, currentPhase: base.snapshotPhase, buildVersion: base.buildVersion,
    conferences: base.league.conferences, divisions: base.league.divisions,
    totalGames: base.league.totalGames, playoffTeams: base.league.playoffTeams,
    awardsCatalog: base.awardsCatalog, collegeTeams: base.collegeTeams,
    champions, years, snapshots: extracts.map((e) => e.snapshotYear).sort((a, b) => a - b),
    playerCount: players.length, recoveredPlayers: players.filter((p) => p.recoveredFrom).length,
    generatedAt: new Date().toISOString(),
  });
  return { years, snapshots: extracts.map((e) => e.snapshotYear) };
}
