const $ = (id) => document.getElementById(id);
const money = (cents) => `${(cents / 100).toLocaleString('uk-UA')} ₴`;

let products = [];
const cart = new Map(); // productId -> quantity

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
      <button>У кошик</button>`;
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

function say(text, kind) {
  $('message').textContent = text;
  $('message').className = kind;
}

$('checkout').onclick = async () => {
  const customer = $('customer').value.trim();
  if (!customer) return say('Введіть ім\'я', 'err');

  const items = [...cart].map(([productId, quantity]) => ({ productId, quantity }));
  const res = await fetch('/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer, items }),
  });

  if (res.ok) {
    const order = await res.json();
    cart.clear();
    renderCart();
    say(`Замовлення №${order.id} прийнято на суму ${money(order.total_cents)} ✅`, 'ok');
  } else {
    say('Не вдалося оформити замовлення', 'err');
  }
};

renderCart();
loadProducts();
