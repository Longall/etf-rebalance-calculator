(function () {
  'use strict';

  const STORAGE_KEY = 'etf-rebalance-calculator-v1';
  const $ = (selector) => document.querySelector(selector);
  const calculator = window.ETFCalculator;
  const quotes = window.ETFQuotes;
  const defaultSettings = {
    currentCash: 0,
    contribution: 5000,
    reserveCash: 0,
    minimumCommission: 0,
    commissionRate: 0.85,
    useCurrentCash: true,
    reduceTransactions: false,
  };
  let state = loadState();
  let latestPlan = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.assets) && saved.assets.length) {
        return {
          assets: saved.assets.map(normalizeAsset),
          settings: { ...defaultSettings, ...(saved.settings || {}) },
          history: Array.isArray(saved.history) ? saved.history : [],
        };
      }
    } catch (error) {
      console.warn('读取本地配置失败，已使用默认值。', error);
    }
    return { assets: calculator.cloneDefaults(), settings: { ...defaultSettings }, history: [] };
  }

  function normalizeAsset(item, index) {
    return {
      id: String(item.id || `asset-${Date.now()}-${index || 0}`),
      code: String(item.code || '').slice(0, 30),
      name: String(item.name || '').slice(0, 80),
      quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
      price: Math.max(0, Number(item.price) || 0),
      target: Math.max(0, Number(item.target) || 0),
      lotSize: Math.max(1, Math.trunc(Number(item.lotSize) || 100)),
      paused: Boolean(item.paused),
      quoteUpdatedAt: String(item.quoteUpdatedAt || ''),
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const indicator = $('#save-state');
    indicator.textContent = '已自动保存';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function formatPercent(value) {
    return `${(Number(value) || 0).toFixed(2)}%`;
  }

  function syncSettingsToUI() {
    $('#current-cash').value = state.settings.currentCash;
    $('#contribution').value = state.settings.contribution;
    $('#reserve-cash').value = state.settings.reserveCash;
    $('#minimum-commission').value = state.settings.minimumCommission;
    $('#commission-rate').value = state.settings.commissionRate;
    $('#use-current-cash').checked = state.settings.useCurrentCash;
    $('#reduce-transactions').checked = state.settings.reduceTransactions;
  }

  function renderAssets() {
    $('#asset-rows').innerHTML = state.assets.map((item, index) => `
      <tr class="asset-row is-collapsed" data-index="${index}">
        <td><button type="button" class="mobile-asset-toggle" data-toggle-asset aria-expanded="false"><span><strong>${escapeHtml(item.name || '未命名资产')}</strong><small>${escapeHtml(item.code || '未填写代码')} · 目标 ${formatPercent(item.target)}</small></span><b>展开</b></button><input class="name-input" type="text" data-field="name" value="${escapeHtml(item.name)}" placeholder="自定义行业ETF或个股" aria-label="资产名称"></td>
        <td><input class="code-input" type="text" data-field="code" value="${escapeHtml(item.code)}" aria-label="资产代码" placeholder="可选"></td>
        <td><input type="number" data-field="quantity" min="0" step="1" value="${item.quantity}" aria-label="持有份数"></td>
        <td><input type="number" data-field="price" min="0" step="0.001" value="${item.price || ''}" aria-label="最新价格" placeholder="必填"><small class="quote-time">${escapeHtml(item.quoteUpdatedAt ? `更新 ${item.quoteUpdatedAt}` : '可手工输入')}</small></td>
        <td><input type="number" data-field="target" min="0" max="100" step="0.01" value="${item.target}" aria-label="目标比例"></td>
        <td><input type="number" data-field="lotSize" min="1" step="1" value="${item.lotSize}" aria-label="每手份数"></td>
        <td><input type="checkbox" data-field="paused" ${item.paused ? 'checked' : ''} aria-label="暂停买入"></td>
        <td><button type="button" class="delete-row" data-delete="${index}" aria-label="删除${escapeHtml(item.name || '自定义资产')}">×</button></td>
      </tr>`).join('');
    updateTargetTotal();
    renderOverview();
  }

  function renderOverview() {
    const summary = calculator.calculatePortfolioSummary(state.assets, state.settings);
    $('#overview-metrics').innerHTML = `
      <div class="metric"><span>持仓证券总市值</span><strong>¥${formatMoney(summary.holdingsValue)}</strong><small>${summary.positions.length} 项持仓</small></div>
      <div class="metric"><span>当前现金</span><strong>¥${formatMoney(summary.currentCash)}</strong><small>账户已有或结转</small></div>
      <div class="metric"><span>本月新增资金</span><strong>¥${formatMoney(summary.contribution)}</strong><small>本月待投入</small></div>
      <div class="metric total-assets"><span>所有总资产</span><strong>¥${formatMoney(summary.totalAssets)}</strong><small>持仓＋现金＋本月新增</small></div>`;
    $('#position-list').innerHTML = summary.positions.map((item) => `
      <tr><td>${escapeHtml(item.code || '—')}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>¥${formatMoney(item.price)}</td><td>¥${formatMoney(item.value)}</td><td>${formatPercent(item.allocation)}</td></tr>`).join('');
    $('#positions-empty').hidden = summary.positions.length > 0;
  }

  function updateTargetTotal() {
    const total = state.assets.reduce((sum, item) => sum + (Number(item.target) || 0), 0);
    const target = $('#target-total');
    const cashTarget = Math.max(0, 100 - total);
    target.textContent = cashTarget > 0 ? `${formatPercent(total)}（现金 ${formatPercent(cashTarget)}）` : formatPercent(total);
    target.classList.toggle('invalid', total > 100.0001);
  }

  function renderHistory() {
    const body = $('#history-body');
    body.innerHTML = state.history.map((item) => `
      <tr><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.name || '自定义资产')}<span class="reason"> ${escapeHtml(item.code)}</span></td>
      <td>¥${formatMoney(item.price)}</td><td>${item.shares}</td><td>¥${formatMoney(item.amount)}</td><td>¥${formatMoney(item.commission)}</td></tr>`).join('');
    $('#history-empty').hidden = state.history.length > 0;
  }

  function readSettings() {
    state.settings = {
      currentCash: Math.max(0, Number($('#current-cash').value) || 0),
      contribution: Math.max(0, Number($('#contribution').value) || 0),
      reserveCash: Math.max(0, Number($('#reserve-cash').value) || 0),
      minimumCommission: Math.max(0, Number($('#minimum-commission').value) || 0),
      commissionRate: Math.max(0, Number($('#commission-rate').value) || 0),
      useCurrentCash: $('#use-current-cash').checked,
      reduceTransactions: $('#reduce-transactions').checked,
    };
  }

  async function refreshQuote(index, quiet = false) {
    const asset = state.assets[index];
    if (!asset || !quotes) return { ok: false, message: '行情模块未加载，请手工填写价格' };
    const oldPrice = asset.price;
    try {
      const quote = await quotes.fetchQuote(asset.code);
      asset.name = quote.name;
      asset.price = quote.price;
      asset.quoteUpdatedAt = quote.quoteTime || new Date().toLocaleString('zh-CN', { hour12: false });
      saveState();
      renderAssets();
      if (!quiet) showMessages([`${asset.code} ${asset.name} 行情已更新：¥${formatMoney(asset.price)}`], 'success');
      return { ok: true };
    } catch (error) {
      asset.price = oldPrice;
      if (!quiet) showMessages([`${asset.code || asset.name}：${error.message}`]);
      return { ok: false, message: error.message };
    }
  }

  async function refreshAllQuotes() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return showMessages(['当前处于离线状态，无法刷新行情；已有价格和计算功能仍可正常使用。'], 'info');
    }
    const candidates = state.assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => asset.code);
    if (!candidates.length) return showMessages(['请先填写至少一个六位证券代码。'], 'info');
    $('#refresh-all-quotes').disabled = true;
    $('#refresh-all-quotes').textContent = '正在刷新…';
    const results = await Promise.all(candidates.map(({ index }) => refreshQuote(index, true)));
    const success = results.filter((item) => item.ok).length;
    const failed = results.length - success;
    renderAssets();
    showMessages([`行情刷新完成：成功 ${success} 项，失败 ${failed} 项。失败资产已保留原价格。`], failed ? 'info' : 'success');
    $('#refresh-all-quotes').disabled = false;
    $('#refresh-all-quotes').textContent = '刷新全部行情';
  }

  function showMessages(messages, type = 'error') {
    $('#messages').innerHTML = messages.map((message) => `<div class="message ${type}">${escapeHtml(message)}</div>`).join('');
  }

  function calculate() {
    readSettings();
    saveState();
    renderOverview();
    const validation = calculator.validatePortfolio(state.assets, state.settings);
    const fatal = validation.errors.filter((message) => !message.includes('价格必须大于 0'));
    if (fatal.length) {
      showMessages(fatal);
      $('#results').hidden = true;
      latestPlan = null;
      return;
    }
    const missingPrices = validation.errors.filter((message) => message.includes('价格必须大于 0'));
    const cashNotice = validation.cashTarget > 0 ? `目标比例剩余 ${formatPercent(validation.cashTarget)} 将保留为现金。` : '';
    showMessages(missingPrices.length ? [...missingPrices, '缺少价格的资产不会生成买入建议，其他资产仍可计算。', cashNotice].filter(Boolean) : ['方案已按当前输入生成。', cashNotice].filter(Boolean), missingPrices.length || cashNotice ? 'info' : 'success');
    const theoretical = calculator.calculateTheoreticalPlan(state.assets, state.settings);
    const executable = calculator.calculateExecutablePlan(state.assets, state.settings);
    const manualLots = Object.fromEntries(executable.items.map((item) => [item.id, item.lots]));
    const actual = calculator.calculateManualPlan(state.assets, manualLots, state.settings);
    latestPlan = { theoretical, recommended: executable, actual };
    renderResults(theoretical, executable, actual, true);
  }

  function renderResults(theoretical, recommended, actual, shouldScroll = false) {
    $('#results').hidden = false;
    const purchased = actual.items.filter((item) => item.shares > 0).length;
    $('#metrics').innerHTML = `
      <div class="metric"><span>本次可用资金</span><strong>¥${formatMoney(actual.availableCash)}</strong><small>已扣除预留现金</small></div>
      <div class="metric"><span>实际支出（含佣金）</span><strong>¥${formatMoney(actual.spent)}</strong><small>${purchased} 笔买入</small></div>
      <div class="metric"><span>剩余现金</span><strong>¥${formatMoney(actual.remainingCash)}</strong><small>${actual.valid ? '按实际手数计算' : '实际手数需要调整'}</small></div>
      <div class="metric"><span>组合偏差变化</span><strong>${actual.deviationBefore.toFixed(2)} → ${actual.deviationAfter.toFixed(2)}</strong><small>数值越低越接近目标</small></div>`;

    const beforeById = new Map(actual.before.items.map((item) => [item.id, item]));
    const afterById = new Map(actual.after.items.map((item) => [item.id, item]));
    $('#allocation-bars').innerHTML = state.assets.map((asset) => {
      const before = beforeById.get(asset.id) || { actual: 0 };
      const after = afterById.get(asset.id) || { actual: 0 };
      const targetPosition = Math.min(100, Math.max(0, asset.target));
      return `<div class="allocation-row">
        <div class="allocation-label"><strong>${escapeHtml(asset.name || '自定义资产')}</strong><small>${escapeHtml(asset.code)}</small></div>
        <div class="bar-pair">
          <div class="bar-line current-line"><span>当前</span><div class="bar-track"><i class="bar-before" style="width:${Math.min(100, Math.max(0, before.actual))}%"></i><i class="target-marker" style="left:${targetPosition}%" title="目标 ${formatPercent(asset.target)}"></i></div><span class="line-value">${formatPercent(before.actual)}</span></div>
          <div class="bar-line after-line"><span>买后</span><div class="bar-track"><i class="bar-after" style="width:${Math.min(100, Math.max(0, after.actual))}%"></i><i class="target-marker" style="left:${targetPosition}%" title="目标 ${formatPercent(asset.target)}"></i></div><span class="line-value"><b>${formatPercent(after.actual)}</b></span></div>
        </div>
      </div>`;
    }).join('');

    $('#theoretical-body').innerHTML = theoretical.items.map((item) => `
      <tr><td>${escapeHtml(item.name || '自定义资产')}</td><td>¥${formatMoney(item.amount)}</td><td>${item.estimatedShares.toFixed(2)}</td><td class="reason">${escapeHtml(item.reason || '按理论缺口分配')}</td></tr>`).join('');
    const actualById = new Map(actual.items.map((item) => [item.id, item]));
    $('#executable-body').innerHTML = recommended.items.map((item) => {
      const manual = actualById.get(item.id);
      return `<tr><td>${escapeHtml(item.name || '自定义资产')}</td><td class="${item.shares ? 'buy' : ''}">${item.shares ? `${item.lots} 手 / ${item.shares} 份` : '不买'}</td><td><input class="manual-lots" type="number" min="0" step="1" inputmode="numeric" data-manual-lots="${escapeHtml(item.id)}" value="${manual.lots}" aria-label="${escapeHtml(item.name || '自定义资产')}实际买入手数"></td><td>¥${formatMoney(manual.amount)}</td><td>¥${formatMoney(manual.commission)}</td><td class="reason">${escapeHtml(item.reason || '低配且本手改善最大')}</td></tr>`;
    }).join('');
    $('#confirm-execution').disabled = purchased === 0 || !actual.valid;
    if (shouldScroll) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function confirmExecution() {
    if (!latestPlan) return;
    if (!latestPlan.actual.valid) return showMessages(latestPlan.actual.errors);
    const buys = latestPlan.actual.items.filter((item) => item.shares > 0);
    if (!buys.length) return;
    if (!window.confirm(`确认已执行 ${buys.length} 笔买入？这会更新持有份数、现金和历史记录。`)) return;
    const timestamp = new Date();
    const date = timestamp.toLocaleString('zh-CN', { hour12: false });
    buys.forEach((buy) => {
      const asset = state.assets.find((item) => item.id === buy.id);
      if (!asset) return;
      asset.quantity += buy.shares;
      state.history.unshift({
        id: `${timestamp.getTime()}-${asset.id}`,
        date,
        code: asset.code,
        name: asset.name,
        price: asset.price,
        shares: buy.shares,
        amount: buy.amount,
        commission: buy.commission,
      });
    });
    state.settings.currentCash = Math.max(0, Math.round((state.settings.currentCash + state.settings.contribution - latestPlan.actual.spent) * 100) / 100);
    state.settings.contribution = 0;
    saveState();
    syncSettingsToUI();
    renderAssets();
    renderHistory();
    latestPlan = null;
    $('#results').hidden = true;
    showMessages(['执行结果已写入持仓和历史记录，本月新增资金已清零。'], 'success');
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    download(`etf-rebalance-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ version: 1, ...state }, null, 2), 'application/json;charset=utf-8');
  }

  async function importJSON(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.assets) || !parsed.assets.length) throw new Error('文件中没有有效的 assets 列表');
      const importedAssets = parsed.assets.map(normalizeAsset);
      const validation = calculator.validatePortfolio(importedAssets, parsed.settings || {});
      const structuralErrors = validation.errors.filter((message) => !message.includes('价格必须大于 0'));
      if (structuralErrors.length) throw new Error(structuralErrors.join('；'));
      state = {
        assets: importedAssets,
        settings: { ...defaultSettings, ...(parsed.settings || {}) },
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
      latestPlan = null;
      saveState();
      syncSettingsToUI();
      renderAssets();
      renderHistory();
      $('#results').hidden = true;
      showMessages(['JSON 配置导入成功。'], 'success');
    } catch (error) {
      showMessages([`导入失败：${error.message}`]);
    } finally {
      $('#import-json').value = '';
    }
  }

  function exportCSV() {
    if (!state.history.length) {
      showMessages(['没有可导出的执行历史。'], 'info');
      return;
    }
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['日期', '代码', '名称', '价格', '份数', '成交金额', '佣金'], ...state.history.map((item) => [item.date, item.code, item.name, item.price, item.shares, item.amount, item.commission])];
    download(`etf-history-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
  }

  function addAsset() {
    state.assets.push(normalizeAsset({ id: `asset-${Date.now()}`, name: '', target: 0, lotSize: 100 }));
    saveState();
    renderAssets();
    const rows = document.querySelectorAll('#asset-rows .asset-row');
    const row = rows[rows.length - 1];
    if (row) {
      row.classList.remove('is-collapsed');
      const toggle = row.querySelector('[data-toggle-asset]');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.querySelector('b').textContent = '收起';
      }
    }
  }

  $('#asset-rows').addEventListener('input', (event) => {
    const row = event.target.closest('tr');
    const field = event.target.dataset.field;
    if (!row || !field) return;
    const asset = state.assets[Number(row.dataset.index)];
    if (field === 'name' || field === 'code') asset[field] = event.target.value;
    else if (field === 'paused') asset[field] = event.target.checked;
    else asset[field] = Math.max(0, Number(event.target.value) || 0);
    updateTargetTotal();
    saveState();
  });
  $('#asset-rows').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-asset]');
    if (toggle) {
      const row = toggle.closest('.asset-row');
      const collapsed = row.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.querySelector('b').textContent = collapsed ? '展开' : '收起';
      return;
    }
    const button = event.target.closest('[data-delete]');
    if (!button) return;
    if (state.assets.length === 1) return showMessages(['至少需要保留一项资产。']);
    state.assets.splice(Number(button.dataset.delete), 1);
    saveState();
    renderAssets();
  });
  ['current-cash', 'contribution', 'reserve-cash', 'commission-rate', 'minimum-commission', 'use-current-cash', 'reduce-transactions'].forEach((id) => {
    $(`#${id}`).addEventListener('input', () => { readSettings(); saveState(); renderOverview(); });
  });
  $('#add-asset').addEventListener('click', addAsset);
  $('#add-asset-mobile').addEventListener('click', addAsset);
  $('#executable-body').addEventListener('change', (event) => {
    if (!event.target.matches('[data-manual-lots]') || !latestPlan) return;
    const lotsById = Object.fromEntries(Array.from(document.querySelectorAll('[data-manual-lots]')).map((input) => [input.dataset.manualLots, Number(input.value)]));
    latestPlan.actual = calculator.calculateManualPlan(state.assets, lotsById, state.settings);
    renderResults(latestPlan.theoretical, latestPlan.recommended, latestPlan.actual);
    if (latestPlan.actual.valid) showMessages(['已按实际手数重新计算，确认执行时将使用实际手数。'], 'success');
    else showMessages(latestPlan.actual.errors);
  });
  $('#calculate').addEventListener('click', calculate);
  $('#refresh-all-quotes').addEventListener('click', refreshAllQuotes);
  $('#confirm-execution').addEventListener('click', confirmExecution);
  $('#export-json').addEventListener('click', exportJSON);
  $('#import-json').addEventListener('change', (event) => event.target.files[0] && importJSON(event.target.files[0]));
  $('#export-csv').addEventListener('click', exportCSV);
  $('#clear-history').addEventListener('click', () => {
    if (!state.history.length || !window.confirm('确认永久删除全部执行历史？')) return;
    state.history = [];
    saveState();
    renderHistory();
    showMessages(['执行历史已删除。'], 'success');
  });
  $('#reset-all').addEventListener('click', () => {
    if (!window.confirm('确认恢复默认资产、资金设置并删除全部历史？')) return;
    state = { assets: calculator.cloneDefaults(), settings: { ...defaultSettings }, history: [] };
    latestPlan = null;
    saveState();
    syncSettingsToUI();
    renderAssets();
    renderHistory();
    $('#results').hidden = true;
    showMessages(['已恢复默认配置。'], 'success');
  });

  syncSettingsToUI();
  renderAssets();
  renderHistory();
  renderOverview();
})();
