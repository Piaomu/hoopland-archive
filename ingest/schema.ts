// Normalized shapes produced by parse-save.ts (one Extract per save snapshot)
// and by merge.ts (the merged data/ folder the site reads).

export interface WL { w: number; l: number }

export interface StatLine {
  GP: number; GS: number; MIN: number; // MIN in seconds
  PTS: number; FGM: number; FGA: number; TPM: number; TPA: number; FTM: number; FTA: number;
  REB: number; ORB: number; AST: number; STL: number; BLK: number; TO: number; PF: number;
  PM: number; DD: number; TD: number; POTG: number; W: number; L: number;
}

export interface TeamSeason {
  yr: number;
  GP: number; W: number; L: number;
  home: WL; away: WL; div: WL; conf: WL;
  PTS: number; OPP: number;
  FGM: number; FGA: number; TPM: number; TPA: number; FTM: number; FTA: number;
  REB: number; ORB: number; AST: number; STL: number; BLK: number; TO: number; PF: number;
  strk: number; l10: number[];
  seed: number; round: number; rank: number; pick: number;
  po: WL; fin: WL; seriesWins: number;
}

export interface RetiredNumber { num: number; pid: number; yr: number }

export interface Team {
  id: number; abbr: string; name: string; city: string; logo: string;
  colors: string[]; division: number; conference: number;
  firstYear: number; titles: number[]; retiredNumbers: RetiredNumber[];
  seasons: TeamSeason[];
}

export interface Series { top: number; low: number; winner: number; games: number; firstTo: number }
export interface PlayoffYear { yr: number; rounds: Series[][] }

export interface AwardWon { id: number; years: number[] }
export interface DraftInfo { yr: number; rd: number; pk: number; tid: number }
export interface Injury { yr: number; age: number; gamesOut: number; major: number; minor: number }

export interface PlayerSeason {
  yr: number; sal: number;
  rows: (StatLine & { tid: number })[];
  po: (StatLine & { tid: number })[];
  fin: (StatLine & { tid: number })[];
}

export interface Player {
  id: number; fn: string; ln: string; ctry: string; pos: number; ht: number; wt: number; num: number;
  age: number; arc: string; status: number; tid: number;
  draft: DraftInfo | null; collegeTid: number; yearRetired: number; hofYear: number; causeOfDeath: number;
  awards: AwardWon[]; seasons: PlayerSeason[]; college: PlayerSeason[];
  highs: Partial<StatLine>; injuries: Injury[];
  recoveredFrom?: number; // snapshot year this player was recovered from (purged in newer saves)
}

export interface CoachTenure { yr: number; tid: number; W: number; L: number; rank: number; round: number; po: WL; fin: WL }
export interface Coach {
  id: number; fn: string; ln: string; ctry: string; age: number; tid: number; status: number;
  yearRetired: number; awards: AwardWon[]; tenures: CoachTenure[];
}

export interface RecordEntry { pid: number; tid: number; value: number; yr: number; game: { home: number; away: number; hs: number; as: number } | null }
export type RecordsBook = Record<'season' | 'playoffs' | 'finals', Record<string, RecordEntry[]>>;

export interface AwardDef { id: number; name: string; shortName: string; enabled: boolean }

export interface Game {
  gid: number; day: number; home: number; away: number; hs: number; as: number; winner: number; potg: number;
  periods: number; homeRec: [number, number]; awayRec: [number, number]; type: number;
}

export interface TradeSide { tid: number; sent: { pid?: number; pick?: DraftInfo }[]; value: number }

export interface Transaction {
  day: number; phase: number; type: number; kind: string; label: string;
  tid: number; pid: number; coachId?: number;
  contract?: { yrs: number; sal: number; opt: number };
  pick?: DraftInfo; trade?: TradeSide[]; retiredNumber?: RetiredNumber;
  injury?: { gamesOut: number; major: number; minor: number }; gid?: number; rating: number;
}

export interface SeasonDetail {
  yr: number; phase: number; complete: boolean;
  games: Game[]; transactions: Transaction[];
}

export interface CollegeTeam { id: number; abbr: string; name: string; city: string }

export interface Extract {
  snapshotYear: number; snapshotPhase: number; buildVersion: string; extractedAt: string;
  league: { name: string; shortName: string; startingYear: number; conferences: string[]; divisions: string[]; totalGames: number; playoffTeams: number };
  awardsCatalog: AwardDef[];
  teams: Team[]; playoffs: PlayoffYear[]; players: Player[]; coaches: Coach[];
  records: RecordsBook; collegeTeams: CollegeTeam[];
  detail: SeasonDetail;
}
