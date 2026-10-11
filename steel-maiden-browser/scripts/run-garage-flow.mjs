// Temporary CLI orchestration only. No GUI, no remote writes, no archive mutation.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const run = (program, args) => JSON.parse(execFileSync(program, args, {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60 * 1000,
  windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'],
}));
const args = process.argv.slice(2);
const offline = args[0] === '--from-capture';
if (offline && args.length !== 2) throw new Error('--from-capture requires exactly one existing capture file');
process.stderr.write(offline ? 'Replaying an existing private capture; no device access.\n' : 'Reading garage and technology twice; keep game idle. No game actions or imports will be performed.\n');
const capture = offline ? { capture: { output: args[1] } } : run('python', ['-X', 'utf8', 'analysis_apk/tools/probe_player_garage.py', '--capture', '--globals', ...args]);
process.stderr.write('Decoding equipment/colonization/magic and calculating with the existing evaluator.\n');
const decoded = run(process.execPath, ['--experimental-strip-types', 'steel-maiden-browser/scripts/decode-garage-capture.mjs', capture.capture.output]);
const exported = run(process.execPath, ['--experimental-strip-types', 'steel-maiden-browser/scripts/export-garage-snapshot.mjs', decoded.output]);
console.log(JSON.stringify({ capture: capture.capture.output, decoded: decoded.output, ...exported }, null, 2));
