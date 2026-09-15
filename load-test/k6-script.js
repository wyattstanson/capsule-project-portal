// ════════════════════════════════════════════════════════════════════════
// Capsule Portal — k6 load test
//
// Simulates up to 5,000 concurrent students hammering the three hottest
// endpoints around a deadline spike:
//   • browse/search students   (GET  /api/students)
//   • send a team request       (POST /api/requests/send)
//   • the admin dashboard        (GET  /api/admin/dashboard)
//
// Run:
//   BASE_URL=http://localhost:4000 k6 run load-test/k6-script.js
//
// Requires the API + Postgres + Redis running and the DB seeded (dev mode, so
// request-otp returns a devCode we can log in with).
// ════════════════════════════════════════════════════════════════════════
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const TOKEN_POOL = Number(__ENV.TOKEN_POOL || 300); // distinct logins to reuse

const browseLatency = new Trend('browse_latency', true);
const sendLatency = new Trend('send_request_latency', true);
const dashLatency = new Trend('dashboard_latency', true);

export const options = {
  scenarios: {
    // Ramp students up to 5,000 concurrent, hold, ramp down.
    students: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 1000 },
        { duration: '2m', target: 5000 },
        { duration: '3m', target: 5000 }, // sustained peak
        { duration: '1m', target: 0 },
      ],
      exec: 'studentFlow',
      gracefulRampDown: '30s',
    },
    // A handful of admins polling the live dashboard throughout.
    admins: {
      executor: 'constant-vus',
      vus: 20,
      duration: '7m',
      exec: 'adminFlow',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'], // <2% errors
    browse_latency: ['p(95)<800'],
    send_request_latency: ['p(95)<1000'],
    dashboard_latency: ['p(95)<800'],
  },
};

function login(identifier) {
  const otp = http.post(`${BASE}/api/auth/request-otp`, JSON.stringify({ identifier }), {
    headers: { 'Content-Type': 'application/json' },
  });
  const devCode = otp.json('devCode');
  if (!devCode) return null;
  const verify = http.post(
    `${BASE}/api/auth/verify`,
    JSON.stringify({ identifier, code: devCode }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  return verify.json('token');
}

// setup() logs in a reusable pool of student tokens + one admin token.
export function setup() {
  const studentTokens = [];
  for (let i = 0; i < TOKEN_POOL; i++) {
    const regNo = `22CCE${1000 + i}`; // matches the default seed pattern
    const token = login(regNo);
    if (token) studentTokens.push(token);
  }
  const adminToken = login('admin@univ.edu');
  return { studentTokens, adminToken };
}

export function studentFlow(data) {
  const tokens = data.studentTokens;
  if (!tokens.length) return;
  const token = tokens[randomIntBetween(0, tokens.length - 1)];
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // 1) Browse / search
  const q = ['a', 'sharma', 'bcb', 'reddy', ''][randomIntBetween(0, 4)];
  const browse = http.get(`${BASE}/api/students?search=${q}&page=1&pageSize=20`, authHeaders);
  browseLatency.add(browse.timings.duration);
  check(browse, { 'browse 200': (r) => r.status === 200 });

  // 2) Occasionally send a team request to a random peer from the results.
  if (browse.status === 200 && Math.random() < 0.3) {
    const list = browse.json('students') || [];
    if (list.length) {
      const target = list[randomIntBetween(0, list.length - 1)];
      const res = http.post(
        `${BASE}/api/requests/send`,
        JSON.stringify({ toStudentId: target.id }),
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      sendLatency.add(res.timings.duration);
      // 200 (sent), 409 (already teamed / duplicate) and 429 (rate limited) are
      // all "healthy" responses under contention — only 5xx is a real failure.
      check(res, { 'send not 5xx': (r) => r.status < 500 });
    }
  }

  sleep(randomIntBetween(1, 4));
}

export function adminFlow(data) {
  if (!data.adminToken) return;
  const res = http.get(`${BASE}/api/admin/dashboard`, {
    headers: { Authorization: `Bearer ${data.adminToken}` },
  });
  dashLatency.add(res.timings.duration);
  check(res, { 'dashboard 200': (r) => r.status === 200 });
  sleep(2);
}
