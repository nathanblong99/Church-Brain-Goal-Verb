import { msgKey, alreadySent, recordSent } from '../engine/idempotency.js';
import { db } from './db.js';
import { generateReply } from '../agent/response_generator.js';
import { logEvent } from '../engine/events.js';

export interface SmsSendParams { to: string; body: string; keyParts: { requestId: string; personId: string; kind: string }; template?: string; }

export const sms = {
  async send(p: SmsSendParams & { ai?: { kind: string; context?: any; required?: string[] } }) {
    const key = msgKey(p.keyParts.requestId, p.keyParts.personId, p.keyParts.kind);
    if (alreadySent(key)) return { messageId: key, deduped: true };
    let body = p.body;
    if (p.ai) {
      try {
        body = await generateReply({ kind: p.ai.kind, context: p.ai.context, requiredPhrases: p.ai.required });
        logEvent('ai.reply.generated', { key, kind: p.ai.kind });
      } catch {
        // fallback retains original body
      }
    }
    console.log('[SMS]', p.to, body);
    recordSent(key);
    db.recordMessage({ key, to: p.to, template: p.template || p.keyParts.kind, body, sent_at: new Date().toISOString() });
    return { messageId: key };
  }
};
