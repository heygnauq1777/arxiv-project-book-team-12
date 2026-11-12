import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

async function readJsonl(file, key) {
  const bytes = await fs.readFile(file);
  const lines = bytes.toString('utf8').split(/\r?\n/);
  const latest = new Map(); let logRows = 0, malformed = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    logRows++;
    try { const row = JSON.parse(line); latest.set(row[key], row); }
    catch { malformed++; }
  }
  return { logRows, malformed, latest, fileSizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function buildAuditSummary(dataRoot) {
  const root = path.resolve(dataRoot);
  const arxiv = path.join(root, 'arxiv');
  const inputs = {
    metadata: await readJsonl(path.join(arxiv, 'meta.jsonl'), 'arxiv_id'),
    revisions: await readJsonl(path.join(arxiv, 'revisions.jsonl'), 'version_id'),
    sources: await readJsonl(path.join(arxiv, 'sources_log.jsonl'), 'version_id'),
    semantic_scholar: await readJsonl(path.join(root, 's2', 'references.jsonl'), 'arxiv_id'),
  };
  const first = 3156, last = 8155;
  const ids = Array.from({length:last-first+1}, (_,i) => '2601.' + String(first+i).padStart(5,'0'));
  const assigned = new Set(ids), meta = inputs.metadata.latest;
  const missingIds = ids.filter(id => !meta.has(id) || meta.get(id).missing);
  const expectedVersions = new Map();
  for (const id of ids) {
    const row = meta.get(id);
    if (!row || row.missing) continue;
    for (let v=1; v<=Number(row.n_versions); v++) expectedVersions.set(id+'v'+v, id);
  }
  const source = inputs.sources.latest, s2 = inputs.semantic_scholar.latest;
  const countStatuses = map => { const counts={}; for(const row of map.values()) counts[row.status]=(counts[row.status]||0)+1; return counts; };
  const sourceStatuses = countStatuses(source), s2Statuses = countStatuses(s2);
  const okSources = [...source.values()].filter(row=>row.status==='ok');
  const okS2 = [...s2.values()].filter(row=>row.status==='ok');
  const references = okS2.reduce((sum,row)=>sum+Number(row.n_refs||0),0);
  const sourceSeconds = [...source.values()].reduce((sum,row)=>sum+Number(row.seconds||0),0);
  const keptBytes = okSources.reduce((sum,row)=>sum+Number(row.kept_bytes||0),0);
  const auxiliaryPaths = ['arxiv/source_inventory.csv','arxiv/retry_diagnostics.log','s2/crawl.log'].map(name=>path.join(root,name));
  let auxiliaryBytes = 0; const auxiliaryFiles = {};
  for(const file of auxiliaryPaths){try{const stat=await fs.stat(file);auxiliaryBytes+=stat.size;auxiliaryFiles[path.relative(root,file).split(path.sep).join('/')]=stat.size;}catch(error){if(error.code!=='ENOENT')throw error;}}
  const sourceLogBytes=Object.values(inputs).reduce((sum,row)=>sum+row.fileSizeBytes,0);
  const finalDataBytes=keptBytes+sourceLogBytes+auxiliaryBytes;
  const paperSeconds = new Map(ids.map(id=>[id,0]));
  for(const [versionId,row] of source){const id=versionId.replace(/v\d+$/,'');if(paperSeconds.has(id))paperSeconds.set(id,paperSeconds.get(id)+Number(row.seconds||0));}
  const missingSource = [...expectedVersions.keys()].filter(id=>!source.has(id));
  const unexpectedSource = [...source.keys()].filter(id=>!expectedVersions.has(id));
  const summary = {
    schema_version: 1,
    generated_at_utc: new Date().toISOString(),
    source_repository: 'https://github.com/heygnauq1777/arxiv-project-team-12/',
    snapshot_note: 'Snapshot computed from the append-only JSONL files listed below. Rebuild this artifact after source logs change; GitHub Pages uses this committed snapshot and does not access the local corpus.',
    assigned_range: {first:'2601.03156', last:'2601.08155', expected_papers:ids.length},
    inputs: Object.fromEntries(Object.entries(inputs).map(([name,value])=>[name,{log_rows:value.logRows,valid_json_rows:value.logRows-value.malformed,malformed_json_lines:value.malformed,unique_latest_ids:value.latest.size,file_size_bytes:value.fileSizeBytes,sha256:value.sha256}])),
    metadata: {unique_assigned_ids_found:ids.length-missingIds.length,missing_ids:missingIds.length,unexpected_ids:[...meta.keys()].filter(id=>!assigned.has(id)).length,expected_version_count:expectedVersions.size,additional_revisions_beyond_v1:ids.filter(id=>meta.has(id)&&!meta.get(id).missing).reduce((sum,id)=>sum+Math.max(0,Number(meta.get(id).n_versions)-1),0),revision_ids_unique:inputs.revisions.latest.size},
    sources: {unique_latest_versions:source.size,expected_versions:expectedVersions.size,versions_without_status:missingSource.length,unexpected_version_ids:unexpectedSource.length,terminal_status_counts:sourceStatuses,tex_bib_success_count:sourceStatuses.ok||0,tex_bib_success_rate:(sourceStatuses.ok||0)/expectedVersions.size,raw_bytes_mean_ok_versions:okSources.reduce((s,r)=>s+Number(r.raw_bytes||0),0)/okSources.length,raw_bytes_denominator_ok_versions:okSources.length,kept_bytes_mean_ok_versions:okSources.reduce((s,r)=>s+Number(r.kept_bytes||0),0)/okSources.length,kept_bytes_total_ok_versions:okSources.reduce((s,r)=>s+Number(r.kept_bytes||0),0),kept_bytes_denominator_ok_versions:okSources.length,latest_seconds_sum:sourceSeconds,latest_seconds_sum_hours:sourceSeconds/3600,latest_seconds_mean_per_assigned_paper:[...paperSeconds.values()].reduce((s,n)=>s+n,0)/ids.length,latest_seconds_max_for_one_paper:Math.max(...paperSeconds.values()),final_extracted_tex_bib_bytes:keptBytes,inspected_example_2601_03249v1:source.get('2601.03249v1')?{status:source.get('2601.03249v1').status,raw_bytes:source.get('2601.03249v1').raw_bytes,kept_bytes:source.get('2601.03249v1').kept_bytes}:null},
    semantic_scholar: {unique_latest_papers:s2.size,expected_papers:ids.length,unexpected_paper_ids:[...s2.keys()].filter(id=>!assigned.has(id)).length,terminal_status_counts:s2Statuses,success_rate:(s2Statuses.ok||0)/ids.length,ok_response_reference_total:references,mean_references_per_ok_response:references/okS2.length,mean_references_per_assigned_paper:references/ids.length,references_denominator_ok_responses:okS2.length},
    current_data_directory_file_size_bytes:finalDataBytes,
    data_directory_size_components:{extracted_tex_bib_bytes:keptBytes,source_log_bytes:sourceLogBytes,auxiliary_files:auxiliaryFiles,auxiliary_file_bytes:auxiliaryBytes,method:'sum of kept_bytes over latest ok versions, four JSONL sizes, and known inventory/diagnostic logs'},
    checks: {assigned_paper_count_matches:ids.length===5000,metadata_covers_assigned_range:missingIds.length===0&&[...meta.keys()].every(id=>assigned.has(id)),metadata_version_count_matches_expected:expectedVersions.size===7561,revision_count_matches_additional_versions:inputs.revisions.latest.size===ids.filter(id=>meta.has(id)&&!meta.get(id).missing).reduce((sum,id)=>sum+Number(meta.get(id).n_versions)-1,0),source_status_covers_every_expected_version:missingSource.length===0&&unexpectedSource.length===0&&Object.values(sourceStatuses).reduce((sum,n)=>sum+n,0)===source.size,semantic_scholar_covers_assigned_range:s2.size===ids.length&&ids.every(id=>s2.has(id))&&[...s2.keys()].every(id=>assigned.has(id))}
  };
  if(Object.values(summary.checks).some(value=>value!==true)) throw new Error('Audit consistency check failed: '+JSON.stringify(summary.checks));
  return summary;
}
