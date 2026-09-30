// UI adapter only. Toon owns the production-facing backend contract.
// No phone, calendar, Teams or outreach endpoint is called from this module.
const configuredTarget = (import.meta.env?.VITE_TOON_API_URL || '/').trim();
const configuredBase = configuredTarget.replace(/\/+$/, '');
const mode = configuredTarget === 'local' ? 'local' : 'toon';

function adapterError(message, status = 0, code = 'ADAPTER_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

async function request(path, body, backend = mode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  const url = `${backend === 'toon' ? configuredBase : ''}${path}`;
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      credentials: 'same-origin', signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw adapterError('The backend returned a non-JSON response. Check its API address and endpoint contract.', response.status, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail.map((item) => `${(item.loc || []).join('.')}: ${item.msg}`).join('; ') : undefined;
      throw adapterError(data.error || detail || data.message || `Backend request failed (${response.status}).`, response.status, data.code || 'BACKEND_ERROR');
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw adapterError('The backend did not respond in time. Check its state before submitting again.', 0, 'TIMEOUT');
    if (error instanceof TypeError) throw adapterError('Cannot reach the backend. Check the API address, running server and CORS configuration.', 0, 'NETWORK_ERROR');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sourceView(workspace, issue, sourceId) {
  const source = workspace.sources.find((entry) => entry.id === sourceId);
  const evidence = issue.evidence.find((entry) => entry.sourceId === sourceId);
  if (!source || !evidence) throw adapterError('The demo question is missing its supporting source.', 0, 'MISSING_EVIDENCE');
  return { title: source.title, excerpt: evidence.quote };
}

function normalizeToonConflict(conflict) {
  if (!conflict || typeof conflict.id !== 'string' || !conflict.source_a?.excerpt || !conflict.source_b?.excerpt || !conflict.assigned_sme?.id) {
    throw adapterError('The pending-conflict response does not match the agreed KnowledgeConflict schema. See docs/backend-handoff.md.', 0, 'CONTRACT_MISMATCH');
  }
  const client = conflict.client_context || 'Client';
  const topic = conflict.topic || 'Knowledge clarification';
  return {
    id: conflict.id, title: topic, client,
    question: `For ${client}: one source says ${conflict.source_a.excerpt} Another says ${conflict.source_b.excerpt} Which applies, and when?`,
    expertName: conflict.assigned_sme.name || 'Assigned expert', expertRole: conflict.assigned_sme.role || 'Subject matter expert',
    optionA: conflict.source_a.excerpt,
    optionB: conflict.source_b.excerpt,
    sourceA: { title: conflict.source_a.title || 'Source A', excerpt: conflict.source_a.excerpt },
    sourceB: { title: conflict.source_b.title || 'Source B', excerpt: conflict.source_b.excerpt },
    suggestedAnswer: '', // The frontend must not infer which source is correct.
    scope: `${client} · ${topic}`,
    mode: 'toon',
    context: Number.isFinite(conflict.active_tickets_count) ? `${conflict.active_tickets_count} related open tickets · ${client}` : `A clarification is waiting for ${conflict.assigned_sme.name || 'the assigned expert'}.`,
    _toon: { smeId: conflict.assigned_sme.id, status: conflict.status },
  };
}

export async function getQuestion() {
  if (mode === 'toon') {
    const result = await request('/api/conflicts/pending');
    const conflicts = result;
    if (!Array.isArray(conflicts)) throw adapterError('Expected the backend’s array of pending conflicts.', 0, 'CONTRACT_MISMATCH');
    const pending = conflicts.filter((conflict) => conflict.status === 'OPEN');
    if (!pending.length) throw adapterError('No pending knowledge question is available. Seed or scan the backend to prepare the demo.', 404, 'NO_PENDING_QUESTION');
    const ranked = [...pending].sort((a, b) => (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0));
    return normalizeToonConflict(ranked[0]);
  }

  let workspace = await request('/api/workspace');
  let issue = workspace.issues?.find((entry) => entry.topic === 'payroll-approval');
  if (!issue) throw adapterError('The local Meridian approval example is missing. Reset the demo to restore it.', 404, 'NO_DEMO_QUESTION');
  // The seated-car film uses the process owner, who can explicitly confirm and
  // share their own explanation. This is a local persona, not authentication.
  if (workspace.personaId !== issue.ownerId) {
    workspace = await request('/api/persona', { personaId: issue.ownerId });
    issue = workspace.issues?.find((entry) => entry.id === issue.id);
    if (!issue) throw adapterError('The question changed while loading. Reload the demo.', 409, 'STALE_QUESTION');
  }
  const owner = workspace.experts.find((entry) => entry.id === issue.ownerId);
  const agreement = sourceView(workspace, issue, 'client-agreement');
  return {
    id: issue.id, title: 'One approval, or two?', client: issue.client,
    question: 'For Meridian, do all payroll submissions need two approvals, or only corrections after cutoff?',
    expertName: owner?.name || 'Process owner', expertRole: owner?.role || 'Process owner',
    optionA: 'One approval for every payroll submission',
    optionB: 'Two approvals only for corrections after cutoff',
    sourceA: sourceView(workspace, issue, 'payroll-policy'),
    sourceB: sourceView(workspace, issue, 'client-checklist'),
    sourceC: agreement,
    suggestedAnswer: issue.suggestedResolution, scope: issue.scope, mode: 'local',
    context: `${agreement.title}: ${agreement.excerpt}`,
    _local: {
      ownerId: issue.ownerId, status: issue.status,
      sourceVersions: Object.fromEntries(issue.sourceIds.map((sourceId) => [sourceId, workspace.sources.find((source) => source.id === sourceId)?.version])),
    },
  };
}

export async function submitAnswer(question, { choice, explanation = '' }) {
  if (!question?.id || !['A', 'B', 'custom'].includes(choice)) throw adapterError('Select option A, option B, or provide your own explanation.', 400, 'INVALID_ANSWER');
  const note = typeof explanation === 'string' ? explanation.trim() : '';
  if (note.length > 3000) throw adapterError('Keep your explanation under 3,000 characters.', 400, 'INVALID_ANSWER');
  if (choice === 'custom' && !note) throw adapterError('Add the explanation you want to share.', 400, 'INVALID_ANSWER');
  const selected = choice === 'A' ? question.optionA : choice === 'B' ? question.optionB : note;

  if (question.mode === 'toon') {
    if (!question._toon?.smeId) throw adapterError('The assigned expert is missing. Reload the question.', 400, 'CONTRACT_MISMATCH');
    // A/B stores the selected excerpt. Any edited or spoken wording must be
    // CUSTOM, otherwise this backend would discard it and store only the excerpt.
    const custom = choice === 'custom' || Boolean(note && note !== selected.trim());
    const confirmedAnswer = custom ? note : selected;
    const record = await request('/api/conflicts/resolve', {
      conflict_id: question.id,
      chosen_option: custom ? 'CUSTOM' : choice,
      ...(custom ? { custom_answer: confirmedAnswer } : {}),
      verifier_id: question._toon.smeId,
      verification_source: 'Car demo · expert confirmed',
    }, 'toon');
    const resultScope = record.client_context && record.topic ? `${record.client_context} · ${record.topic}` : question.scope;
    if (['PENDING', 'PENDING_REVIEW', 'DRAFT'].includes(String(record.status || '').toUpperCase())) {
      return { answer: record.verified_answer || confirmedAnswer, scope: resultScope, verifiedBy: null, verifiedAt: null, status: 'pending_review', mode: 'toon' };
    }
    if (record.resolved_conflict_id !== question.id || typeof record.verified_answer !== 'string' || !record.verified_answer.trim() || typeof record.verified_by !== 'string' || !record.verified_by.trim() || typeof record.verified_at !== 'string' || !Number.isFinite(Date.parse(record.verified_at))) {
      throw adapterError('The backend accepted the request but did not return the agreed verification record. Check the saved state before retrying; see docs/backend-handoff.md.', 0, 'CONTRACT_MISMATCH');
    }
    return { answer: record.verified_answer, scope: resultScope, verifiedBy: record.verified_by, verifiedAt: record.verified_at, status: 'verified', mode: 'toon' };
  }

  if (!question._local?.sourceVersions || !question._local?.ownerId) throw adapterError('Reload the local question before submitting.', 409, 'STALE_SOURCES');
  if (question._local.status === 'resolved') throw adapterError('This example has already been reviewed. Reset the demo to film it again.', 409, 'ALREADY_RESOLVED');
  await request('/api/persona', { personaId: question._local.ownerId }, 'local');
  const answer = choice === 'B' ? question.suggestedAnswer : selected;
  const saved = await request(`/api/issues/${encodeURIComponent(question.id)}/draft`, {
    resolution: answer, scope: question.scope,
    reason: note || `The local demo expert selected option ${choice} after reviewing the available evidence.`,
    expectedSourceVersions: question._local.sourceVersions,
  }, 'local');
  const savedIssue = saved.issues?.find((entry) => entry.id === question.id);
  if (!savedIssue?.draft?.id) throw adapterError('The backend did not return the saved draft revision.', 0, 'CONTRACT_MISMATCH');

  // A and free text are preserved for review. We do not claim arbitrary spoken
  // words were interpreted or that a known unsupported fixture choice is true.
  if (choice !== 'B') return { answer, scope: question.scope, verifiedBy: null, verifiedAt: null, status: 'pending_review', mode: 'local' };

  const approved = await request(`/api/issues/${encodeURIComponent(question.id)}/approve`, { expectedDraftId: savedIssue.draft.id }, 'local');
  const resolved = approved.issues?.find((entry) => entry.id === question.id)?.resolution;
  if (!resolved) throw adapterError('The backend did not return an approved clarification.', 0, 'CONTRACT_MISMATCH');
  const approver = approved.experts.find((expert) => expert.id === resolved.approvedBy);
  return { answer: resolved.text, scope: resolved.scope, verifiedBy: `${approver?.name || resolved.approvedBy}${approver?.role ? ` · ${approver.role}` : ''}`, verifiedAt: resolved.approvedAt, status: 'verified', mode: 'local' };
}

export async function resetDemo() {
  if (mode === 'toon') {
    const result = await request('/api/demo/reset?seed_conflicts=true', {}, 'toon');
    if (result.status !== 'reset') throw adapterError('The backend did not confirm the demo reset.', 0, 'CONTRACT_MISMATCH');
    return;
  }
  await request('/api/reset', {}, 'local');
}
