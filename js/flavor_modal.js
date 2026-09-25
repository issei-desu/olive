function promptFlavorSelection(product, callback) {
  if (!product.flavors || product.flavors.length === 0) {
    return callback(null);
  }

  const old = document.getElementById('flavorModal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'flavorModal';
  modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;";

  let buttonsHtml = product.flavors.map(flavor => `
    <button class="flavor-btn" data-flavor="${flavor}" style="padding: 12px 18px; margin: 6px; font-size: 16px; border: 2px solid #2E7D32; background: white; border-radius: 8px; cursor: pointer; font-weight: bold; color: #2E7D32;">${flavor}</button>
  `).join('');

  modal.innerHTML = `
    <div style="background: white; padding: 22px; border-radius: 12px; width: 90%; max-width: 360px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.2);">
      <h3 style="margin-top: 0; color: #333;">${product.name} の味を選択</h3>
      <div style="display: flex; flex-wrap: wrap; justify-content: center; margin: 15px 0;">
        ${buttonsHtml}
      </div>
      <button id="cancelFlavorBtn" style="padding: 8px 18px; background: #888; color: white; border: none; border-radius: 6px; cursor: pointer;">キャンセル</button>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('.flavor-btn').forEach(btn => {
    btn.onclick = () => {
      const selected = btn.dataset.flavor;
      modal.remove();
      callback(selected);
    };
  });

  document.getElementById('cancelFlavorBtn').onclick = () => {
    modal.remove();
  };
}
