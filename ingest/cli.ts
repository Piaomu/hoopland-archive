// CLI for the archive pipeline.
//   ingest <file>   parse one save file, store snapshot + extract, rebuild data/
//   inbox           ingest every file waiting in the OneDrive inbox, then rebuild
//   rebuild         rebuild data/ from stored extracts only
//   watch           poll the inbox forever and ingest whatever lands there

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseSave } from './parse-save.js';
import { mergeAll } from './merge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'archive.config.json'), 'utf8')) as {
  inbox: string; snapshots: string; extracts: string; data: string; watchIntervalSeconds: number;
};
const dataDir = path.resolve(root, cfg.data);
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

function readSave(file: string): unknown {
  let buf = fs.readFileSync(file);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  return JSON.parse(buf.toString('utf8'));
}

export function ingestFile(file: string): number {
  log(`parsing ${path.basename(file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
  const raw = readSave(file);
  const extract = parseSave(raw);
  const tag = `${extract.league.shortName}_${extract.snapshotYear}`;
  fs.mkdirSync(cfg.snapshots, { recursive: true });
  fs.mkdirSync(cfg.extracts, { recursive: true });
  const snapPath = path.join(cfg.snapshots, `${tag}.json.gz`);
  if (fs.existsSync(snapPath)) log(`replacing existing snapshot for ${extract.snapshotYear}`);
  fs.writeFileSync(snapPath, zlib.gzipSync(JSON.stringify(raw), { level: 6 }));
  fs.writeFileSync(path.join(cfg.extracts, `${tag}.json`), JSON.stringify(extract));
  log(`stored ${tag}: ${extract.teams.length} teams, ${extract.players.length} players, ${extract.detail.games.length} games, ${extract.detail.transactions.length} feed items`);
  return extract.snapshotYear;
}

function rebuild() {
  const r = mergeAll(cfg.extracts, dataDir);
  log(`data rebuilt: ${r.years.length} seasons, snapshots for ${r.snapshots.sort((a, b) => a - b).join(', ')}`);
}

function stableFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => path.join(dir, f)).filter((f) => {
    const st = fs.statSync(f);
    return st.isFile() && st.size > 1000 && Date.now() - st.mtimeMs > 5000; // skip files still being copied
  });
}

function processInbox(): number {
  const files = stableFiles(cfg.inbox);
  for (const f of files) {
    try {
      ingestFile(f);
      fs.rmSync(f);
    } catch (e) {
      log(`FAILED ${path.basename(f)}: ${(e as Error).message}`);
      const failed = path.join(cfg.inbox, 'failed'); fs.mkdirSync(failed, { recursive: true });
      fs.renameSync(f, path.join(failed, path.basename(f)));
    }
  }
  if (files.length) rebuild();
  return files.length;
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'ingest': { if (!arg) throw new Error('usage: ingest <file>'); ingestFile(path.resolve(arg)); rebuild(); break; }
  case 'inbox': { const n = processInbox(); log(n ? `ingested ${n} file(s)` : 'inbox empty'); break; }
  case 'rebuild': rebuild(); break;
  case 'watch': {
    log(`watching ${cfg.inbox} every ${cfg.watchIntervalSeconds}s`);
    const tick = () => { try { processInbox(); } catch (e) { log('error', (e as Error).message); } };
    tick(); setInterval(tick, cfg.watchIntervalSeconds * 1000); break;
  }
  default: console.log('usage: cli.ts ingest <file> | inbox | rebuild | watch'); process.exit(1);
}
