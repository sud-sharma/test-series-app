import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_USER ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ||= 'key_secret';
process.env.JWT_SECRET ||= 'jwt';
process.env.COURSE_FEE_INR ||= '7355';
process.env.TURNSTILE_SITE_KEY = 'site';
process.env.TURNSTILE_SECRET_KEY = 'secret';
process.env.TURNSTILE_HOSTNAMES = 'geo.example.in';

const { newAccessToken, hashToken, tokenMatches, verifyCaptcha, captchaEnabled } = await import('../src/security.js');

test('access tokens: random, hashed, only the right token matches', () => {
  const a = newAccessToken();
  const b = newAccessToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, hashToken(a.token));
  assert.equal(a.hash.length, 64);
  assert.ok(a.token.length >= 40);
  assert.equal(tokenMatches(a.token, a.hash), true);
  assert.equal(tokenMatches(b.token, a.hash), false);
  assert.equal(tokenMatches('', a.hash), false);
  assert.equal(tokenMatches(a.token, null), false); // old registrations without a token
  assert.equal(tokenMatches(a.token, 'not-hex'), false);
});

const fakeFetch = (body, { throws = false } = {}) => {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    if (throws) throw new Error('network down');
    return { json: async () => body };
  };
  fn.calls = calls;
  return fn;
};

test('captcha: enabled when a secret key is set', () => {
  assert.equal(captchaEnabled(), true);
});

test('captcha: valid token on our hostname passes and is sent to Cloudflare with the IP', async () => {
  const f = fakeFetch({ success: true, hostname: 'geo.example.in' });
  assert.deepEqual(await verifyCaptcha('tok', '1.2.3.4', f), { ok: true });
  assert.equal(f.calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.deepEqual(f.calls[0].body, { secret: 'secret', response: 'tok', remoteip: '1.2.3.4' });
});

test('captcha: missing token, failed check, other hostname and outage are all rejected', async () => {
  assert.equal((await verifyCaptcha('', '1.2.3.4', fakeFetch({ success: true }))).ok, false);
  const failed = await verifyCaptcha('tok', '1.2.3.4', fakeFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
  assert.deepEqual(failed, { ok: false, reason: 'timeout-or-duplicate' });
  const otherSite = await verifyCaptcha('tok', '1.2.3.4', fakeFetch({ success: true, hostname: 'evil.example' }));
  assert.deepEqual(otherSite, { ok: false, reason: 'hostname-mismatch' });
  const down = await verifyCaptcha('tok', '1.2.3.4', fakeFetch(null, { throws: true }));
  assert.deepEqual(down, { ok: false, reason: 'verification-unavailable' });
});
