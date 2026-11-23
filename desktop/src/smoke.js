'use strict';
// End-to-end check used by CI on a fresh Windows machine (sosyalmedya.exe --smoke-test).
// Everything goes through the public port, the same way the browser talks to the app.
const { PUBLIC_URL, PORTS } = require('./config');

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function step(manager, name, fn) {
  manager.log(`[smoke] ${name}…`);
  const result = await fn();
  manager.log(`[smoke] ${name}: OK`);
  return result;
}

async function run(manager) {
  await step(manager, 'login page', async () => {
    const res = await fetch(`${PUBLIC_URL}/auth/login`, { redirect: 'manual' });
    assert(res.status === 200, `login page returned ${res.status}`);
    const html = await res.text();
    assert(html.includes('<html'), 'login page is not HTML');
  });

  const email = `smoke-${Date.now()}@example.com`;
  const auth = await step(manager, 'register', async () => {
    const res = await fetch(`${PUBLIC_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'smoke-test-password-123',
        company: 'Smoke Test',
        provider: 'LOCAL',
      }),
    });
    const body = await res.text();
    assert(res.status === 200, `register returned ${res.status}: ${body}`);
    const token = res.headers.get('auth');
    assert(token, `register did not return an auth token: ${body}`);
    return token;
  });

  await step(manager, 'login', async () => {
    const res = await fetch(`${PUBLIC_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'smoke-test-password-123',
        provider: 'LOCAL',
      }),
    });
    assert(res.status === 200, `login returned ${res.status}: ${await res.text()}`);
    assert(res.headers.get('auth'), 'login did not return an auth token');
  });

  await step(manager, 'current user', async () => {
    const res = await fetch(`${PUBLIC_URL}/api/user/self`, { headers: { auth } });
    const body = await res.text();
    assert(res.status === 200, `user/self returned ${res.status}: ${body}`);
    assert(body.includes(email), 'user/self does not contain the new user');
  });

  const uploaded = await step(manager, 'media upload', async () => {
    const form = new FormData();
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'smoke.png');
    const res = await fetch(`${PUBLIC_URL}/api/media/upload-server`, {
      method: 'POST',
      headers: { auth },
      body: form,
    });
    const body = await res.text();
    assert(res.status === 200 || res.status === 201, `upload returned ${res.status}: ${body}`);
    const json = JSON.parse(body);
    assert(json.path, `upload response has no path: ${body}`);
    return json.path;
  });

  await step(manager, 'uploaded file is served', async () => {
    const url = new URL(uploaded);
    const res = await fetch(`${PUBLIC_URL}${url.pathname}`);
    assert(res.status === 200, `uploaded file returned ${res.status} (${url.pathname})`);
    const buf = Buffer.from(await res.arrayBuffer());
    assert(buf.equals(PNG), 'uploaded file content differs');
  });

  await step(manager, 'app page renders when signed in', async () => {
    const res = await fetch(`${PUBLIC_URL}/launches`, {
      headers: { cookie: `auth=${auth}` },
      redirect: 'manual',
    });
    assert(res.status === 200, `launches page returned ${res.status}`);
  });

  await step(manager, 'post scheduler (Temporal) is connected', async () => {
    const res = await fetch(`http://127.0.0.1:${PORTS.orchestrator}/health/status`);
    assert(res.status === 200, `orchestrator health returned ${res.status}`);
  });

  manager.log('[smoke] ALL CHECKS PASSED');
}

module.exports = { run };
