import * as AjvNS from 'ajv';

export const planSchema = {
  type: 'object',
  required: ['goal', 'method', 'steps', 'success_when', 'rationale'],
  additionalProperties: false,
  properties: {
    goal: { type: 'object', required: ['kind'], properties: { kind: { type: 'string' } }, additionalProperties: true },
    method: { type: 'string' },
    rationale: { type: 'string', maxLength: 200 },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['call', 'args'],
        properties: {
          call: { type: 'string' },
          args: {},
          out: { type: 'string' },
          foreach: { type: 'string' }
        },
        additionalProperties: true
      }
    },
    success_when: { type: 'array', items: { type: 'string' } }
  }
} as const;

const Ajv = (AjvNS as any).default || (AjvNS as any).Ajv || AjvNS;
const ajv = new Ajv({ allErrors: true, strict: false });
export const validatePlan = ajv.compile(planSchema);
export type RawPlan = {
  goal: any;
  method: string;
  rationale: string; // concise justification from the model (<= 200 chars)
  steps: Array<{ call: string; args: any; out?: string; foreach?: string }>;
  success_when: string[];
  // Not validated by schema: local, computed metric to gauge complexity.
  complexity_score?: number;
};
