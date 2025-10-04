import { getVerb, VerbContext } from '../verbs/index.js';
import { loadMethod } from './method_loader.js';
import { logEvent } from './events.js';

interface MethodDefStep { call: string; args?: any; out?: string; foreach?: string }
interface MethodDef { method: string; applicable_if?: string; steps: MethodDefStep[]; success_when?: string[] }

export interface ExecutionResult {
  outputs: Record<string, any>;
  success: boolean;
  success_checks: { expr: string; value: boolean }[];
}

function interpolate(str: string, scope: Record<string, any>): string {
  return str.replace(/\"{{(.*?)}}\"|{{(.*?)}}/g, (_m, g1, g2) => {
    const expr = (g1 || g2).trim();
    try {
      const fn = new Function(...Object.keys(scope), `return (${expr});`);
      return fn(...Object.values(scope));
    } catch {
      return `{{ERROR:${expr}}}`;
    }
  });
}

function deepInterpolate(obj: any, scope: Record<string, any>): any {
  if (obj == null) return obj;
  if (typeof obj === 'string') {
    if (obj.includes('{{')) return interpolate(obj, scope);
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(o => deepInterpolate(o, scope));
  if (typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepInterpolate(v, scope);
    return out;
  }
  return obj;
}

function evalExpr(expr: string, scope: Record<string, any>): any {
  const fn = new Function(...Object.keys(scope), `return (${expr});`);
  return fn(...Object.values(scope));
}

// loadMethod now imported from method_loader

export interface RunMethodOptions {
  goal: any;
  ctx?: Record<string, any>;
  verbContext: VerbContext;
}

export async function runMethod(methodName: string, opts: RunMethodOptions): Promise<ExecutionResult> {
  const method = await loadMethod(methodName);
  const scope: Record<string, any> = { goal: opts.goal, ctx: opts.ctx || {}, now: Date.now(), outputs: {} };
  const outputs: Record<string, any> = {};

  for (const step of method.steps) {
    if (!getVerb(step.call)) throw new Error(`Unknown verb in method: ${step.call}`);
    if (step.foreach) {
      // pattern: itemVar in collectionPath
      const m = step.foreach.match(/^(\w+)\s+in\s+(.+)$/);
      if (!m) throw new Error(`Bad foreach syntax: ${step.foreach}`);
      const [, varName, collectionExpr] = m;
      const collection = evalExpr(collectionExpr.trim(), { ...scope, ...outputs });
      if (!Array.isArray(collection)) throw new Error(`Foreach collection not array for ${step.call}`);
      for (const item of collection) {
        const localScope = { ...scope, ...outputs, [varName]: item };
        const args = deepInterpolate(step.args || {}, localScope);
        const verb = getVerb(step.call);
        logEvent('verb.start', { verb: step.call, args });
        const res = await verb.run(args, opts.verbContext);
        logEvent('verb.end', { verb: step.call, result: res });
        if (step.out) {
          outputs[step.out] = res;
          scope[step.out] = res;
        }
      }
    } else {
      const args = deepInterpolate(step.args || {}, { ...scope, ...outputs });
      const verb = getVerb(step.call);
      logEvent('verb.start', { verb: step.call, args });
      const res = await verb.run(args, opts.verbContext);
      logEvent('verb.end', { verb: step.call, result: res });
      if (step.out) {
        outputs[step.out] = res;
        scope[step.out] = res;
      }
    }
  }

  const success_checks = (method.success_when || []).map(expr => {
    let value = false;
    try {
      value = !!evalExpr(expr, { ...scope, ...outputs });
    } catch {
      value = false;
    }
    return { expr, value };
  });
  const success = success_checks.every(c => c.value);
  logEvent('method.complete', { method: methodName, success, success_checks });
  return { outputs, success, success_checks };
}
