#!/usr/bin/env node
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const reportPath='reports/security.json';
const runBinding={reportId:process.env.INSTAR_REPORT_ID||null,checkId:process.env.INSTAR_CHECK_ID||null,profile:process.env.INSTAR_PROFILE||null,snapshotFingerprint:process.env.INSTAR_SNAPSHOT_FINGERPRINT||null};
const result=spawnSync('npm',['audit','--json','--omit=dev'],{encoding:'utf8',maxBuffer:16*1024*1024});
let audit;
let parseError=null;
try{audit=JSON.parse(result.stdout||'');}catch{audit={};parseError='npm audit did not return JSON';}
if(result.error)parseError=result.error.message;
const vulnerabilities=audit.metadata?.vulnerabilities||{};
const high=(vulnerabilities.high||0)+(vulnerabilities.critical||0);
const report={schemaVersion:1,...runBinding,kind:'security',tool:'npm-audit',status:!parseError&&result.status===0&&high===0?'PASS':'BLOCK',exitCode:result.status,signal:result.signal,vulnerabilities,parseError,generatedAt:new Date().toISOString(),note:'Project-owned template; replace with the organization approved scanner when required.'};
await mkdir('reports',{recursive:true});
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
if(report.status!=='PASS')process.exitCode=1;
