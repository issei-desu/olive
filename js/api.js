// ご自身のデプロイURLとAPI_SECRETに書き換えてください
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzuDpH6esQ_3-jdQD-W0p_5NCsf_-7-wHPc520MCWAaroWd9a71t6TgDIjv86hUE3YIZw/exec';
const API_SECRET = '20061127';

export async function api(action, payload = {}) {
  const postData = {
    action,
    secret: API_SECRET,
    ...payload
  };

  try {
    // ブラウザから直接GASへ送信する際、CORS制限を回避するため text/plain で送信します
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(postData)
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('サーバーから不正な応答がありました');
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || '通信に失敗しました');
    }

    return data.data;
  } catch (err) {
    throw err;
  }
}
