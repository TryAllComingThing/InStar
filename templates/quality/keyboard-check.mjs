#!/usr/bin/env node
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

const baseUrl=process.env.KEYBOARD_BASE_URL||process.env.A11Y_BASE_URL||'http://127.0.0.1:5173';
const storageState=process.env.KEYBOARD_STORAGE_STATE||process.env.A11Y_STORAGE_STATE||undefined;
const timeout=Number(process.env.KEYBOARD_NAVIGATION_TIMEOUT||30000);
const readySelector=process.env.KEYBOARD_READY_SELECTOR||process.env.A11Y_READY_SELECTOR||null;
const output=process.env.KEYBOARD_OUTPUT||'reports/keyboard.json';
const raw=process.env.KEYBOARD_JOURNEYS||'[]';
const runBinding=()=>({reportId:process.env.INSTAR_REPORT_ID||null,checkId:process.env.INSTAR_CHECK_ID||null,profile:process.env.INSTAR_PROFILE||null,snapshotFingerprint:process.env.INSTAR_SNAPSHOT_FINGERPRINT||null});

async function save(report){
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
function baseReport(extra={}){
 return {schemaVersion:1,...runBinding(),kind:'keyboard',tool:'playwright',headless:true,baseUrl,authenticated:!!storageState,journeys:[],status:'BLOCK',generatedAt:new Date().toISOString(),...extra};
}
let journeys;
try{journeys=JSON.parse(raw);}catch(error){
 await save(baseReport({error:`KEYBOARD_JOURNEYS must be valid JSON: ${error.message}`}));
 console.error('KEYBOARD_JOURNEYS must be valid JSON');
 process.exit(1);
}
if(!Array.isArray(journeys)||!journeys.length||journeys.some(journey=>!journey||typeof journey.route!=='string'||!journey.route.trim()||!Array.isArray(journey.steps)||!journey.steps.length||journey.steps.some(step=>typeof step!=='string'||!step.trim())||typeof journey.expectedFocus!=='string'||!journey.expectedFocus.trim())){
 await save(baseReport({error:'KEYBOARD_JOURNEYS must contain route, keyboard steps and expectedFocus selector'}));
 console.error('KEYBOARD_JOURNEYS must contain route, keyboard steps and expectedFocus selector');
 process.exit(1);
}
let chromium;
try{({chromium}=await import('playwright'));}catch(error){
 await save(baseReport({error:`Playwright is required: ${error.message}`}));
 console.error(`Keyboard dependencies are required: playwright. ${error.message}`);
 process.exit(2);
}
async function focusDescriptor(page){
 return page.evaluate(()=>{
  const element=document.activeElement;
  if(!element||element===document.body)return 'body';
  const id=element.id?`#${CSS.escape(element.id)}`:'';
  const role=element.getAttribute('role');
  const tag=element.tagName.toLowerCase();
  return id||(role?`${tag}[role="${CSS.escape(role)}"]`:tag);
 });
}
let browser;
try{browser=await chromium.launch({headless:true});}catch(error){
 await save(baseReport({error:`Keyboard browser launch failed: ${error.message}`}));
 console.error(`Keyboard browser launch failed: ${error.message}`);
 process.exit(1);
}
const browserVersion=browser.version();
let context;
try{context=await browser.newContext(storageState?{storageState}:{});}catch(error){
 await browser.close().catch(()=>{});
 await save(baseReport({browserVersion,error:`Keyboard browser context setup failed: ${error.message}`}));
 console.error(`Keyboard browser context setup failed: ${error.message}`);
 process.exit(1);
}
const results=[];
try{
 for(const journey of journeys){
  let page;
  try{
   page=await context.newPage();
   await page.goto(new URL(journey.route,baseUrl).toString(),{waitUntil:'domcontentloaded',timeout});
   if(readySelector)await page.waitForSelector(readySelector,{state:'visible',timeout});
   for(const step of journey.steps)await page.keyboard.press(step);
   const expected=page.locator(journey.expectedFocus);
   const matches=await expected.count()===1&&await expected.evaluate(element=>element===document.activeElement);
   const actualFocus=matches?journey.expectedFocus:await focusDescriptor(page);
   results.push({route:journey.route,steps:journey.steps,expectedFocus:journey.expectedFocus,actualFocus,status:matches?'PASS':'FAIL'});
  }catch(error){
   results.push({route:journey.route,steps:journey.steps,expectedFocus:journey.expectedFocus,actualFocus:'unknown',status:'FAIL',error:error.message});
  }finally{if(page)await page.close().catch(()=>{});}
 }
}finally{await context.close().catch(()=>{});await browser.close().catch(()=>{});}
const report=baseReport({browserVersion,journeys:results,status:results.every(result=>result.status==='PASS')?'PASS':'BLOCK'});
await save(report);
if(report.status!=='PASS')process.exitCode=1;
