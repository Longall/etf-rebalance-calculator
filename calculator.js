(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ETFCalculator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_ASSETS = Object.freeze([
    { id: 'asset-default', code: '', name: '', quantity: 0, price: 0, target: 100, lotSize: 100, paused: false },
  ]);

  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const cloneDefaults = () => DEFAULT_ASSETS.map((item) => ({ ...item }));

  function normalizeSettings(settings = {}) {
    const currentCash = Math.max(0, number(settings.currentCash));
    const contribution = Math.max(0, number(settings.contribution));
    const reserveCash = Math.max(0, number(settings.reserveCash));
    const minimumCommission = Math.max(0, number(settings.minimumCommission));
    const commissionRate = Math.max(0, number(settings.commissionRate));
    const useCurrentCash = settings.useCurrentCash !== false;
    const grossCash = contribution + (useCurrentCash ? currentCash : 0);
    return {
      currentCash,
      contribution,
      reserveCash,
      minimumCommission,
      commissionRate,
      grossCash: money(grossCash),
      useCurrentCash,
      reduceTransactions: Boolean(settings.reduceTransactions),
      availableCash: money(Math.max(0, grossCash - reserveCash)),
    };
  }

  function validatePortfolio(assets, settings = {}) {
    const errors = [];
    const warnings = [];
    if (!Array.isArray(assets) || assets.length === 0) {
      errors.push('请至少添加一项资产');
      return { valid: false, errors, warnings, targetTotal: 0 };
    }
    let targetTotal = 0;
    assets.forEach((item, index) => {
      const label = item.name || item.code || `第 ${index + 1} 项资产`;
      const target = number(item.target, NaN);
      const quantity = number(item.quantity, NaN);
      const price = number(item.price, NaN);
      const lotSize = number(item.lotSize, NaN);
      if (!Number.isFinite(target) || target < 0) errors.push(`${label}的目标比例不能为负数`);
      else {
        targetTotal += target;
        if (target > 100) errors.push(`${label}的目标比例不能超过 100%`);
      }
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) errors.push(`${label}的持有份数必须是非负整数`);
      if (!Number.isFinite(price) || price <= 0) errors.push(`${label}的价格必须大于 0`);
      if (!Number.isFinite(lotSize) || lotSize <= 0 || !Number.isInteger(lotSize)) errors.push(`${label}的每手份数必须是正整数`);
    });
    if (targetTotal > 100.0001) errors.push(`目标比例合计不能超过 100%，当前为 ${money(targetTotal)}%`);
    const cashTarget = money(Math.max(0, 100 - targetTotal));
    if (cashTarget > 0) warnings.push(`目标比例剩余 ${cashTarget}% 将作为现金保留`);
    const normalized = normalizeSettings(settings);
    if (number(settings.reserveCash) < 0) errors.push('预留现金不能为负数');
    if (normalized.reserveCash > normalized.grossCash) errors.push('预留现金不能超过本次参与计算的资金，请减少预留现金或增加可用资金');
    if (normalized.availableCash === 0) warnings.push('当前没有可用于买入的资金');
    return { valid: errors.length === 0, errors, warnings, targetTotal: money(targetTotal), cashTarget };
  }

  function calculateSnapshot(assets) {
    const items = assets.map((item, index) => {
      const price = Math.max(0, number(item.price));
      const quantity = Math.max(0, number(item.quantity));
      return {
        ...item,
        id: item.id || `asset-${index + 1}`,
        price,
        quantity,
        target: Math.max(0, number(item.target)),
        lotSize: Math.max(1, Math.trunc(number(item.lotSize, 100))),
        value: money(price * quantity),
      };
    });
    const totalValue = money(items.reduce((sum, item) => sum + item.value, 0));
    items.forEach((item) => {
      item.actual = totalValue > 0 ? item.value / totalValue * 100 : 0;
      item.gap = item.target - item.actual;
      item.status = item.gap > 0.05 ? '低配' : item.gap < -0.05 ? '超配' : '达标';
    });
    return { items, totalValue };
  }

  function calculatePortfolioSummary(assets, settings = {}) {
    const snapshot = calculateSnapshot(assets);
    const currentCash = Math.max(0, number(settings.currentCash));
    const contribution = Math.max(0, number(settings.contribution));
    const positions = snapshot.items.filter((item) => item.quantity > 0).map((item) => ({
      ...item,
      allocation: snapshot.totalValue > 0 ? item.value / snapshot.totalValue * 100 : 0,
    }));
    return {
      holdingsValue: snapshot.totalValue,
      currentCash,
      contribution,
      totalAssets: money(snapshot.totalValue + currentCash + contribution),
      positions,
    };
  }

  function calculateCommission(amount, settings = {}) {
    if (amount <= 0) return 0;
    const proportional = amount * Math.max(0, number(settings.commissionRate)) / 10000;
    return money(Math.max(proportional, Math.max(0, number(settings.minimumCommission))));
  }

  function portfolioDeviation(items, denominator) {
    const total = denominator == null
      ? items.reduce((sum, item) => sum + Math.max(0, number(item.value)), 0)
      : Math.max(0, number(denominator));
    return items.reduce((sum, item) => {
      const actual = total > 0 ? Math.max(0, number(item.value)) / total * 100 : 0;
      return sum + Math.pow(actual - Math.max(0, number(item.target)), 2);
    }, 0);
  }

  function baseResult(assets, settings) {
    const normalized = normalizeSettings(settings);
    const snapshot = calculateSnapshot(assets);
    return { normalized, snapshot, deployTotal: money(snapshot.totalValue + normalized.availableCash) };
  }

  function calculateTheoreticalPlan(assets, settings = {}) {
    const { normalized, snapshot, deployTotal } = baseResult(assets, settings);
    const candidates = snapshot.items.map((item) => {
      const desiredValue = deployTotal * item.target / 100;
      const rawGap = item.paused || item.price <= 0 ? 0 : Math.max(0, desiredValue - item.value);
      return { ...item, rawGap };
    });
    const gapTotal = candidates.reduce((sum, item) => sum + item.rawGap, 0);
    const scale = gapTotal > normalized.availableCash && gapTotal > 0 ? normalized.availableCash / gapTotal : 1;
    let spent = 0;
    const items = candidates.map((item) => {
      const amount = money(item.rawGap * scale);
      spent = money(spent + amount);
      let reason = '';
      if (item.paused) reason = '已暂停买入';
      else if (item.price <= 0) reason = '价格缺失';
      else if (item.rawGap <= 0) reason = item.actual > item.target + 0.05 ? '当前已超配' : '无需买入';
      return { id: item.id, code: item.code, name: item.name, amount, estimatedShares: item.price > 0 ? amount / item.price : 0, reason };
    });
    spent = Math.min(spent, normalized.availableCash);
    return { mode: 'theoretical', items, availableCash: normalized.availableCash, spent, remainingCash: money(normalized.availableCash - spent) };
  }

  function allocationError(items, denominator) {
    return items.reduce((sum, item) => {
      const actual = denominator > 0 ? item.value / denominator * 100 : 0;
      return sum + Math.pow(actual - item.target, 2);
    }, 0);
  }

  function calculateExecutablePlan(assets, settings = {}) {
    const { normalized, snapshot, deployTotal } = baseResult(assets, settings);
    const working = snapshot.items.map((item) => ({ ...item, lots: 0, shares: 0, amount: 0, commission: 0 }));
    let remaining = normalized.availableCash;
    let spent = 0;
    const denominator = deployTotal || normalized.availableCash;

    while (remaining > 0) {
      const currentError = allocationError(working, denominator);
      let best = null;
      working.forEach((item, index) => {
        if (item.paused || item.price <= 0 || item.target <= 0) return;
        const lotAmount = money(item.price * item.lotSize);
        const nextAmount = money(item.amount + lotAmount);
        const nextCommission = calculateCommission(nextAmount, normalized);
        const commission = money(nextCommission - item.commission);
        const cost = money(lotAmount + commission);
        if (cost > remaining + 0.0001) return;
        item.value = money(item.value + lotAmount);
        const nextError = allocationError(working, denominator);
        item.value = money(item.value - lotAmount);
        const improvement = currentError - nextError;
        if (improvement <= 1e-10) return;
        const transactionPenalty = normalized.reduceTransactions && item.lots === 0 ? normalized.minimumCommission + 0.01 : 0;
        const score = improvement - transactionPenalty;
        if (!best || score > best.score + 1e-10 || (Math.abs(score - best.score) < 1e-10 && item.target > best.target)) {
          best = { index, lotAmount, commission, cost, score, target: item.target };
        }
      });
      if (!best) break;
      const item = working[best.index];
      item.lots += 1;
      item.shares += item.lotSize;
      item.amount = money(item.amount + best.lotAmount);
      item.commission = money(item.commission + best.commission);
      item.value = money(item.value + best.lotAmount);
      spent = money(spent + best.cost);
      remaining = money(normalized.availableCash - spent);
    }

    const originalById = new Map(snapshot.items.map((item) => [item.id, item]));
    const items = working.map((item) => {
      const original = originalById.get(item.id);
      let reason = '';
      if (item.shares === 0) {
        if (item.paused) reason = '已暂停买入';
        else if (item.price <= 0) reason = '价格缺失';
        else if (original.actual > original.target + 0.05) reason = '当前已超配';
        else if (money(item.price * item.lotSize + calculateCommission(item.price * item.lotSize, normalized)) > normalized.availableCash) reason = '可用资金不足一手';
        else reason = '继续买入不能改善组合偏差';
      }
      return {
        id: item.id, code: item.code, name: item.name, lots: item.lots, shares: item.shares,
        amount: item.amount, commission: item.commission, totalCost: money(item.amount + item.commission), reason,
        finalValue: item.value,
      };
    });
    const afterItems = working.map((item) => ({ ...item }));
    return {
      mode: 'executable', items, availableCash: normalized.availableCash, spent,
      remainingCash: remaining,
      deviationBefore: portfolioDeviation(snapshot.items),
      deviationAfter: portfolioDeviation(afterItems),
      before: snapshot,
      after: calculateSnapshot(afterItems.map((item) => ({ ...item, quantity: item.price > 0 ? item.value / item.price : item.quantity }))),
    };
  }

  return {
    DEFAULT_ASSETS,
    cloneDefaults,
    validatePortfolio,
    calculateSnapshot,
    calculatePortfolioSummary,
    calculateCommission,
    calculateTheoreticalPlan,
    calculateExecutablePlan,
    portfolioDeviation,
  };
});
