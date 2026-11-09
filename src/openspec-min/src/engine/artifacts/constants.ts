/**
 * Validation threshold constants
 */

export const MIN_PURPOSE_LENGTH = 50;

// The Purpose baseline promotion writes into a main spec it creates when the
// delta introduced the capability without a usable `## Purpose`. Named here, and
// composed from these two halves at the write site, so validation recognises the
// placeholder through the same definition that produces it: a second, hand-copied
// spelling would stop matching the day the wording changed, and a check that
// matches nothing looks exactly like a check that found nothing.
export const PURPOSE_PLACEHOLDER_PREFIX = 'TBD - created by archiving change ';
export const PURPOSE_PLACEHOLDER_SUFFIX = '. Update Purpose after archive.';

// Validation messages
export const VALIDATION_MESSAGES = {
  // Required content
  SCENARIO_EMPTY: 'Scenario text cannot be empty',
  REQUIREMENT_EMPTY: 'Requirement text cannot be empty',
  REQUIREMENT_NO_SCENARIOS: 'Requirement must have at least one scenario',
  SPEC_NAME_EMPTY: 'Spec name cannot be empty',
  SPEC_PURPOSE_EMPTY: 'Purpose section cannot be empty',
  SPEC_NO_REQUIREMENTS: 'Spec must have at least one requirement',
} as const;
