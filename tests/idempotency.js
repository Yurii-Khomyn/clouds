const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

async function call(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, replay: res.headers.get('idempotent-replay'), body: await res.json() };
}

function check(name, ok) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const email = `idem-${Date.now()}@test.local`;
  const reg = await call('POST', '/auth/register', null, { name: 'Idem', email, password: 'idempotency-test-1' });
  const token = reg.body.token;
  const key = `key-${Date.now()}`;
  const order = { items: [{ productId: 1, quantity: 2 }] };
  const headers = { 'Idempotency-Key': key };

  const first = await call('POST', '/orders', token, order, headers);
  const second = await call('POST', '/orders', token, order, headers);
  console.log('перший запит :', first.status, JSON.stringify(first.body));
  console.log('другий запит :', second.status, JSON.stringify(second.body), 'replay=' + second.replay);

  await new Promise((r) => setTimeout(r, 4000));
  const list = await call('GET', '/orders', token);
  check('обидва запити повернули успіх (201 або 202)', [201, 202].includes(first.status) && first.status === second.status);
  check('відповіді однакові (той самий id)', JSON.stringify(first.body) === JSON.stringify(second.body));
  check('другу відповідь віддано зі збереженого результату', second.replay === 'true');
  check(`у базі один запис (замовлень користувача: ${list.body.length})`, list.body.length === 1);

  const other = await call('POST', '/orders', token, { items: [{ productId: 2, quantity: 1 }] }, headers);
  check('той самий ключ з іншим тілом відхилено (422)', other.status === 422);

  const plain1 = await call('POST', '/orders', token, order);
  const plain2 = await call('POST', '/orders', token, order);
  check('без ключа кожен запит створює окремий запис', JSON.stringify(plain1.body) !== JSON.stringify(plain2.body));
})().catch((e) => { console.error(e); process.exit(1); });
