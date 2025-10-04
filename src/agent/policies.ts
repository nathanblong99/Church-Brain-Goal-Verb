// Centralized communication & interaction principles for reference by future development.
// These constants are NOT enforced automatically; they serve as a single source of truth
// and can be imported into tests or lint scripts to assert compliance.

export const COMMUNICATION_PRINCIPLES = {
  naturalLanguageOnly: true,
  description: `All human-facing communication (staff & volunteers) must be natural language. We never require
explicit command tokens or uppercase keywords, except mandatory carrier compliance (STOP, HELP). The AI layer
performs NLU (intent + slot extraction) and generates phrased replies. Any new feature must integrate with
the reply generator instead of emitting raw, terse system strings.`,
  allowedExplicitKeywords: ['STOP','HELP','YES','NO'], // YES/NO still accepted but not mandated
  disallowedPatternsNote: 'Do not instruct users to reply with ALL-CAPS tokens like REB, STATUS, FILL, KEEP, RELEASE. Use conversational phrasing.'
};

export type CommunicationPrinciples = typeof COMMUNICATION_PRINCIPLES;
