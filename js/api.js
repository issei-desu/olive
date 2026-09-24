// ==========================================
// GitHub data.json & Excel 自動同期モジュール
// ==========================================
const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'olive';
const GITHUB_FILE_PATH = 'data.json';
const GITHUB_EXCEL_PATH = 'sales_log.xlsx';

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
let cachedExcelSha = null;

// SheetJS ライブラリの動的ロード
function ensureXLSX() {
  return new Promise((resolve) => {
    if (window.XLSX) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

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
      throw new Error('トークンが無効です。再読み込みして再入力してください');
    }
    throw new Error('データ取得に失敗しました (GitHub通信エラー)');
  }
  const data = await res.json();
  cachedSha = data.sha;

  const content = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
  return JSON.parse(content);
}

// バックグラウンドで Excel (sales_log.xlsx) を生成して GitHub に自動保存
async function syncExcelLog(orders, token) {
  try {
    await ensureXLSX();
    if (!window.XLSX || !orders) return;

    // Excel SHAの取得（初回のみまたは存在確認）
    if (!cachedExcelSha) {
      try {
        const getRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_EXCEL_PATH}?ref=main`, {
          headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
        });
        if (getRes.ok) {
          const fileInfo = await getRes.json();
          cachedExcelSha = fileInfo.sha;
        }
      } catch (e) {}
    }

    // 1. 「注文一覧」シート用データ
    const orderRows = [
      ["注文番号", "席番号", "注文日時", "商品内訳", "小計 (円)", "割引 (円)", "支払合計 (円)", "預かり金 (円)", "おつり (円)", "状態", "担当者"]
    ];

    // 2. 「明細一覧」シート用データ（商品ごと1行）
    const itemRows = [
      ["注文番号", "席番号", "日時", "商品名", "単価 (円)", "数量", "小計 (円)", "担当者"]
    ];

    orders.forEach(o => {
      const itemsSummary = (o.items || []).map(i => `${i.name}×${i.quantity}`).join(', ');
      const subtotal = (o.items || []).reduce((s, i) => s + (i.price * i.quantity), 0);
      const timeStr = o.orderedAt ? new Date(o.orderedAt).toLocaleString('ja-JP') : '';

      orderRows.push([
        `#${o.orderNumber}`,
        `席 ${o.seatNumber}`,
        timeStr,
        itemsSummary,
        subtotal,
        subtotal - (o.total || 0),
        o.total || 0,
        o.cash || 0,
        o.change || 0,
        o.status || '提供待ち',
        o.operator || ''
      ]);

      (o.items || []).forEach(i => {
        itemRows.push([
          `#${o.orderNumber}`,
          `席 ${o.seatNumber}`,
          timeStr,
          i.name,
          i.price,
          i.quantity,
          i.price * i.quantity,
          o.operator || ''
        ]);
      });
    });

    const wb = XLSX.utils.book_new();
    const wsOrders = XLSX.utils.aoa_to_sheet(orderRows);
    const wsItems = XLSX.utils.aoa_to_sheet(itemRows);

    XLSX.utils.book_append_sheet(wb, wsOrders, "注文サマリー");
    XLSX.utils.book_append_sheet(wb, wsItems, "商品別明細ログ");

    // バイナリ (Base64) 変換
    const b64Excel = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

    // GitHub へ PUT
    const putRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_EXCEL_PATH}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Auto-sync sales log to Excel via POS',
        content: b64Excel,
        sha: cachedExcelSha,
        branch: 'main'
      })
    });

    if (putRes.ok) {
      const putData = await putRes.json();
      cachedExcelSha = putData.content.sha;
    }
  } catch (err) {
    console.warn('バックグラウンドExcel同期エラー (処理は継続します):', err);
  }
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

  // 注文データの更新があれば、裏側でバックグラウンドExcel同期を実行（待たせない）
  if (db.orders && Array.isArray(db.orders)) {
    syncExcelLog(db.orders, token);
  }

  return true;
}

// ==========================================
// 共通 API インターフェース
// ==========================================
async function api(action, payload = {}) {
  const db = await fetchDb();

  if (action === 'getRegisterData') {
    return { products: (db.products || []).filter(p => p.active) };
  }
  if (action === 'getSeats') {
    return db.seats || [];
  }
  if (action === 'getKitchenOrders') {
    return (db.orders || []).filter(o => o.status === '提供待ち').sort((a, b) => a.orderNumber - b.orderNumber);
  }
  if (action === 'getOrderHistory') {
    return (db.orders || []).filter(o => o.status === '提供済み').slice(-50).reverse();
  }
  if (action === 'getAdminData') {
    return {
      products: db.products || [],
      seatCount: (db.seats || []).length
    };
  }
  if (action === 'getDisplay') {
    return (db.settings && db.settings.display) || { phase: 'idle' };
  }
  if (action === 'updateDisplay') {
    if (!db.settings) db.settings = {};
    db.settings.display = payload.display;
    await saveDb(db, `Update display by ${payload.operator}`);
    return true;
  }

  if (action === 'createOrder') {
    if (!db.settings) db.settings = {};
    const orderNum = Number(db.settings.nextOrderNumber || 1);
    db.settings.nextOrderNumber = orderNum + 1;
    const now = new Date().toISOString();

    payload.items.forEach(item => {
      const p = db.products.find(x => x.id === item.productId);
      if (p) {
        if (p.stock < item.quantity) throw new Error(`${p.name} の在庫が不足しています`);
        p.stock -= item.quantity;
      }
    });

    const seat = db.seats.find(s => s.number === payload.seatNumber);
    if (seat) {
      if (seat.status !== '空席') throw new Error(`席 ${payload.seatNumber} は空席ではありません`);
      seat.status = '提供待ち';
      seat.orderNumber = orderNum;
      seat.orderedAt = now;
    }

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

  if (action === 'serveOrder') {
    const order = (db.orders || []).find(o => o.orderNumber === Number(payload.orderNumber));
    if (order) {
      order.status = '提供済み';
      order.servedAt = new Date().toISOString();
    }
    const seat = (db.seats || []).find(s => s.orderNumber === Number(payload.orderNumber));
    if (seat) seat.status = '提供済み';
    await saveDb(db, `Serve Order #${payload.orderNumber} by ${payload.operator}`);
    return true;
  }

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
