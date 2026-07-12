(function () {
  'use strict';

  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || !window.isSecureContext) return;

  const status = document.querySelector('#pwa-status');
  const update = document.querySelector('#pwa-update');
  const refresh = document.querySelector('#pwa-refresh');
  const dismiss = document.querySelector('#pwa-dismiss');
  let registration;
  let refreshing = false;

  function renderNetworkStatus() {
    status.hidden = navigator.onLine;
    status.textContent = navigator.onLine ? '' : '当前处于离线状态：计算和本地数据仍可使用，行情暂时无法刷新。';
  }

  function showUpdate(worker) {
    if (!worker) return;
    update.hidden = false;
    refresh.onclick = () => worker.postMessage({ type: 'SKIP_WAITING' });
  }

  window.addEventListener('online', renderNetworkStatus);
  window.addEventListener('offline', renderNetworkStatus);
  dismiss.addEventListener('click', () => { update.hidden = true; });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    renderNetworkStatus();
    try {
      registration = await navigator.serviceWorker.register('./service-worker.js');
      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
    } catch (error) {
      console.warn('离线应用注册失败，仍可继续使用网页版。', error);
    }
  });
})();
