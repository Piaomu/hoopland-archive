// Build-time data access for the site. Everything is read from data/ (produced by the ingester)
// and filtered by site.config.json's publishedThroughYear so unreleased seasons never render.

import fs from 'node:fs';
import path from 'node:path';
import type { Team, Player, Coach, RecordsBook, StatLine, PlayerSeason } from '../../ingest/schema.js';
import type { SeasonFile } from '../../ingest/merge.js';

const root = process.cwd();
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')) as T;

export interface SiteConfig { siteName: string; tagline: string; publishedThroughYear: number; episodes: Record<string, { title: string; url: string }> }
export const siteConfig = JSON.parse(fs.readFileSync(path.join(root, 'site.config.json'), 'utf8')) as SiteConfig;

export interface League {
  name: string; shortName: string; startingYear: number; currentYear: number; currentPhase: number;
  conferences: string[]; divisions: string[]; totalGames: number; playoffTeams: number;
  awardsCatalog: { id: number; name: string; shortName: string; enabled: boolean }[];
  collegeTeams: { id: number; abbr: string; name: string; city: string }[];
  champions: { yr: number; tid: number; runnerUp: number; w: number; l: number }[];
  years: number[]; snapshots: number[]; playerCount: number; recoveredPlayers: number; generatedAt: string;
}
export const league = read<League>('league.json');
export const PUB = Math.min(siteConfig.publishedThroughYear, league.currentYear);
export const years = league.years.filter((y) => y <= PUB);
export const champions = league.champions.filter((c) => c.yr <= PUB);

const overridesPath = path.join(root, 'team-overrides.json');
const overrides: Record<string, Partial<Pick<Team, 'city' | 'name' | 'colors'>>> = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
export const teams = read<Team[]>('teams.json').map((t) => ({ ...t, ...(overrides[t.abbr] ?? {}), seasons: t.seasons.filter((s) => s.yr <= PUB), titles: t.titles.filter((y) => y <= PUB), retiredNumbers: t.retiredNumbers.filter((r) => r.yr <= PUB) }))
  .filter((t) => t.firstYear <= PUB);
const teamMap = new Map(teams.map((t) => [t.id, t]));

export const players = read<Player[]>('players.json')
  .map((p) => ({ ...p, seasons: p.seasons.filter((s) => s.yr <= PUB), awards: p.awards.map((a) => ({ id: a.id, years: a.years.filter((y) => y <= PUB) })).filter((a) => a.years.length),
    yearRetired: p.yearRetired > PUB ? 0 : p.yearRetired, hofYear: p.hofYear > PUB ? 0 : p.hofYear, draft: p.draft && p.draft.yr > PUB ? null : p.draft }))
  .filter((p) => p.seasons.length || (p.draft && p.draft.yr <= PUB) || p.college.length);
const playerMap = new Map(players.map((p) => [p.id, p]));

export interface PlayerIndexRow { id: number; fn: string; ln: string; pos: number; from: number; to: number; tids: number[]; hof: boolean; GP: number; PTS: number; REB: number; AST: number; awards: number }
export const playersIndex = read<PlayerIndexRow[]>('players-index.json').filter((r) => playerMap.has(r.id) && r.from <= PUB)
  .map((r) => ({ ...r, to: Math.min(r.to, PUB), hof: (playerMap.get(r.id)?.hofYear ?? 0) > 0 }));

export const coaches = read<Coach[]>('coaches.json').map((c) => ({ ...c, tenures: c.tenures.filter((t) => t.yr <= PUB) })).filter((c) => c.tenures.length);
const coachMap = new Map(coaches.map((c) => [c.id, c]));

export const records = read<RecordsBook>('records.json');
for (const scope of Object.values(records)) for (const k of Object.keys(scope)) scope[k] = scope[k].filter((r) => r.yr <= PUB);

export const season = (yr: number): SeasonFile => read<SeasonFile>(`seasons/${yr}.json`);

// ---- lookups ----
export const team = (id: number) => teamMap.get(id);
export const player = (id: number) => playerMap.get(id);
export const coach = (id: number) => coachMap.get(id);
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
// City is often blank in the save; the built-in logo slug ("atlanta") is a usable fallback, a custom logo URL is not.
export const teamCity = (t: Team) => t.city || (/^[a-z]+$/.test(t.logo) ? cap(t.logo) : '');
export const teamName = (id: number) => { const t = teamMap.get(id); return t ? `${teamCity(t)} ${t.name}`.trim() : `Team ${id}`; };
export const teamAbbr = (id: number) => teamMap.get(id)?.abbr ?? `T${id}`;
export const playerName = (id: number) => { const p = playerMap.get(id); return p ? `${p.fn} ${p.ln}` : `Unknown player`; };
export const coachName = (id: number) => { const c = coachMap.get(id); return c ? `${c.fn} ${c.ln}` : `Unknown coach`; };
export const collegeName = (tid: number) => { const c = league.collegeTeams.find((x) => x.id === tid); return c ? `${c.city || c.abbr} ${c.name}` : ''; };
export const POS = ['', 'PG', 'SG', 'SF', 'PF', 'C'];
export const posName = (p: number) => POS[p] ?? '';
export const awardName = (id: number) => league.awardsCatalog.find((a) => a.id === id)?.name ?? `Award ${id}`;
export const PHASES: Record<number, string> = { 1: 'Preseason', 2: 'Offseason', 4: 'Draft', 6: 'Free agency', 9: 'Regular season', 10: 'Playoffs', 11: 'Finals', 12: 'Season end' };
export const phaseName = (p: number) => PHASES[p] ?? `Phase ${p}`;
export const CAUSES = ['', 'natural causes', 'illness', 'heart failure', 'accident', 'complications', 'a long illness', 'natural causes', 'natural causes', 'illness', 'an accident'];

// ---- formatting ----
export const pct = (w: number, l: number) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '.000');
export const fmtPct = (v: number) => (isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '—');
export const f1 = (v: number) => (isFinite(v) ? v.toFixed(1) : '—');
export const pg = (line: StatLine, k: keyof StatLine) => (line.GP ? line[k] / line.GP : 0);
export const mpg = (line: StatLine) => (line.GP ? line.MIN / 60 / line.GP : 0);
export const height = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;
export const sumRows = (rows: StatLine[]): StatLine => {
  const keys: (keyof StatLine)[] = ['GP','GS','MIN','PTS','FGM','FGA','TPM','TPA','FTM','FTA','REB','ORB','AST','STL','BLK','TO','PF','PM','DD','TD','POTG','W','L'];
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as unknown as StatLine;
  for (const r of rows) for (const k of keys) (out as any)[k] += r[k] ?? 0;
  return out;
};
export const seasonRows = (s: PlayerSeason) => s.rows;

export function resultLabel(yr: number, tid: number, round: number): string {
  const c = league.champions.find((x) => x.yr === yr);
  if (c?.tid === tid) return 'Won Finals';
  if (c?.runnerUp === tid) return 'Lost Finals';
  if (round <= 0) return yr === league.currentYear && !c ? 'In progress' : 'Missed playoffs';
  const names: Record<number, string> = { 1: 'Lost 1st round', 2: 'Lost 2nd round', 3: 'Lost conf. finals', 4: 'Lost Finals' };
  return names[round] ?? `Lost round ${round}`;
}

// Roster index: every player who logged a regular-season or playoff row for a team in a year.
export interface RosterEntry { p: Player; rows: (StatLine & { tid: number })[]; po: (StatLine & { tid: number })[]; fin: (StatLine & { tid: number })[]; moved: boolean }
const rosterIdx = new Map<string, RosterEntry[]>();
for (const p of players) for (const s of p.seasons) {
  const tids = new Set([...s.rows.map((r) => r.tid), ...s.po.map((r) => r.tid)]);
  for (const tid of tids) {
    const k = `${tid}-${s.yr}`;
    if (!rosterIdx.has(k)) rosterIdx.set(k, []);
    rosterIdx.get(k)!.push({ p, rows: s.rows.filter((r) => r.tid === tid), po: s.po.filter((r) => r.tid === tid), fin: s.fin.filter((r) => r.tid === tid), moved: s.rows.length > 1 });
  }
}
export const roster = (tid: number, yr: number): RosterEntry[] => rosterIdx.get(`${tid}-${yr}`) ?? [];
export const teamSeasonUrl = (tid: number, yr: number) => url(`/teams/${teamAbbr(tid)}/${yr}/`);

// Player's team in a given year (last row of that season), for linking.
export const playerTeamIn = (p: Player, yr: number) => p.seasons.find((s) => s.yr === yr)?.rows.at(-1)?.tid ?? p.tid;

export const url = (p: string) => (import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + p.replace(/^\//, ''));
