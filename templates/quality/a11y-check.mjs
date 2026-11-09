#!/usr/bin/env node
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

const baseUrl=process.env.A11Y_BASE_URL||'http://127.0.0.1:5173';
const routes=(process.env.A11Y_ROUTES||'/').split(',').map(value=>value.trim()).filter(Boolean);
const storageState=process.env.A11Y_STORAGE_STATE||undefined;
const timeout=Number(process.env.A11Y_NAVIGATION_TIMEOUT||30000);
const readySelector=process.env.A11Y_READY_SELECTOR||null;
const output=process.env.A11Y_OUTPUT||'reports/accessibility.json';
async function save(report){
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
if(!routes.length){
 await save({schemaVersion:1,kind:'accessibility',tool:'playwright-axe',axeVersion:null,browserVersion:null,baseUrl,routes,routesScanned:0,authenticated:!!storageState,status:'BLOCK',error:'A11Y_ROUTES must contain at least one route',violations:[],incomplete:[],results:[],generatedAt:new Date().toISOString()});
 console.error('A11Y_ROUTES must contain at least one route');
 process.exit(1);
}
let chromium,axeBuilder;
try{
 const playwright=await import('playwright');chromium=playwright.chromium;
 ({default:axeBuilder}=await import('@axe-core/playwright'));
}catch(error){
 console.error(`Accessibility dependencies are required: playwright and @axe-core/playwright. ${error.message}`);
 await save({schemaVersion:1,kind:'accessibility',tool:'playwright-axe',baseUrl,routes,authenticated:!!storageState,status:'BLOCK',error:`Accessibility dependencies unavailable: ${error.message}`,violations:[],incomplete:[],results:[],generatedAt:new Date().toISOString()});
 process.exit(2);
}
const browser=await chromium.launch({headless:true});
const browserVersion=browser.version();
const context=await browser.newContext(storageState?{storageState}:{});
const results=[];let axeVersion=null;
try{
 for(const route of routes){
  const page=await context.newPage();
  try{
   const requested=new URL(route,baseUrl);
   await page.goto(requested.toString(),{waitUntil:'domcontentloaded',timeout});
   if(readySelector)await page.waitForSelector(readySelector,{state:'visible',timeout});
   await page.waitForFunction(()=>document.readyState==='complete',null,{timeout});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const finalUrl=new URL(page.url());
   if(requested.pathname!=='/login'&&/\/login\/?$/.test(finalUrl.pathname)){
    results.push({route,requested:requested.toString(),finalUrl:finalUrl.toString(),violations:[{id:'auth-redirect',impact:'critical',nodes:1,help:'Authenticated route redirected to login; provide A11Y_STORAGE_STATE or start the required session'}],incomplete:[],passes:0});
    continue;
   }
   const result=await new axeBuilder({page}).analyze();
   axeVersion=result.testEngine?.version||axeVersion;
   results.push({route,requested:requested.toString(),finalUrl:finalUrl.toString(),violations:result.violations.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length,help:item.help,targets:item.nodes.map(node=>node.target),failureSummaries:item.nodes.map(node=>node.failureSummary)})),incomplete:result.incomplete.map(item=>({id:item.id,impact:item.impact,nodes:item.nodes.length,help:item.help,targets:item.nodes.map(node=>node.target)})),passes:result.passes.length});
  }catch(error){
   results.push({route,violations:[{id:'navigation-or-scan-error',impact:'critical',nodes:1,help:error.message}],incomplete:[],passes:0});
  }finally{await page.close().catch(()=>{});}
 }
}finally{await context.close();await browser.close();}
const violations=results.flatMap(result=>result.violations);
const incomplete=results.flatMap(result=>result.incomplete||[]);
const report={schemaVersion:1,kind:'accessibility',tool:'playwright-axe',axeVersion,browserVersion,baseUrl,routes,routesScanned:results.length,authenticated:!!storageState,status:violations.length||incomplete.length?'BLOCK':'PASS',violations,incomplete,results,generatedAt:new Date().toISOString()};
await save(report);
if(report.status!=='PASS')process.exitCode=1;
