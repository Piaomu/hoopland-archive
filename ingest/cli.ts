// CLI for the archive pipeline.
//   ingest <file>   parse one save file, store snapshot + extract, rebuild data/
//   inbox           ingest every file waiting in the OneDrive inbox, then rebuild
//   rebuild         rebuild data/ from stored extracts only
//   watch           poll the inbox forever and ingest whatever lands there

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
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

// status: machine-readable view of the inbox for an automation (OpenClaw heartbeat) to act on.
function status(): { pending: { file: string; mb: number; stable: boolean; ageMinutes: number }[]; snapshots: number[] } {
  const files = fs.existsSync(cfg.inbox) ? fs.readdirSync(cfg.inbox).map((f) => path.join(cfg.inbox, f)).filter((f) => fs.statSync(f).isFile()) : [];
  const pending = files.map((f) => {
    const st = fs.statSync(f);
    return { file: path.basename(f), mb: +(st.size / 1e6).toFixed(1), stable: st.size > 1000 && Date.now() - st.mtimeMs > 5000, ageMinutes: Math.round((Date.now() - st.mtimeMs) / 60000) };
  });
  const snapshots = fs.existsSync(cfg.snapshots) ? fs.readdirSync(cfg.snapshots).map((f) => Number(f.match(/_(\d{4})\.json/)?.[1])).filter(Boolean).sort((a, b) => a - b) : [];
  return { pending, snapshots };
}

// publish: ingest the inbox, commit the merged data, push, and report the deploy. Used after the user says yes.
function sh(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim().slice(0, 500)}`);
  return (r.stdout || '').trim();
}
function publish() {
  const before = status();
  if (!before.pending.length) { log('nothing to publish: inbox is empty'); return; }
  const unstable = before.pending.filter((p) => !p.stable);
  if (unstable.length) { log(`waiting: ${unstable.map((p) => p.file).join(', ')} still syncing`); return; }
  const n = processInbox();
  const after = status();
  const added = after.snapshots.filter((y) => !before.snapshots.includes(y));
  sh('git', ['add', 'data']);
  const changed = sh('git', ['status', '--porcelain', 'data']);
  if (!changed) { log(`ingested ${n} file(s) but data/ is unchanged; nothing to push`); return; }
  const label = added.length ? `Add ${added.join(', ')} season snapshot${added.length > 1 ? 's' : ''}` : 'Refresh season snapshot data';
  sh('git', ['commit', '-q', '-m', label]);
  sh('git', ['push', '-q', 'origin', 'main']);
  log(`pushed: ${label}`);
  try {
    const runs = JSON.parse(sh('gh', ['run', 'list', '--limit', '1', '--json', 'databaseId,url']));
    if (runs[0]) { log(`deploy started: ${runs[0].url}`); sh('gh', ['run', 'watch', String(runs[0].databaseId), '--exit-status', '--interval', '10']); log('deploy finished'); }
  } catch (e) { log(`deploy status unavailable: ${(e as Error).message.split('\n')[0]}`); }
  const site = 'https://piaomu.github.io/hoopland-archive/';
  log(`live: ${site}${added.length ? ` (new: ${added.map((y) => `${site}seasons/${y}/`).join(' ')})` : ''}`);
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
  case 'ingest': { if (!arg) throw new Error('usage: ingest <file>'); ingestFile(path.resolve(arg)); rebuild(); break; }
  case 'inbox': { const n = processInbox(); log(n ? `ingested ${n} file(s)` : 'inbox empty'); break; }
  case 'status': { const s = status(); console.log(JSON.stringify(s)); break; }
  case 'publish': publish(); break;
  case 'rebuild': rebuild(); break;
  case 'watch': {
    log(`watching ${cfg.inbox} every ${cfg.watchIntervalSeconds}s`);
    const tick = () => { try { processInbox(); } catch (e) { log('error', (e as Error).message); } };
    tick(); setInterval(tick, cfg.watchIntervalSeconds * 1000); break;
  }
  default: console.log('usage: cli.ts ingest <file> | inbox | rebuild | watch'); process.exit(1);
}
