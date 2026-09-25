const app = document.querySelector('#app');
const page = document.body.dataset.page || 'home';

// -------------------------------------------------------------
// 1. ホーム画面
// -------------------------------------------------------------
function homePage(){
  app.innerHTML = pageShell(page, `
    <h1>ホーム</h1>
    <div class="grid">
      ${[
        ['register','レジ','注文・会計・座席選択'],
        ['kitchen','厨房','調理中の注文を確認'],
        ['seats','座席管理','席状況の確認・空席化'],
        ['history','注文履歴','提供済み注文の一覧'],
        ['customer','お客さん向け表示','会計内容を大きく表示'],
        ['admin','管理','商品・在庫・座席数を編集']
      ].map(([id,title,desc])=>`<a class="card home-card" href="./${id}.html"><strong>${title}</strong><span>${desc}</span></a>`).join('')}
    </div>
    <div class="card" style="margin-top:20px">
      <h2>担当者</h2>
      <div class="actions">
        <strong id="current-name">${escapeHtml(operator())}</strong>
        <button id="change-name" class="btn">名前を変更</button>
      </div>
    </div>
  `);

  document.querySelector('#change-name').onclick = () => {
    const next = prompt('新しい担当者名を入力してください', operator());
    if (next && next.trim()) {
      localStorage.setItem('olive_operator', next.trim());
      document.querySelector('#current-name').textContent = next.trim();
      document.querySelector('.operator').textContent = `担当: ${next.trim()}`;
    }
  };
}

// -------------------------------------------------------------
// 2. レジ画面（区分連動ペア割 & 任意手動割引）
// -------------------------------------------------------------
async function registerPage(){
  let products = [], cart = {}, cash = '', manualDiscount = 0;
  const data = await api('getRegisterData');
  products = data.products;

  function renderSkeleton() {
    app.innerHTML = pageShell(page, `
      <h1>レジ</h1>
      <div class="split">
        <section>
          <h2>商品</h2>
          <div class="products" id="products-list"></div>
        </section>
        <aside class="card">
          <h2>注文内容</h2>
          <div id="cart-list"></div>

          <div style="margin: 12px 0; padding: 10px; background: #fdf6e2; border-radius: 6px; border: 1px dashed #e0b422;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.9em; margin-bottom: 6px;">
              <span id="auto-discount-label">セット割 (食べ物+飲み物)</span>
              <strong id="auto-discount-val" style="color:#d32f2f;">-¥0</strong>
            </div>
            <div class="field" style="margin:0;">
              <label style="font-size:0.85em;">手動割引 (円)</label>
              <input id="manual-discount" inputmode="numeric" type="number" min="0" placeholder="0" style="padding:6px 10px;">
            </div>
          </div>

          <div class="field">
            <label>預かり金</label>
            <input id="cash" inputmode="numeric" type="number" min="0" placeholder="0">
          </div>

          <div class="money-panel">
            <div class="money-line">
              <span>小計</span>
              <span id="subtotal-val">¥0</span>
            </div>
            <div class="money-line">
              <span>割引合計</span>
              <span id="total-discount-val" style="color:#d32f2f;">-¥0</span>
            </div>
            <div class="money-line" style="font-size:1.2em; border-top:1px solid #ddd; padding-top:6px;">
              <span>お支払い合計</span>
              <strong id="total-val" style="color:#1976d2;">¥0</strong>
            </div>
            <div class="money-line">
              <span>預かり金</span>
              <strong id="cash-val">—</strong>
            </div>
            <div class="money-line">
              <span>おつり</span>
              <strong id="change-val">—</strong>
            </div>
          </div>

          <button id="to-seat" class="btn primary" style="width:100%" disabled>座席を選ぶ</button>
          <button id="clear" class="btn" style="width:100%;margin-top:9px">取消</button>
        </aside>
      </div>
    `);

    const cashInput = document.querySelector('#cash');
    cashInput.oninput = (e) => {
      cash = e.target.value;
      updateTotals();
      sync();
    };

    const discountInput = document.querySelector('#manual-discount');
    discountInput.oninput = (e) => {
      manualDiscount = Math.max(0, Number(e.target.value || 0));
      updateTotals();
      sync();
    };

    document.querySelector('#clear').onclick = () => {
      cart = {};
      cash = '';
      manualDiscount = 0;
      cashInput.value = '';
      discountInput.value = '';
      drawProductsAndCart();
      updateTotals();
      sync();
    };

    document.querySelector('#to-seat').onclick = chooseSeat;
  }

    function getCartItemCount(pId) {
    return Object.keys(cart).filter(k => k === pId || k.startsWith(pId + '__')).reduce((sum, k) => sum + (cart[k] || 0), 0);
  }

  function handleProductAdd(id, flavor = null) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    if (!flavor && p.flavors && p.flavors.length > 0 && typeof promptFlavorSelection === 'function') {
      promptFlavorSelection(p, (selected) => {
        if (selected) handleProductAdd(id, selected);
      });
      return;
    }
    const key = flavor ? ${id}__ : id;
    if (getCartItemCount(id) >= p.stock) return;
    cart[key] = (cart[key] || 0) + 1;
    drawProductsAndCart();
    updateTotals();
    sync();
  }

  function drawProductsAndCart() {
    const prodList = document.querySelector('#products-list');
    prodList.innerHTML = products.map(p => {
      const badge = p.category === '飲み物'
        ? '<span style="background:#e3f2fd;color:#1976d2;padding:2px 6px;border-radius:4px;font-size:0.75em;margin-right:4px;">飲</span>'
        : (p.category === '食べ物'
          ? '<span style="background:#fbe9e7;color:#d84315;padding:2px 6px;border-radius:4px;font-size:0.75em;margin-right:4px;">食</span>'
          : '<span style="background:#f5f5f5;color:#616161;padding:2px 6px;border-radius:4px;font-size:0.75em;margin-right:4px;">他</span>');

      return `
        <button class="card product ${cart[p.id] ? 'in-cart' : ''}" data-add="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
          <strong>${badge}${escapeHtml(p.name)}</strong>
          <span>${money(p.price)}</span>
          <small>在庫 ${p.stock}</small>
        </button>
      `;
    }).join('');

    prodList.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.add;
        const p = products.find(x => x.id === id);
        handleProductAdd(id);
      };
    });

    const cartList = document.querySelector('#cart-list');
    const entries = Object.entries(cart).map(([key, qty]) => {
      const parts = key.split('__');
      const p = products.find(x => x.id === parts[0]);
      return p ? { ...p, cartKey: key, flavor: parts[1] || null, name: parts[1] ? ${p.name} () : p.name, quantity: qty } : null;
    }).filter(Boolean);
    cartList.innerHTML = entries.length ? entries.map(p => `
      <div class="cart-row">
        <div>
          <strong>${escapeHtml(p.name)}</strong><br>${money(p.price * p.quantity)}
        </div>
        <div class="quantity">
          <button data-minus="${p.id}">−</button>
          <b>${p.quantity}</b>
          <button data-add="${p.id}" ${p.quantity >= p.stock ? 'disabled' : ''}>＋</button>
        </div>
      </div>
    `).join('') : '<p class="empty">商品を選んでください</p>';

    cartList.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.add;
        const p = products.find(x => x.id === id);
        handleProductAdd(id);
      };
    });

    cartList.querySelectorAll('[data-minus]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.minus;
        cart[id]--;
        if (!cart[id]) delete cart[id];
        drawProductsAndCart();
        updateTotals();
        sync();
      };
    });
  }

  function calculateBill() {
    const entries = Object.entries(cart).map(([key, qty]) => {
      const parts = key.split('__');
      const p = products.find(x => x.id === parts[0]);
      return p ? { ...p, cartKey: key, flavor: parts[1] || null, name: parts[1] ? ${p.name} () : p.name, quantity: qty } : null;
    }).filter(Boolean);
    const subtotal = entries.reduce((s, p) => s + p.price * p.quantity, 0);

    let foodCount = 0, drinkCount = 0;
    entries.forEach(p => {
      if (p.category === '飲み物') {
        drinkCount += p.quantity;
      } else if (p.category === '食べ物') {
        foodCount += p.quantity;
      }
    });

    const setPairs = Math.min(foodCount, drinkCount);
    const autoDiscount = setPairs * 100;

    const totalDiscount = autoDiscount + manualDiscount;
    const finalTotal = Math.max(0, subtotal - totalDiscount);
    const change = cash !== '' ? Number(cash) - finalTotal : null;

    return { entries, subtotal, setPairs, autoDiscount, manualDiscount, totalDiscount, finalTotal, change };
  }

  function updateTotals() {
    const { entries, subtotal, setPairs, autoDiscount, totalDiscount, finalTotal, change } = calculateBill();

    document.querySelector('#subtotal-val').textContent = money(subtotal);
    
    const labelEl = document.querySelector('#auto-discount-label');
    if (labelEl) {
      labelEl.textContent = setPairs > 0 ? `セット割 (${setPairs}組)` : 'セット割 (食べ物+飲み物)';
    }

    document.querySelector('#auto-discount-val').textContent = `-¥${autoDiscount.toLocaleString()}`;
    document.querySelector('#total-discount-val').textContent = `-¥${totalDiscount.toLocaleString()}`;
    document.querySelector('#total-val').textContent = money(finalTotal);
    document.querySelector('#cash-val').textContent = cash === '' ? '—' : money(cash);
    document.querySelector('#change-val').textContent = change === null ? '—' : (change < 0 ? '不足' : money(change));

    const btn = document.querySelector('#to-seat');
    btn.disabled = (!entries.length || change === null || change < 0 || cash === '');
  }

  let syncTimer;
  function sync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const { finalTotal, change } = calculateBill();
      const items = products.filter(p => cart[p.id]).map(p => ({ name: p.name, price: p.price, quantity: cart[p.id] }));
      api('updateDisplay', {
        operator: operator(),
        display: {
          phase: 'checkout',
          items,
          total: finalTotal,
          cash: Number(cash || 0),
          change: change || 0
        }
      }).catch(showError);
    }, 250);
  }

  async function chooseSeat() {
    try {
      const seats = await api('getSeats');
      const free = seats.filter(s => s.status === '空席');
      if (!free.length) throw new Error('空席がありません');
      const html = `<div class="grid">${free.map(s => `<button class="btn vacant seat-choice" data-seat="${s.number}">席 ${s.number}</button>`).join('')}</div>`;
      const d = document.createElement('dialog');
      d.innerHTML = `<h2>座席を選択</h2>${html}<button class="btn cancel" style="margin-top:15px">キャンセル</button>`;
      document.body.append(d);
      d.showModal();
      d.querySelector('.cancel').onclick = () => { d.close(); d.remove(); };
      d.querySelectorAll('.seat-choice').forEach(b => b.onclick = async () => {
        const seat = Number(b.dataset.seat);
        b.disabled = true;
        try {
          const { finalTotal, totalDiscount } = calculateBill();
          const items = products.filter(p => cart[p.id]).map(p => ({ productId: p.id, quantity: cart[p.id] }));
          
          const result = await api('createOrder', {
            operator: operator(),
            seatNumber: seat,
            cash: Number(cash),
            items,
            discount: totalDiscount
          });

          d.close();
          d.remove();
          alert(`注文番号 #${result.orderNumber} を確定しました\n合計: ¥${finalTotal.toLocaleString()} (おつり: ¥${result.change.toLocaleString()})`);
          cart = {};
          cash = '';
          manualDiscount = 0;
          document.querySelector('#cash').value = '';
          document.querySelector('#manual-discount').value = '';
          const refreshed = await api('getRegisterData');
          products = refreshed.products;
          drawProductsAndCart();
          updateTotals();
        } catch (e) {
          b.disabled = false;
          showError(e);
        }
      });
    } catch (e) {
      showError(e);
    }
  }

  renderSkeleton();
  drawProductsAndCart();
  updateTotals();
  sync();
}

// -------------------------------------------------------------
// 3. 厨房画面（シンプルなチェックボックスのみ）
// -------------------------------------------------------------
async function kitchenPage(){
  app.innerHTML = pageShell(page, `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>厨房（提供待ち）</h1>
      <button id="refresh" class="btn">更新</button>
    </div>
    <div id="kitchen-orders" style="margin-top:16px;"></div>
  `);

  const checkedKeys = new Set();

  async function load(){
    try {
      const orders = await api('getKitchenOrders');
      const el = document.querySelector('#kitchen-orders');
      if(!orders.length) {
        el.innerHTML = '<p class="empty">提供待ちの注文はありません</p>';
        return;
      }

      el.innerHTML = `<div class="grid">${orders.map(o => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2 style="margin:0;">#${o.orderNumber} (席 ${o.seatNumber})</h2>
            <span style="font-size:0.9em;color:#666;">${o.orderedAt ? new Date(o.orderedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</span>
          </div>

          <div style="margin: 12px 0;">
            ${o.items.map((i, idx) => {
              const itemKey = `${o.orderNumber}-${i.productId || idx}`;
              const isChecked = checkedKeys.has(itemKey) ? 'checked' : '';
              return `
                <label style="display:flex;align-items:center;gap:10px;padding:8px 0;font-size:1.05em;cursor:pointer;">
                  <input type="checkbox" class="kitchen-chk" data-key="${itemKey}" ${isChecked} style="width:22px;height:22px;cursor:pointer;">
                  <span><strong>${escapeHtml(i.name)}</strong> × ${i.quantity}</span>
                </label>
              `;
            }).join('')}
          </div>

          <button class="btn primary serve" data-order="${o.orderNumber}" style="width:100%;margin-top:8px">提供完了</button>
        </div>
      `).join('')}</div>`;

      // チェック状態を保持
      el.querySelectorAll('.kitchen-chk').forEach(chk => {
        chk.onchange = () => {
          const key = chk.dataset.key;
          if (chk.checked) {
            checkedKeys.add(key);
          } else {
            checkedKeys.delete(key);
          }
        };
      });

      // 提供完了
      el.querySelectorAll('.serve').forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            const orderNum = Number(b.dataset.order);
            await api('serveOrder', { operator: operator(), orderNumber: orderNum });
            for (const k of Array.from(checkedKeys)) {
              if (k.startsWith(`${orderNum}-`)) checkedKeys.delete(k);
            }
            load();
          } catch(e) {
            b.disabled = false;
            showError(e);
          }
        };
      });
    } catch(e) {
      showError(e);
    }
  }

  document.querySelector('#refresh').onclick = load;
  load();
  setInterval(load, 10000);
}

// -------------------------------------------------------------
// 4. 座席管理画面
// -------------------------------------------------------------
async function seatsPage(){
  app.innerHTML = pageShell(page, `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>座席管理</h1>
      <button id="refresh" class="btn">更新</button>
    </div>
    <div id="seat-grid" class="grid" style="margin-top:16px;"></div>
  `);

  async function load(){
    try {
      const seats = await api('getSeats');
      const el = document.querySelector('#seat-grid');
      el.innerHTML = seats.map(s => {
        const cls = s.status === '空席' ? 'vacant' : (s.status === '提供待ち' ? 'waiting' : 'served');
        return `
          <div class="card seat-box ${cls}">
            <h2>席 ${s.number}</h2>
            <p>状態: <strong>${s.status}</strong></p>
            ${s.orderNumber ? `<p>注文: #${s.orderNumber}</p>` : '<p>—</p>'}
            <button class="btn clear-seat" data-seat="${s.number}" ${s.status === '空席' ? 'disabled' : ''} style="width:100%;margin-top:8px">空席にする</button>
          </div>
        `;
      }).join('');

      el.querySelectorAll('.clear-seat').forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          try {
            await api('clearSeat', { operator: operator(), seatNumber: Number(b.dataset.seat) });
            load();
          } catch(e) {
            b.disabled = false;
            showError(e);
          }
        };
      });
    } catch(e) {
      showError(e);
    }
  }

  document.querySelector('#refresh').onclick = load;
  load();
  setInterval(load, 15000);
}

// -------------------------------------------------------------
// 5. 注文履歴画面
// -------------------------------------------------------------
async function historyPage(){
  app.innerHTML = pageShell(page, `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h1>提供済み 注文履歴</h1>
      <button id="refresh-history" class="btn">更新</button>
    </div>
    <div id="history-container" style="margin-top:16px;">読み込み中...</div>
  `);

  async function loadHistory() {
    const container = document.querySelector('#history-container');
    try {
      const orders = await api('getOrderHistory');
      if (!orders.length) {
        container.innerHTML = '<p class="empty">提供済みの注文履歴はありません</p>';
        return;
      }

      container.innerHTML = `
        <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
          ${orders.map(o => `
            <div class="card" style="border-left: 5px solid #2e7d32;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <h3 style="margin:0;">#${o.orderNumber} (席 ${o.seatNumber})</h3>
                <span style="font-size:0.85em;color:#666;">${o.servedAt ? new Date(o.servedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''} 提供</span>
              </div>
              <ul style="margin: 10px 0; padding-left: 20px; font-size: 0.95em;">
                ${o.items.map(it => `<li>${escapeHtml(it.name)} × ${it.quantity}</li>`).join('')}
              </ul>
              <div style="display:flex;justify-content:space-between;font-size:0.9em;color:#555;border-top:1px dashed #ccc;padding-top:8px;">
                <span>合計: <b>${money(o.total)}</b></span>
                <span>担当: ${escapeHtml(o.operator)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      showError(e);
      container.innerHTML = '<p class="empty" style="color:red;">履歴の取得に失敗しました</p>';
    }
  }

  document.querySelector('#refresh-history').onclick = loadHistory;
  loadHistory();
}

// -------------------------------------------------------------
// 6. 管理画面（区分設定・リセット機能付き）
// -------------------------------------------------------------
async function adminPage(){
  const data = await api('getAdminData');
  let products = data.products;

  function render(){
    app.innerHTML = pageShell(page, `
      <h1>管理</h1>
      <div class="grid">
        <section class="card">
          <h2>商品管理</h2>
          <div style="font-size:0.8em;color:#666;display:flex;gap:10px;margin-bottom:8px;padding:0 5px;">
            <span style="flex:2;">商品名</span>
            <span style="flex:1;">区分</span>
            <span style="width:70px;">価格</span>
            <span style="width:60px;">在庫</span>
            <span style="width:60px;"></span>
          </div>
          <div class="products-edit">
            ${products.map(p=>`
              <div class="field product-row" data-id="${p.id}" style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                <input class="p-name" value="${escapeHtml(p.name)}" style="flex:2;padding:6px;">
                <select class="p-category" style="flex:1;padding:6px;">
                  <option value="食べ物" ${p.category === '食べ物' ? 'selected' : ''}>食べ物</option>
                  <option value="飲み物" ${p.category === '飲み物' ? 'selected' : ''}>飲み物</option>
                  <option value="その他" ${p.category === 'その他' ? 'selected' : ''}>その他</option>
                </select>
                <input class="p-price" type="number" min="0" value="${p.price}" style="width:70px;padding:6px;">
                <input class="p-stock" type="number" min="0" value="${p.stock}" style="width:60px;padding:6px;">
                <button class="btn save-prod" style="padding:6px 10px;">保存</button>
              </div>
            `).join('')}
          </div>
          <div class="actions" style="margin-top:15px">
            <button id="add-prod" class="btn primary">＋ 新規商品追加</button>
          </div>
        </section>

        <div>
          <section class="card">
            <h2>座席数設定</h2>
            <div class="field inline">
              <label>総座席数</label>
              <input id="seat-count" type="number" min="1" max="100" value="${data.seatCount}" style="max-width:100px">
              <button id="save-seats" class="btn primary">更新</button>
            </div>
          </section>

          <section class="card" style="margin-top:20px; border-top: 4px solid #d32f2f;">
            <h2 style="color:#d32f2f;">危険な操作</h2>
            <p style="font-size:0.9em;color:#666;margin-bottom:12px;">注文データ・売上・座席状況をすべてリセットし、注文番号を1に戻します（商品データは残ります）。</p>
            <button id="btn-reset-all" class="btn" style="background:#d32f2f;color:#fff;width:100%;">全データをリセット（初期化）</button>
          </section>
        </div>
      </div>
    `);

    document.querySelectorAll('.save-prod').forEach(b => {
      b.onclick = async () => {
        const row = b.closest('.product-row');
        try {
          await api('saveProduct', {
            operator: operator(),
            id: row.dataset.id,
            name: row.querySelector('.p-name').value,
            category: row.querySelector('.p-category').value,
            price: Number(row.querySelector('.p-price').value),
            stock: Number(row.querySelector('.p-stock').value)
          });
          alert('商品を更新しました');
        } catch (e) { showError(e); }
      };
    });

    document.querySelector('#add-prod').onclick = async () => {
      const name = prompt('商品名を入力してください');
      if (!name) return;
      const catInput = prompt('区分を入力してください（1: 食べ物, 2: 飲み物, 3: その他）', '1');
      const category = catInput === '2' ? '飲み物' : (catInput === '3' ? 'その他' : '食べ物');
      const price = Number(prompt('価格を入力してください', '100'));
      const stock = Number(prompt('初期在庫数を入力してください', '50'));

      try {
        await api('saveProduct', { operator: operator(), name, category, price, stock });
        const refreshed = await api('getAdminData');
        products = refreshed.products;
        render();
      } catch (e) { showError(e); }
    };

    document.querySelector('#save-seats').onclick = async () => {
      const count = Number(document.querySelector('#seat-count').value);
      try {
        await api('setSeatCount', { operator: operator(), count });
        alert('座席数を変更しました');
      } catch (e) { showError(e); }
    };

    document.querySelector('#btn-reset-all').onclick = async () => {
      const ok1 = confirm('【警告】すべての注文・売上・座席データが完全に消去されます。本当によろしいですか？');
      if (!ok1) return;
      const ok2 = confirm('注文番号も #1 に戻ります。本当にリセットを実行しますか？');
      if (!ok2) return;

      try {
        const btn = document.querySelector('#btn-reset-all');
        btn.disabled = true;
        btn.textContent = '初期化中...';
        await api('resetAllData', { operator: operator() });
        alert('すべてのデータを初期化しました！');
        location.reload();
      } catch (e) {
        showError(e);
        document.querySelector('#btn-reset-all').disabled = false;
        document.querySelector('#btn-reset-all').textContent = '全データをリセット（初期化）';
      }
    };
  }

  render();
}

// -------------------------------------------------------------
// 7. お客さま向け表示画面
// -------------------------------------------------------------
async function customerPage(){
  app.innerHTML = pageShell(page, `<div id="customer-view" class="customer-box"></div>`);

  async function poll(){
    try {
      const d = await api('getDisplay');
      const el = document.querySelector('#customer-view');
      if (d.phase === 'complete') {
        el.innerHTML = `
          <div class="display-complete">
            <p class="display-title">ご注文ありがとうございました</p>
            <div class="display-order-num">注文番号: #${d.orderNumber}</div>
            <div class="display-seat-num">お席: <strong>席 ${d.seatNumber}</strong></div>
          </div>
        `;
      } else if (d.phase === 'checkout') {
        el.innerHTML = `
          <div class="display-checkout">
            <h2>現在のお会計</h2>
            <div class="display-items">${(d.items||[]).map(i=>`<div class="display-row"><span>${escapeHtml(i.name)} × ${i.quantity}</span><b>${money(i.price*i.quantity)}</b></div>`).join('')}</div>
            <div class="display-totals">
              <div class="display-row big"><span>合計</span><strong>${money(d.total)}</strong></div>
              <div class="display-row"><span>お預かり</span><span>${money(d.cash)}</span></div>
              <div class="display-row"><span>おつり</span><span>${money(d.change)}</span></div>
            </div>
          </div>
        `;
      } else {
        el.innerHTML = `
          <div class="display-idle">
            <h1>いらっしゃいませ</h1>
            <p>ご注文をうかがいます</p>
          </div>
        `;
      }
    } catch(e){}
  }

  poll();
  setInterval(poll, 3000);
}

// -------------------------------------------------------------
// ページ振り分け実行
// -------------------------------------------------------------
const routers = {
  home: homePage,
  register: registerPage,
  kitchen: kitchenPage,
  seats: seatsPage,
  history: historyPage,
  admin: adminPage,
  customer: customerPage
};

(routers[page] || homePage)();
