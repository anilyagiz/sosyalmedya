const LABELS = {
  postgres: 'Veritabanı',
  redis: 'Önbellek',
  temporal: 'Zamanlayıcı',
  database: 'Tablolar',
  backend: 'Sunucu',
  orchestrator: 'Gönderi motoru',
  frontend: 'Arayüz',
};
const ORDER = Object.keys(LABELS);
const ICON = { starting: '⏳', restarting: '🔁', ready: '✅', error: '❌' };

const $ = (id) => document.getElementById(id);

function render(state) {
  $('message').textContent = state.message;
  const services = state.services || {};
  const ready = ORDER.filter((k) => services[k] && services[k].state === 'ready').length;
  const bar = $('bar');
  bar.firstElementChild.style.width = `${Math.round((ready / ORDER.length) * 100)}%`;
  bar.hidden = state.phase === 'ready' || state.phase === 'error';

  $('services').innerHTML = '';
  for (const key of ORDER) {
    const s = services[key];
    const li = document.createElement('li');
    li.className = s ? s.state : 'waiting';
    li.textContent = `${s ? ICON[s.state] || '•' : '•'}  ${LABELS[key]}`;
    $('services').appendChild(li);
  }

  $('open').hidden = state.phase !== 'ready';
  $('retry').hidden = state.phase !== 'error';
  $('hint').textContent =
    state.phase === 'ready'
      ? 'Bu pencereyi kapatabilirsiniz; sosyalmedya sağ alttaki simgede çalışmaya devam eder ve gönderilerinizi zamanında paylaşır.'
      : state.phase === 'error'
      ? 'Bir sorun oldu. "Tekrar dene"ye basın; düzelmezse bilgisayarı yeniden başlatıp sosyalmedya\'yı tekrar açın.'
      : 'İlk açılış birkaç dakika sürebilir. Hazır olunca uygulama tarayıcınızda kendiliğinden açılır.';
  document.body.dataset.phase = state.phase;
}

$('open').onclick = () => window.sm.openApp();
$('retry').onclick = () => window.sm.retry();
$('settings').onclick = () => window.sm.openSettings();
$('logs').onclick = () => window.sm.openLogs();
$('about').onclick = () => window.sm.about();

window.sm.onState(render);
window.sm.getState().then(render);
