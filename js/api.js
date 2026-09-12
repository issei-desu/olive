// ==========================================
// GitHub data.json API サーバー連携モジュール
// ==========================================
const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'olive';
const GITHUB_FILE_PATH = 'data.json';

// トークンはブラウザのLocalStorageに保存（GitHubへ公開されない安全な方法）
function getGithubToken() {
  let token = localStorage.getItem('olive_gh_token');
  if (!token) {
    token = prompt('GitHub Personal Access Token (ghp_...) を入力してください:');
    if (token && token.trim()) {
      token = token.trim();
      localStorage.setItem('olive_gh_token', token);
    } else {
      throw new Error('GitHubトークンが設定されていません');
    }
  }
  return token;
}

let cachedSha = null;

// GitHub から最新の data.json を取得
async function fetchDb() {
  const token = getGithubToken();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=main&t=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`
    }
  });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('olive_gh_token');
      throw new Error('トークンが無効です。再読み込みして正しいトークンを入力してください');
    }
    throw new Error('データの取得に失敗しました (GitHub通信エラー)');
  }
  const data = await res.json();
  cachedSha = data.sha;

  // UTF-8 デコード（日本語対応）
  const content = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
  return JSON.parse(content);
}

// GitHub の data.json に保存（コミット）
async function saveDb(db, message = 'Update data.json via POS') {
  const token = getGithubToken();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
  const utf8Bytes = unescape(encodeURIComponent(JSON.stringify(db, null, 2)));
  const contentBase64 = btoa(utf8Bytes);

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: message,
      content: contentBase64,
      sha: cachedSha,
      branch: 'main'
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'データ保存に失敗しました');
  }
  const result = await res.json();
  cachedSha = result.content.sha;
  return true;
}

// ==========================================
// 各ページ共通 API インターフェース
// ==========================================
async function api(action, payload = {}) {
  const db = await fetchDb();

  // 1. レジ画面用データ
  if (action === 'getRegisterData') {
    return { products: (db.products || []).filter(p => p.active) };
  }

  // 2. 座席一覧
  if (action === 'getSeats') {
    return db.seats || [];
  }

  // 3. 厨房の提供待ち一覧
  if (action === 'getKitchenOrders') {
    return (db.orders || []).filter(o => o.status === '提供待ち').sort((a, b) => a.orderNumber - b.orderNumber);
  }

  // 4. 提供済み注文履歴
  if (action === 'getOrderHistory') {
    return (db.orders || []).filter(o => o.status === '提供済み').slice(-50).reverse();
  }

  // 5. 管理画面用データ
  if (action === 'getAdminData') {
    return {
      products: db.products || [],
      seatCount: (db.seats || []).length
    };
  }

  // 6. 客席ディスプレイ情報
  if (action === 'getDisplay') {
    return (db.settings && db.settings.display) || { phase: 'idle' };
  }

  // 7. 客席ディスプレイ更新
  if (action === 'updateDisplay') {
    if (!db.settings) db.settings = {};
    db.settings.display = payload.display;
    await saveDb(db, `Update display by ${payload.operator}`);
    return true;
  }

  // 8. 注文作成
  if (action === 'createOrder') {
    if (!db.settings) db.settings = {};
    const orderNum = Number(db.settings.nextOrderNumber || 1);
    db.settings.nextOrderNumber = orderNum + 1;
    const now = new Date().toISOString();

    // 在庫引き落とし
    payload.items.forEach(item => {
      const p = db.products.find(x => x.id === item.productId);
      if (p) {
        if (p.stock < item.quantity) {
          throw new Error(`${p.name} の在庫が不足しています`);
        }
        p.stock -= item.quantity;
      }
    });

    // 席状態の更新
    const seat = db.seats.find(s => s.number === payload.seatNumber);
    if (seat) {
      if (seat.status !== '空席') {
        throw new Error(`席 ${payload.seatNumber} は空席ではありません`);
      }
      seat.status = '提供待ち';
      seat.orderNumber = orderNum;
      seat.orderedAt = now;
    }

    // 注文詳細
    const itemRows = payload.items.map(item => {
      const p = db.products.find(x => x.id === item.productId);
      return {
        productId: item.productId,
        name: p ? p.name : '',
        price: p ? p.price : 0,
        quantity: item.quantity,
        subtotal: (p ? p.price : 0) * item.quantity
      };
    });

    const subtotal = itemRows.reduce((s, i) => s + i.subtotal, 0);
    const discount = Number(payload.discount || 0);
    const total = Math.max(0, subtotal - discount);
    const change = Number(payload.cash) - total;

    if (!Array.isArray(db.orders)) db.orders = [];
    db.orders.push({
      orderNumber: orderNum,
      seatNumber: payload.seatNumber,
      orderedAt: now,
      status: '提供待ち',
      total: total,
      cash: Number(payload.cash),
      change: change,
      operator: payload.operator,
      servedAt: null,
      items: itemRows
    });

    db.settings.display = { phase: 'complete', orderNumber: orderNum, seatNumber: payload.seatNumber };
    await saveDb(db, `Create Order #${orderNum} by ${payload.operator}`);
    return { orderNumber: orderNum, total, change };
  }

  // 9. 厨房：提供完了
  if (action === 'serveOrder') {
    const order = (db.orders || []).find(o => o.orderNumber === Number(payload.orderNumber));
    if (order) {
      order.status = '提供済み';
      order.servedAt = new Date().toISOString();
    }
    const seat = (db.seats || []).find(s => s.orderNumber === Number(payload.orderNumber));
    if (seat) {
      seat.status = '提供済み';
    }
    await saveDb(db, `Serve Order #${payload.orderNumber} by ${payload.operator}`);
    return true;
  }

  // 10. 座席管理：空席化
  if (action === 'clearSeat') {
    const seat = (db.seats || []).find(s => s.number === Number(payload.seatNumber));
    if (seat) {
      seat.status = '空席';
      seat.orderNumber = null;
      seat.orderedAt = null;
    }
    await saveDb(db, `Clear seat #${payload.seatNumber} by ${payload.operator}`);
    return true;
  }

  // 11. 管理画面：商品保存
  if (action === 'saveProduct') {
    if (!Array.isArray(db.products)) db.products = [];
    if (payload.id) {
      const p = db.products.find(x => x.id === payload.id);
      if (p) {
        p.name = payload.name;
        p.category = payload.category;
        p.price = Number(payload.price);
        p.stock = Number(payload.stock);
      }
    } else {
      db.products.push({
        id: 'p_' + Date.now(),
        name: payload.name,
        category: payload.category || '食べ物',
        price: Number(payload.price),
        stock: Number(payload.stock),
        active: true
      });
    }
    await saveDb(db, `Save product ${payload.name} by ${payload.operator}`);
    return true;
  }

  // 12. 管理画面：総座席数変更
  if (action === 'setSeatCount') {
    const count = Number(payload.count);
    if (!Array.isArray(db.seats)) db.seats = [];
    const current = db.seats.length;
    if (count > current) {
      for (let n = current + 1; n <= count; n++) {
        db.seats.push({ number: n, status: '空席', orderNumber: null, orderedAt: null });
      }
    } else if (count < current) {
      db.seats = db.seats.slice(0, count);
    }
    await saveDb(db, `Set seat count to ${count}`);
    return db.seats;
  }

  // 13. 管理画面：データ初期化（リセット）
  if (action === 'resetAllData') {
    db.orders = [];
    (db.seats || []).forEach(s => {
      s.status = '空席';
      s.orderNumber = null;
      s.orderedAt = null;
    });
    if (!db.settings) db.settings = {};
    db.settings.nextOrderNumber = 1;
    db.settings.display = { phase: 'idle' };
    await saveDb(db, `Reset all data by ${payload.operator}`);
    return true;
  }

  throw new Error(`未対応のアクション: ${action}`);
}
