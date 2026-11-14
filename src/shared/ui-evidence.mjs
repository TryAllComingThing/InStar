const UI_KINDS = new Set(['browser', 'accessibility', 'keyboard']);

const nonEmpty = value => typeof value === 'string' && Boolean(value.trim());
const passing = value => value === 'PASS';

function expectedList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.length || value.some(item => !nonEmpty(item))) {
    throw Error(`${label} must be a non-empty string array`);
  }
  return [...new Set(value.map(item => item.trim()))];
}

function matrixValues(report) {
  const values = [];
  const add = value => {
    if (Array.isArray(value)) values.push(...value);
    else if (nonEmpty(value)) values.push(value.trim());
  };
  add(report.browserMatrix);
  add(report.browsers);
  for (const item of [...(Array.isArray(report.journeys) ? report.journeys : []), ...(Array.isArray(report.results) ? report.results : [])]) {
    if (!item || typeof item !== 'object') continue;
    add(item.browserMatrix);
    add(item.browser);
    add(item.project);
  }
  return [...new Set(values.filter(nonEmpty))];
}

function assertCoverage(actual, expected, kind, label, field) {
  if (!expected.length) return;
  const missing = expected.filter(item => !actual.includes(item));
  if (missing.length) throw Error(`${kind} artifact does not cover configured ${field}: ${missing.join(', ')}: ${label}`);
}

function assertJourney(journey, kind, index) {
  if (!journey || typeof journey !== 'object' || Array.isArray(journey)) {
    throw Error(`${kind} artifact journey ${index} must be an object`);
  }
  if (!nonEmpty(journey.route)) throw Error(`${kind} artifact journey ${index} requires route`);
  if (!passing(journey.status)) throw Error(`${kind} artifact journey ${index} must be PASS`);
}

export function validateUiArtifact(text, kind, label = 'artifact', options = {}) {
  if (!UI_KINDS.has(kind)) return null;
  options ??= {};
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    throw Error(`${kind} artifact must be JSON with tool evidence: ${label}`);
  }
  if (report?.kind !== kind) throw Error(`${kind} artifact must declare kind ${kind}: ${label}`);
  if (report.status !== 'PASS') throw Error(`${kind} artifact must be PASS: ${label}`);
  if (!nonEmpty(report.generatedAt) || !Number.isFinite(Date.parse(report.generatedAt))) {
    throw Error(`${kind} artifact requires a valid generatedAt timestamp: ${label}`);
  }
  const generatedAt=Date.parse(report.generatedAt),maxAgeMs=options.maxAgeMs??24*60*60*1000;
  if(generatedAt>Date.now()+5*60*1000)throw Error(`${kind} artifact generatedAt is in the future: ${label}`);
  if(maxAgeMs>0&&Date.now()-generatedAt>maxAgeMs)throw Error(`${kind} artifact is stale (older than ${maxAgeMs}ms): ${label}`);
  for(const field of ['reportId','checkId','profile','snapshotFingerprint']){
    if(options[field]!==undefined&&report[field]!==options[field])throw Error(`${kind} artifact ${field} does not match this verification run: ${label}`);
  }
  if(options.requireRunBinding===true){
    for(const field of ['reportId','checkId','profile'])if(!nonEmpty(report[field]))throw Error(`${kind} artifact requires ${field} generated for this verification run: ${label}`);
  }
  const expectedRoutes = expectedList(options.routes, 'expected routes');
  const expectedMatrix = expectedList(options.browserMatrix, 'expected browserMatrix');
  for (const field of ['browserMatrix', 'browsers']) {
    if (report[field] !== undefined && (!Array.isArray(report[field]) || report[field].some(item => !nonEmpty(item)))) {
      throw Error(`${kind} artifact ${field} must be a non-empty string array: ${label}`);
    }
  }

  if (kind === 'browser') {
    if (report.tool !== 'playwright' || report.headless !== true || !Array.isArray(report.journeys) || !report.journeys.length) {
      throw Error(`browser artifact must contain non-empty headless Playwright journeys: ${label}`);
    }
    report.journeys.forEach((journey, index) => assertJourney(journey, kind, index));
    const routes=report.journeys.map(journey=>journey.route);
    if(new Set(routes).size!==routes.length)throw Error(`browser artifact journeys must use unique routes: ${label}`);
    assertCoverage([...new Set(routes)], expectedRoutes, kind, label, 'routes');
  }

  if (kind === 'accessibility') {
    if (report.tool !== 'playwright-axe' || report.headless !== true || !Number.isInteger(report.routesScanned) || report.routesScanned < 1) {
      throw Error(`accessibility artifact must contain a headless playwright-axe scan: ${label}`);
    }
    if (!Array.isArray(report.violations) || report.violations.length || !Array.isArray(report.incomplete) || report.incomplete.length) {
      throw Error(`accessibility artifact must have no violations or incomplete results: ${label}`);
    }
    if (!Array.isArray(report.results) || report.results.length !== report.routesScanned) {
      throw Error(`accessibility artifact results must cover routesScanned: ${label}`);
    }
    const resultRoutes=report.results.map(result=>result?.route).filter(nonEmpty);
    if(new Set(resultRoutes).size!==resultRoutes.length)throw Error(`accessibility artifact results must use unique routes: ${label}`);
    report.results.forEach((result, index) => {
      if (!result || !nonEmpty(result.route) || !passing(result.status)) {
        throw Error(`accessibility artifact result ${index} must have route and status PASS: ${label}`);
      }
      if (!Array.isArray(result.violations) || result.violations.length || !Array.isArray(result.incomplete) || result.incomplete.length) {
        throw Error(`accessibility artifact result ${index} must have no violations or incomplete results: ${label}`);
      }
    });
    assertCoverage([...new Set(report.results.map(result => result.route))], expectedRoutes, kind, label, 'routes');
  }

  if (kind === 'keyboard') {
    if (report.tool !== 'playwright' || report.headless !== true || !Array.isArray(report.journeys) || !report.journeys.length) {
      throw Error(`keyboard artifact must contain non-empty headless Playwright journeys: ${label}`);
    }
    const keyboardRoutes=report.journeys.map(journey=>journey?.route).filter(nonEmpty);
    if(new Set(keyboardRoutes).size!==keyboardRoutes.length)throw Error(`keyboard artifact journeys must use unique routes: ${label}`);
    report.journeys.forEach((journey, index) => {
      assertJourney(journey, kind, index);
      if (!Array.isArray(journey.steps) || !journey.steps.length || journey.steps.some(step => !nonEmpty(step))) {
        throw Error(`keyboard artifact journey ${index} requires keyboard steps: ${label}`);
      }
      if (!nonEmpty(journey.expectedFocus) || journey.actualFocus !== journey.expectedFocus) {
        throw Error(`keyboard artifact journey ${index} requires actualFocus === expectedFocus: ${label}`);
      }
    });
    assertCoverage([...new Set(report.journeys.map(journey => journey.route))], expectedRoutes, kind, label, 'routes');
  }
  assertCoverage(matrixValues(report), expectedMatrix, kind, label, 'browserMatrix');
  return report;
}

export function uiArtifactMetadata(report, kind) {
  if (!UI_KINDS.has(kind) || !report) return {};
  const browserMatrix = matrixValues(report);
  if (kind === 'browser' || kind === 'keyboard') {
    return { artifactStatus: report.status, routesScanned: report.journeys.length, browserMatrix, browserVersion: report.browserVersion || null };
  }
  return { artifactStatus: report.status, routesScanned: report.routesScanned, browserMatrix, axeVersion: report.axeVersion || null, browserVersion: report.browserVersion || null };
}
