const routes = [
  ['home', 'ホーム'],
  ['register', 'レジ'],
  ['kitchen', '厨房'],
  ['seats', '座席'],
  ['history', '履歴'],
  ['admin', '管理'],
  ['customer', 'お客さま']
];

function pageShell(page, content) {
  return `<header class="header"><div class="header-inner"><a class="brand" href="./">文化祭レジ</a><nav class="nav">${routes.map(([id,label])=>`<a class="${page===id?'active':''}" href="${id==='home'?'./':'./'+id+'.html'}">${label}</a>`).join('')}</nav><span class="operator">担当: ${escapeHtml(operator())}</span></div></header><main class="container ${page==='customer'?'customer':''}">${content}</main>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(n) {
  return '¥' + Number(n || 0).toLocaleString();
}

function operator() {
  let op = localStorage.getItem('olive_operator');
  while (!op || !op.trim()) {
    op = prompt('担当者名を入力してください');
    if (op && op.trim()) {
      localStorage.setItem('olive_operator', op.trim());
      break;
    }
  }
  return localStorage.getItem('olive_operator');
}

function showError(err) {
  const msg = err && err.message ? err.message : String(err);
  let el = document.querySelector('#global-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-error';
    el.className = 'error';
    document.body.prepend(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}
