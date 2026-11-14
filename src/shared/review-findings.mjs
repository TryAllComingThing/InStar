const SEVERITIES = Object.freeze(['critical', 'warning', 'suggestion']);
const DISPOSITIONS = Object.freeze(['accepted', 'mitigated', 'deferred']);
const DISPOSITION_FIELDS = new Set(['decision', 'reason', 'owner', 'expiresAt']);

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw Error(`${label} must be a nonempty string`);
  return value.trim();
}

export function validateFindingDisposition(disposition, label = 'finding.disposition') {
  if (!disposition || typeof disposition !== 'object' || Array.isArray(disposition)) throw Error(`${label} must be an object`);
  const unknown = Object.keys(disposition).filter(key => !DISPOSITION_FIELDS.has(key));
  if (unknown.length) throw Error(`${label} contains unknown fields: ${unknown.join(', ')}`);
  if (!DISPOSITIONS.includes(disposition.decision)) throw Error(`${label}.decision must be ${DISPOSITIONS.join(', ')}`);
  requireText(disposition.reason, `${label}.reason`);
  requireText(disposition.owner, `${label}.owner`);
  requireText(disposition.expiresAt, `${label}.expiresAt`);
  const expiresAt = Date.parse(disposition.expiresAt);
  if (!Number.isFinite(expiresAt)) throw Error(`${label}.expiresAt must be an ISO date`);
  if (expiresAt <= Date.now()) throw Error(`${label}.expiresAt must be in the future`);
  return disposition;
}

export function validateReviewFinding(finding, label = 'review finding') {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) throw Error(`Invalid ${label}`);
  if (!SEVERITIES.includes(finding.severity)) throw Error(`Invalid ${label} severity`);
  requireText(finding.message, `${label}.message`);
  if (finding.disposition !== undefined) validateFindingDisposition(finding.disposition, `${label}.disposition`);
  return finding;
}

export function findingIsResolved(finding) {
  if (finding?.severity === 'suggestion') return true;
  if (finding?.severity !== 'warning') return false;
  if (!finding.disposition) return false;
  const expiresAt = Date.parse(finding.disposition.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function unresolvedFindings(findings) {
  return Array.isArray(findings) ? findings.filter(finding => !findingIsResolved(finding)) : [];
}

export function hasUnresolvedFindings(findings) {
  return unresolvedFindings(findings).length > 0;
}

export function findingFingerprintPart(finding) {
  return {
    severity: finding?.severity ?? null,
    message: finding?.message ?? null,
    path: finding?.path ?? null,
    line: finding?.line ?? null,
    disposition: finding?.disposition ?? null
  };
}
