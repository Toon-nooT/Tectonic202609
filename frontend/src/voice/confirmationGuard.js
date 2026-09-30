// A model requesting a tool is never authorization. Only a fresh, unambiguous
// user transcript after the entire matching readback can authorize publication.
export const normalize = (text) => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const affirmative = /^(yes|yes please|yes save it|yes share it|yes save that|yes share that|yes please save that|yes please save it|yes that is correct|yes that s correct|yes correct|correct|confirmed|confirm|save it|share it|save that|share that|please save it|please share it|go ahead|ja|ja graag|ja sla maar op|dat klopt)$/;
export class ConfirmationGuard {
  constructor() { this.clear(); this.serial = 0; }
  clear() { this.draft = null; this.readback = false; this.armed = false; this.approval = null; }
  prepare(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 3000) throw new Error('Draft must contain 1–3000 characters.');
    this.clear(); this.draft = { id: `draft-${++this.serial}`, text: text.trim() };
    return this.draft;
  }
  agent(text) {
    if (!this.draft) return;
    this.approval = null; this.armed = false;
    const line = normalize(text);
    this.readback = line.endsWith(`${normalize(this.draft.text)} shall i save that clarification with your name`);
  }
  speaking() { this.armed = false; this.approval = null; }
  listening() { if (this.readback) this.armed = true; }
  interrupt() { this.armed = false; this.readback = false; this.approval = null; }
  user(text) {
    if (!this.draft) return;
    if (this.armed && affirmative.test(normalize(text))) this.approval = this.draft.id;
    else this.interrupt();
    this.armed = false;
  }
  consume(id) {
    if (!this.draft || id !== this.draft.id || this.approval !== id) throw new Error('Not authorized: read the entire current draft aloud, ask to save, then wait for an explicit yes.');
    const text = this.draft.text; this.clear(); return text;
  }
}
