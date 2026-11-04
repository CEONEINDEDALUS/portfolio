const MAX_BODY_BYTES = 16000;
const MIN_FILL_TIME_MS = 1200;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

const TOPICS = new Set([
  'a website',
  'an identity',
  'a product',
  'a mobile app',
  'an experiment',
  'a brand',
  'an AI tool / automation',
  'a system to design',
  'something else'
]);

const BUDGETS = new Set([
  '',
  'Under €5k',
  '€5–15k',
  '€15–40k',
  '€40k+',
  'Not sure yet'
]);

const rateHits = new Map();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function clean(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateHits.get(ip);

  if (!record || now - record.startedAt > RATE_WINDOW_MS) {
    rateHits.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  record.count += 1;
  return record.count > RATE_MAX;
}

function pruneRateHits() {
  const now = Date.now();
  for (const [ip, record] of rateHits) {
    if (now - record.startedAt > RATE_WINDOW_MS) rateHits.delete(ip);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed.' }, 405);
}

export async function onRequestPost({ request, env }) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowedOrigins = new Set([
    requestUrl.origin,
    'https://ceonein.com',
    'https://www.ceonein.com'
  ]);

  if (origin && !allowedOrigins.has(origin)) {
    return json({ ok: false, error: 'Request origin not allowed.' }, 403);
  }

  if (!env.RESEND_API_KEY) {
    return json({ ok: false, error: 'Email service is not configured yet. Please email hello@ceonein.dev directly.' }, 500);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return json({ ok: false, error: 'Unsupported request format.' }, 415);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Message is too large.' }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  if (!payload || typeof payload !== 'object') {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  if (clean(payload.website, 200)) {
    return json({ ok: true });
  }

  const elapsedMs = Number(payload.elapsedMs);
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_FILL_TIME_MS) {
    return json({ ok: false, error: 'Please take a moment and try sending again.' }, 400);
  }

  const name = clean(payload.name, 100);
  const company = clean(payload.company, 120);
  const email = clean(payload.email, 254);
  const rawTopic = clean(payload.topic, 80);
  const rawBudget = clean(payload.budget, 40);
  const details = cleanMultiline(payload.details, 5000);

  const topic = TOPICS.has(rawTopic) ? rawTopic : 'something else';
  const budget = BUDGETS.has(rawBudget) ? rawBudget : '';

  if (!name) {
    return json({ ok: false, error: 'Please tell me your name.' }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ ok: false, error: 'Please enter a valid email address.' }, 400);
  }

  if (details.length > 5000) {
    return json({ ok: false, error: 'Please keep the details under 5000 characters.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  pruneRateHits();
  if (isRateLimited(ip)) {
    return json({ ok: false, error: 'Too many messages. Please try again later or email hello@ceonein.dev.' }, 429);
  }

  const recipient = (env.CONTACT_TO || 'hello@ceonein.dev')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const sender = env.CONTACT_FROM || 'Ceonein Portfolio <contact@ceonein.dev>';
  const subject = `Project inquiry: ${topic}`;
  const intro = `Hello, I am ${name}${company ? ` from ${company}` : ''} and I want to talk about ${topic}.`;
  const budgetLabel = budget || 'Not specified';
  const detailsText = details || '(none provided)';

  const text = [
    intro,
    '',
    `Name: ${name}`,
    `Company: ${company || 'Not specified'}`,
    `Email: ${email}`,
    `Budget: ${budgetLabel}`,
    '',
    'Details:',
    detailsText
  ].join('\n');

  const html = `
    <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.6; color: #1c1d20;">
      <p>${escapeHtml(intro)}</p>
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 2px 16px 2px 0;"><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 2px 16px 2px 0;"><strong>Company</strong></td><td>${escapeHtml(company || 'Not specified')}</td></tr>
        <tr><td style="padding: 2px 16px 2px 0;"><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
        <tr><td style="padding: 2px 16px 2px 0;"><strong>Budget</strong></td><td>${escapeHtml(budgetLabel)}</td></tr>
      </table>
      <p style="margin-top: 20px;"><strong>Details</strong></p>
      <p style="white-space: pre-wrap;">${escapeHtml(detailsText)}</p>
    </div>
  `;

  let resendResponse;
  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: sender,
        to: recipient,
        reply_to: email,
        subject,
        text,
        html
      })
    });
  } catch (error) {
    console.error('Resend request failed', error);
    return json({ ok: false, error: 'Could not reach the email service. Please email hello@ceonein.dev directly.' }, 502);
  }

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    console.error('Resend rejected message', resendResponse.status, errorText.slice(0, 500));
    return json({ ok: false, error: 'Could not send the message. Please email hello@ceonein.dev directly.' }, 502);
  }

  return json({ ok: true });
}
