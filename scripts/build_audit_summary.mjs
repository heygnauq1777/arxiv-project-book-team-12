import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildAuditSummary } from './audit_summary_lib.mjs';
const [dataRoot, output='data/audit_summary.json'] = process.argv.slice(2);
if (!dataRoot) { console.error('Usage: node scripts/build_audit_summary.mjs <source-repo-data-dir> [output-json]'); process.exit(2); }
const summary = await buildAuditSummary(dataRoot);
const target = path.resolve(output);
await fs.mkdir(path.dirname(target), {recursive:true});
await fs.writeFile(target, JSON.stringify(summary,null,2), 'utf8');
console.log(JSON.stringify({output:target, generated_at_utc:summary.generated_at_utc, checks:summary.checks},null,2));
