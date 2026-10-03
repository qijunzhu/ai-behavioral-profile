// Receiver for the ratings page's "share an experience or a question" form: a Cloudflare Pages Function at POST /api/ideas.
// Each submission is stored in the project's private D1 database (binding IDEAS_DB, table in receiver/ideas_schema.sql),
// and the reply {"saved": true, "submission_id": …} is sent only once the row is in the table, which is the one answer the
// page treats as received. Submissions are never shown on the site. No IP address, browser details or cookies are stored.
// The field rules match the page (static/site.js) and the table (receiver/ideas_schema.sql).

const LIMITS = { scenario: 3000, focus: 500 };              // Unicode characters after trimming, as the page counts them
const FIELDS = ['scenario', 'focus', 'language', 'copy_revision', 'submission_id'];
const LANGUAGES = ['en', 'zh'];
const MAX_BYTES = 32 * 1024;
const INSERT_SQL = 'INSERT INTO ideas (submission_id, scenario, focus, language, copy_revision, received_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (submission_id) DO NOTHING';
const SELECT_SQL = 'SELECT scenario, focus, language, copy_revision FROM ideas WHERE submission_id = ?1';

function reply(status, body, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(headers || {}) },
  });
}

function chars(s) { return Array.from(s).length; }

// Read the body up to `max` bytes and stop there: a body sent without (or with a false) Content-Length is never read in
// full. Returns the text, or null when it is too large; invalid UTF-8 throws.
async function readCapped(request, max) {
  if (!request.body) {                                      // no stream (an empty body, or a plain request object)
    const text = typeof request.text === 'function' ? await request.text() : '';
    return new TextEncoder().encode(text).length > max ? null : text;
  }
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}

// Only the five fields, as strings; the two texts trimmed (line breaks inside are kept) and within their limits.
function check(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'not_an_object' };
  if (Object.keys(input).some((k) => !FIELDS.includes(k))) return { error: 'unknown_field' };
  const v = { focus: '' };
  for (const k of FIELDS) {
    if (input[k] === undefined) continue;
    if (typeof input[k] !== 'string') return { error: 'bad_' + k };
    v[k] = input[k];
  }
  v.scenario = (v.scenario || '').trim();
  v.focus = v.focus.trim();
  if (!chars(v.scenario)) return { error: 'empty_scenario' };
  if (chars(v.scenario) > LIMITS.scenario) return { error: 'scenario_too_long' };
  if (chars(v.focus) > LIMITS.focus) return { error: 'focus_too_long' };
  if ((v.scenario + v.focus).includes('\u0000')) return { error: 'bad_text' };
  if (!LANGUAGES.includes(v.language)) return { error: 'bad_language' };
  if (!/^\d{8}-ideas-v\d{1,3}$/.test(v.copy_revision || '')) return { error: 'bad_copy_revision' };
  if (!/^[A-Za-z0-9-]{16,64}$/.test(v.submission_id || '')) return { error: 'bad_submission_id' };
  return { value: v };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  // the form posts from this site only; other pages cannot post here from a visitor's browser
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'other_origin' });
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return reply(415, { error: 'json_only' });
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) return reply(413, { error: 'too_large' });
  // optional Cloudflare rate-limiting binding; the address is only the counting key here and is never stored
  if (env.IDEA_RATE_LIMIT) {
    const { success } = await env.IDEA_RATE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!success) return reply(429, { error: 'too_many' });
  }
  let text;
  try {
    text = await readCapped(request, MAX_BYTES);
  } catch (e) {
    return reply(400, { error: 'unreadable' });
  }
  if (text === null) return reply(413, { error: 'too_large' });
  let input;
  try {
    input = JSON.parse(text);
  } catch (e) {
    return reply(400, { error: 'not_json' });
  }
  const { value, error } = check(input);
  if (error) return reply(400, { error });
  if (!env.IDEAS_DB) return reply(503, { error: 'not_configured' });
  try {
    await env.IDEAS_DB.prepare(INSERT_SQL)
      .bind(value.submission_id, value.scenario, value.focus, value.language, value.copy_revision, new Date().toISOString())
      .run();
    // a retry of the same text is stored once; the same id arriving with different text is refused
    const row = await env.IDEAS_DB.prepare(SELECT_SQL).bind(value.submission_id).first();
    if (!row || row.scenario !== value.scenario || row.focus !== value.focus || row.language !== value.language
        || row.copy_revision !== value.copy_revision) return reply(409, { error: 'id_reused' });
  } catch (e) {
    // for the Functions log: the error only (e.g. a missing table or a refused row), never the visitor's text
    console.warn('ideas: save failed:', e && e.message ? e.message : String(e));
    return reply(500, { error: 'not_saved' });
  }
  return reply(200, { saved: true, submission_id: value.submission_id });
}
