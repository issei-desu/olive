const routes = [
  ['home','ホーム'],['register','レジ'],['admin','管理'],['kitchen','厨房'],['seats','座席'],['customer','お客さん表示']
];
export function pageShell(page, content) {
  return `<header class="header"><div class="header-inner"><a class="brand" href="./">文化祭レジ</a><nav class="nav">${routes.map(([id,label])=>`<a class="${page===id?'active':''}" href="./${id==='home'?'':id+'.html'}">${label}</a>`).join('')}</nav><span class="operator">担当: ${escapeHtml(operator())}</span></div></header><main class="container ${page==='customer'?'customer':''}">${content}</main>`;
}
export function operator() { return localStorage.getItem('operatorName') || ''; }
export function requireOperator() {
  if (operator()) return true;
  const dialog = document.createElement('dialog'); dialog.innerHTML = `<form method="dialog"><h2>担当者名を入力</h2><p>操作ログに記録されます。</p><div class="field"><input id="first-name" maxlength="30" autocomplete="name" required></div><button class="btn primary" value="ok">保存</button></form>`;
  document.body.append(dialog); dialog.showModal();
  dialog.addEventListener('close',()=>{ const name=dialog.querySelector('input').value.trim(); if(name){localStorage.setItem('operatorName',name);location.reload()}else dialog.showModal() }); return false;
}
export function setOperator(name) { localStorage.setItem('operatorName', name.trim()); }
export function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
export function money(value) { return `¥${Number(value||0).toLocaleString('ja-JP')}`; }
export function time(value) { if(!value)return '-'; return new Date(value).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}); }
export function statusClass(status) { return status==='空席'?'vacant':status==='提供待ち'?'waiting':'served'; }
export function showError(error) { const old=document.querySelector('.notice.error'); if(old)old.remove(); const el=document.createElement('div');el.className='notice error';el.textContent=error.message||error;document.querySelector('main')?.prepend(el); }
export function confirmDialog(title, html, confirmText='確定') { return new Promise(resolve=>{const d=document.createElement('dialog');d.innerHTML=`<h2>${escapeHtml(title)}</h2>${html}<div class="actions"><button class="btn primary yes">${escapeHtml(confirmText)}</button><button class="btn no">キャンセル</button></div>`;document.body.append(d);d.showModal();d.querySelector('.yes').onclick=()=>{d.close();d.remove();resolve(true)};d.querySelector('.no').onclick=()=>{d.close();d.remove();resolve(false)}}); }
