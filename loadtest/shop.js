import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL;
const N = Number(__ENV.USERS || 60);
const TAG = __ENV.TAG || 'run';
const FAST = __ENV.FAST === '1';

export const options = {
  scenarios: {
    shop: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: FAST
        ? [{ duration: '10s', target: N }, { duration: '20s', target: N }, { duration: '5s', target: 0 }]
        : [
            { duration: '2m30s', target: N },
            { duration: '5m', target: N },
            { duration: '2m', target: 0 },
          ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

const json = { headers: { 'Content-Type': 'application/json' } };
let token = null;

function auth() {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}

function register() {
  const email = `k6-${__VU}-${Date.now()}@load.test`;
  const res = http.post(`${BASE}/auth/register`,
    JSON.stringify({ name: `Load ${__VU}`, email, password: 'load-test-pass-1' }), json);
  check(res, { 'registered': (r) => r.status === 201 });
  return res.json('token');
}

export default function () {
  if (!token) token = register();

  const order = http.post(`${BASE}/orders`,
    JSON.stringify({ items: [{ productId: 1 + Math.floor(Math.random() * 5), quantity: 1 }] }), auth());
  check(order, { 'order accepted': (r) => r.status === 201 || r.status === 202 });
  const orderId = order.status === 201 ? order.json('id') : null;

  const reads = 8 + Math.floor(Math.random() * 3);
  for (let i = 0; i < reads; i++) {
    let res;
    switch (i % 5) {
      case 0: res = http.get(`${BASE}/products/popular`); break;
      case 1: res = http.get(`${BASE}/products/${1 + Math.floor(Math.random() * 5)}`); break;
      case 2: res = orderId ? http.get(`${BASE}/orders/${orderId}`, auth()) : http.get(`${BASE}/products`); break;
      case 3: res = http.get(`${BASE}/me`, auth()); break;
      default: res = http.get(`${BASE}/orders`, auth());
    }
    check(res, { 'read ok': (r) => r.status === 200 });
    sleep(0.1 + Math.random() * 0.3);
  }
  sleep(0.3);
}

export function handleSummary(data) {
  const d = data.metrics.http_req_duration.values;
  const total = data.metrics.http_reqs.values.count;
  const failed = data.metrics.http_req_failed.values.rate;
  const line = [
    `Запитів: ${total}`,
    `Помилок: ${(failed * 100).toFixed(2)}%`,
    `RPS (середній): ${data.metrics.http_reqs.values.rate.toFixed(1)}`,
    `Латентність, мс: p50=${d['p(50)'].toFixed(0)} p95=${d['p(95)'].toFixed(0)} p99=${d['p(99)'].toFixed(0)} avg=${d.avg.toFixed(0)}`,
  ].join('\n');
  return {
    stdout: `\n${line}\n`,
    [`results/${TAG}.json`]: JSON.stringify(data, null, 2),
    [`results/${TAG}.txt`]: line + '\n',
  };
}
