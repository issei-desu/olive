const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzuDpH6esQ_3-jdQD-W0p_5NCsf_-7-wHPc520MCWAaroWd9a71t6TgDIjv86hUE3YIZw/exec';
const API_SECRET = '20061127';

async function api(action, payload = {}) {
  const postData = {
    action,
    secret: API_SECRET,
    ...payload
  };

  try {
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

    if (!data.ok) {
      throw new Error(data.error || '通信エラーが発生しました');
    }

    return data.data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}
