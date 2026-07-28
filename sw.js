/* Service Worker — オフラインでも遊べるようにする
 *
 * 方針：
 *  - ページ本体（ナビゲーション）は「ネット優先」。新しい版を出したら次の起動で必ず反映される
 *  - アイコンなどの静的ファイルは「キャッシュ優先」。表示が速い
 *  - CACHE の名前を変えると古いキャッシュは自動で消える
 */
 * assets/ に置くキャラ画像やオープニング動画は、ここに列挙しない。
 * 下の「キャッシュ優先」の分岐が、一度読み込んだ時点で自動的にキャッシュへ載せる。
 * 先に全部落とすと初回インストールが重くなるため、あえて後乗せにしている。
 */
const CACHE = 'slipper-wario-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  /* ページ本体：ネット優先、失敗したらキャッシュ（＝オフライン） */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  /* それ以外：キャッシュ優先 */
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
