const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');

test('PWA manifest 与 iOS 元数据完整', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(manifest.name, 'ETF Rebalance');
  assert.equal(manifest.short_name, 'ETF Rebalance');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.theme_color, '#17231f');
  assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ['192x192', '512x512', '180x180']);
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#17231f">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="ETF Rebalance">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
});

function pngSize(path) {
  const bytes = fs.readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('PWA 图标尺寸正确', () => {
  assert.deepEqual(pngSize('icons/icon-192.png'), [192, 192]);
  assert.deepEqual(pngSize('icons/icon-512.png'), [512, 512]);
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});

test('Service Worker 版本化缓存应用外壳且不缓存跨域行情', () => {
  const sw = fs.readFileSync('service-worker.js', 'utf8');
  for (const path of ['./index.html', './styles.css', './calculator.js', './quotes.js', './app.js', './pwa.js', './manifest.webmanifest']) {
    assert.match(sw, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sw, /etf-rebalance-shell-v2/);
  assert.match(sw, /cache\.addAll\(APP_SHELL\)/);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(sw, /request\.mode === 'navigate'/);
  assert.match(sw, /caches\.match\('\.\/index\.html'\)/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /fetch\(request\)/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /self\.skipWaiting\(\)/);
});

test('页面提供离线和更新提示并安全注册 Service Worker', () => {
  const pwa = fs.readFileSync('pwa.js', 'utf8');
  assert.match(html, /id="pwa-status"/);
  assert.match(html, /id="pwa-update"/);
  assert.match(html, /id="pwa-refresh"/);
  assert.match(html, /<script src="pwa\.js"><\/script>/);
  assert.match(pwa, /'serviceWorker' in navigator/);
  assert.match(pwa, /location\.protocol === 'file:'/);
  assert.match(pwa, /window\.isSecureContext/);
  assert.match(pwa, /register\('\.\/service-worker\.js'\)/);
  assert.match(pwa, /postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(pwa, /controllerchange/);
  assert.match(pwa, /refreshing/);
});

test('离线时行情刷新会给出中文提示', () => {
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(app, /navigator\.onLine === false/);
  assert.match(app, /当前处于离线状态，无法刷新行情/);
});
