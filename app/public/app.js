const $ = (id) => document.getElementById(id);
const money = (cents) => `${(cents / 100).toLocaleString('uk-UA')} ₴`;

let products = [];
const cart = new Map(); // productId -> quantity

// --- Сесія ---
// Токен зберігаємо в localStorage: для навчального проєкту достатньо.
// У продакшені безпечніше HttpOnly-cookie, бо localStorage доступний будь-якому скрипту на сторінці.
const session = {
  get token() { try { return localStorage.getItem('token'); } catch { return null; } },
  get name() { try { return localStorage.getItem('name'); } catch { return null; } },
  set(token, name) { try { localStorage.setItem('token', token); localStorage.setItem('name', name); } catch {} },
  clear() { try { localStorage.removeItem('token'); localStorage.removeItem('name'); } catch {} },
};

function say(text, kind) {
  $('message').textContent = text;
  $('message').className = kind || '';
}

// fetch із токеном. Якщо сервер каже 401, токен недійсний (наприклад, минула година): виходимо.
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && session.token && !path.startsWith('/auth/')) {
    logout();
    say('Сесія закінчилась. Увійдіть знову.', 'err');
  }
  return res;
}

// --- Товари ---
async function loadProducts() {
  try {
    const res = await fetch('/products');
    if (!res.ok) throw new Error(res.status);
    products = await res.json();
    renderProducts();
  } catch {
    $('products').textContent = 'Не вдалося завантажити товари.';
  }
}

function renderProducts() {
  $('products').innerHTML = '';
  for (const p of products) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img alt="" loading="lazy">
      <h3></h3><p></p>
      <div class="price">${money(p.price_cents)}</div>
      <button>Додати в кошик</button>`;
    // textContent, а не innerHTML, для даних з бази: захист від XSS.
    const img = card.querySelector('img');
    img.src = p.image_url;
    img.alt = p.name;
    card.querySelector('h3').textContent = p.name;
    card.querySelector('p').textContent = p.description;
    card.querySelector('button').onclick = () => {
      cart.set(p.id, (cart.get(p.id) ?? 0) + 1);
      renderCart();
    };
    $('products').append(card);
  }
}

// --- Кошик ---
function renderCart() {
  const list = $('cart-items');
  list.innerHTML = '';
  let total = 0;

  if (cart.size === 0) {
    list.innerHTML = '<li class="empty">Кошик порожній</li>';
  }
  for (const [id, qty] of cart) {
    const p = products.find((x) => x.id === id);
    total += p.price_cents * qty;
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${p.name} × ${qty}`;
    const remove = document.createElement('button');
    remove.textContent = '✕';
    remove.title = 'Прибрати';
    remove.onclick = () => { cart.delete(id); renderCart(); };
    li.append(label, remove);
    list.append(li);
  }
  $('total').textContent = money(total);
  $('checkout').disabled = cart.size === 0;
}

$('checkout').onclick = async () => {
  // Замовлення лише для авторизованих: без входу показуємо форму входу.
  if (!session.token) {
    say('Щоб оформити замовлення, увійдіть.', 'err');
    return openAuth('login');
  }
  const items = [...cart].map(([productId, quantity]) => ({ productId, quantity }));
  const res = await api('/orders', { method: 'POST', body: JSON.stringify({ items }) });

  if (res.ok) {
    const order = await res.json();
    cart.clear();
    renderCart();
    say(`Замовлення №${order.id} прийнято на суму ${money(order.total_cents)} ✅`, 'ok');
    loadOrders();
  } else if (res.status !== 401) {
    say('Не вдалося оформити замовлення', 'err');
  }
};

// --- Мої замовлення ---
async function loadOrders() {
  $('orders-box').hidden = !session.token;
  if (!session.token) return;
  const res = await api('/orders');
  if (!res.ok) return;
  const orders = await res.json();
  const list = $('orders-list');
  list.innerHTML = '';
  if (orders.length === 0) {
    list.innerHTML = '<li class="empty">Замовлень ще немає</li>';
  }
  for (const o of orders) {
    const li = document.createElement('li');
    const when = new Date(o.created_at).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
    li.textContent = `№${o.id} · ${when} · ${money(o.total_cents)}`;
    list.append(li);
  }
}

// --- Вхід / реєстрація ---
let mode = 'login';

function renderAuthBar() {
  const bar = $('auth');
  bar.innerHTML = '';
  if (session.token) {
    const hello = document.createElement('span');
    hello.textContent = `Привіт, ${session.name}`;
    const out = document.createElement('button');
    out.className = 'secondary';
    out.textContent = 'Вийти';
    out.onclick = logout;
    bar.append(hello, out);
  } else {
    const inBtn = document.createElement('button');
    inBtn.textContent = 'Увійти';
    inBtn.onclick = () => openAuth('login');
    bar.append(inBtn);
  }
}

function logout() {
  session.clear();
  renderAuthBar();
  loadOrders();
}

function openAuth(newMode) {
  mode = newMode;
  const reg = mode === 'register';
  $('auth-title').textContent = reg ? 'Реєстрація' : 'Вхід';
  $('auth-name').hidden = !reg;
  $('auth-name').required = reg;
  $('auth-submit').textContent = reg ? 'Зареєструватися' : 'Увійти';
  $('auth-switch').textContent = reg ? 'Вже є акаунт? Увійти' : 'Немає акаунта? Зареєструватися';
  $('auth-password').autocomplete = reg ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
  $('auth-dialog').showModal();
}

$('auth-switch').onclick = (e) => { e.preventDefault(); openAuth(mode === 'login' ? 'register' : 'login'); };
$('auth-cancel').onclick = () => $('auth-dialog').close();

$('auth-form').onsubmit = async (e) => {
  e.preventDefault();
  const body = { email: $('auth-email').value, password: $('auth-password').value };
  if (mode === 'register') body.name = $('auth-name').value;

  const res = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const texts = {
      400: 'Перевірте дані: ім\'я, email і пароль від 8 символів.',
      401: 'Хибний email або пароль.',
      409: 'Цей email уже зареєстровано. Спробуйте увійти.',
    };
    $('auth-error').textContent = texts[res.status] || 'Щось пішло не так. Спробуйте ще раз.';
    return;
  }
  session.set(data.token, data.name);
  $('auth-dialog').close();
  $('auth-password').value = '';
  say('', '');
  renderAuthBar();
  loadOrders();
};

renderAuthBar();
renderCart();
loadProducts();
loadOrders();
