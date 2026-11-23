const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of children) node.append(c);
  return node;
}

async function load() {
  const s = await window.sm.getSettings();
  $('openAtLogin').checked = s.openAtLogin;
  const root = $('providers');
  root.innerHTML = '';
  for (const p of s.providers) {
    const filled = p.fields.every(([key]) => s.keys[key]);
    const summary = el('summary', {}, [p.name]);
    if (filled) summary.append(el('span', { className: 'ok', textContent: '✓ girildi' }));
    const body = [];

    if (!p.noCallback) {
      const ids = p.callback || [p.id];
      for (const id of ids) {
        const url = `${s.publicUrl}/integrations/social/${id}`;
        const copy = el('button', { textContent: 'Kopyala' });
        copy.onclick = () => {
          navigator.clipboard.writeText(url);
          copy.textContent = 'Kopyalandı';
          setTimeout(() => (copy.textContent = 'Kopyala'), 1500);
        };
        body.push(el('label', { textContent: 'Yönlendirme (callback) adresi' }));
        body.push(el('div', { className: 'callback' }, [el('code', { textContent: url }), copy]));
      }
    }

    for (const [key, label] of p.fields) {
      const secret = /SECRET|TOKEN|API_KEY/.test(key) && key !== 'X_API_KEY';
      body.push(el('label', { textContent: label, htmlFor: key }));
      body.push(
        el('input', {
          id: key,
          type: secret ? 'password' : 'text',
          value: s.keys[key] || '',
          autocomplete: 'off',
          spellcheck: false,
        })
      );
    }

    const help = el('button', { className: 'link', textContent: 'Geliştirici sayfasını aç' });
    help.onclick = () => window.sm.openUrl(p.help);
    body.push(help);

    root.append(el('details', {}, [summary, ...body]));
  }
}

$('save').onclick = async () => {
  const keys = {};
  for (const input of document.querySelectorAll('#providers input')) keys[input.id] = input.value;
  $('save').disabled = true;
  $('saved').textContent = 'Kaydediliyor, uygulama yeniden başlatılıyor (bir dakika kadar sürebilir)…';
  const res = await window.sm.saveSettings({ keys, openAtLogin: $('openAtLogin').checked });
  $('save').disabled = false;
  $('saved').textContent =
    res.restarted && !res.ok
      ? 'Kaydedildi ama yeniden başlatırken sorun oldu. Durum penceresine bakın.'
      : 'Kaydedildi ✓';
  load();
};

load();
