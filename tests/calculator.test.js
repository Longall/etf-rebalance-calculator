const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ASSETS,
  validatePortfolio,
  calculateSnapshot,
  calculateTheoreticalPlan,
  calculateExecutablePlan,
  portfolioDeviation,
  calculatePortfolioSummary,
  calculateCommission,
} = require('../calculator.js');

function asset(overrides = {}) {
  return {
    id: 'a',
    code: 'A',
    name: '资产A',
    quantity: 0,
    price: 10,
    target: 50,
    lotSize: 100,
    paused: false,
    ...overrides,
  };
}

test('默认配置只包含一个不泄露名称和代码的空白资产', () => {
  assert.equal(DEFAULT_ASSETS.length, 1);
  assert.equal(DEFAULT_ASSETS.reduce((sum, item) => sum + item.target, 0), 100);
  assert.equal(DEFAULT_ASSETS[0].code, '');
  assert.equal(DEFAULT_ASSETS[0].name, '');
});

test('5 万元无持仓时给出可执行的整数手建议', () => {
  const assets = [
    asset({ id: 'a', target: 60, price: 100, lotSize: 100 }),
    asset({ id: 'b', code: 'B', target: 40, price: 50, lotSize: 100 }),
  ];
  const plan = calculateExecutablePlan(assets, { currentCash: 0, contribution: 50000, reserveCash: 0, useCurrentCash: true });
  assert.deepEqual(plan.items.map((item) => item.lots), [3, 4]);
  assert.deepEqual(plan.items.map((item) => item.shares), [300, 400]);
  assert.equal(plan.spent, 50000);
  assert.equal(plan.remainingCash, 0);
});

test('超配资产不会继续买入', () => {
  const assets = [
    asset({ id: 'over', quantity: 1000, target: 20 }),
    asset({ id: 'under', code: 'B', quantity: 0, target: 80 }),
  ];
  const plan = calculateExecutablePlan(assets, { contribution: 5000 });
  assert.equal(plan.items.find((item) => item.id === 'over').shares, 0);
  assert.equal(plan.items.find((item) => item.id === 'over').reason, '当前已超配');
});

test('预算不足一手时保留全部资金', () => {
  const plan = calculateExecutablePlan([asset({ target: 100, price: 10, lotSize: 100 })], { contribution: 999 });
  assert.equal(plan.spent, 0);
  assert.equal(plan.remainingCash, 999);
  assert.equal(plan.items[0].reason, '可用资金不足一手');
});

test('价格缺失会被校验并阻止该资产买入', () => {
  const assets = [asset({ price: 0, target: 100 })];
  assert.match(validatePortfolio(assets).errors.join('\n'), /价格/);
  const plan = calculateExecutablePlan(assets, { contribution: 5000 });
  assert.equal(plan.items[0].shares, 0);
  assert.equal(plan.items[0].reason, '价格缺失');
});

test('暂停买入资产不产生购买建议', () => {
  const plan = calculateExecutablePlan([asset({ target: 100, paused: true })], { contribution: 5000 });
  assert.equal(plan.items[0].shares, 0);
  assert.equal(plan.items[0].reason, '已暂停买入');
});

test('整手购买后准确保留不足资金', () => {
  const plan = calculateExecutablePlan([asset({ target: 100, price: 12.34, lotSize: 100 })], { contribution: 2500 });
  assert.equal(plan.items[0].lots, 2);
  assert.equal(plan.items[0].shares, 200);
  assert.equal(plan.spent, 2468);
  assert.equal(plan.remainingCash, 32);
});

test('买入后组合偏差低于买入前', () => {
  const assets = [
    asset({ id: 'a', quantity: 1000, target: 50 }),
    asset({ id: 'b', code: 'B', quantity: 0, target: 50 }),
  ];
  const before = portfolioDeviation(calculateSnapshot(assets).items);
  const plan = calculateExecutablePlan(assets, { contribution: 5000 });
  assert.ok(plan.deviationAfter < before);
  assert.equal(plan.deviationBefore, before);
});

test('理论方案只向低配资产分配且总额不超过预算', () => {
  const assets = [
    asset({ id: 'a', quantity: 1000, target: 25 }),
    asset({ id: 'b', code: 'B', quantity: 0, target: 75 }),
  ];
  const plan = calculateTheoreticalPlan(assets, { contribution: 5000 });
  assert.equal(plan.items[0].amount, 0);
  assert.equal(plan.items[1].amount, 5000);
  assert.equal(plan.spent, 5000);
});

test('预留现金、当前现金和最低佣金共同影响可执行预算', () => {
  const assets = [asset({ target: 100, price: 10, lotSize: 100 })];
  const withoutCash = calculateExecutablePlan(assets, {
    currentCash: 2000,
    contribution: 2000,
    reserveCash: 500,
    minimumCommission: 5,
    useCurrentCash: false,
  });
  assert.equal(withoutCash.availableCash, 1500);
  assert.equal(withoutCash.items[0].lots, 1);
  assert.equal(withoutCash.remainingCash, 495);

  const withCash = calculateExecutablePlan(assets, {
    currentCash: 2000,
    contribution: 2000,
    reserveCash: 500,
    minimumCommission: 5,
    useCurrentCash: true,
  });
  assert.equal(withCash.availableCash, 3500);
  assert.equal(withCash.items[0].lots, 3);
  assert.equal(withCash.remainingCash, 495);
});

test('资产汇总包含持仓市值、现金、本月新增和总资产', () => {
  const summary = calculatePortfolioSummary([
    asset({ id: 'a', quantity: 100, price: 10 }),
    asset({ id: 'b', code: 'B', quantity: 200, price: 5 }),
  ], { currentCash: 300, contribution: 700 });
  assert.equal(summary.holdingsValue, 2000);
  assert.equal(summary.totalAssets, 3000);
  assert.equal(summary.positions.length, 2);
  assert.equal(summary.positions[0].allocation, 50);
});

test('预留现金超过参与资金时返回明确错误', () => {
  const result = validatePortfolio([asset({ target: 100 })], {
    currentCash: 100,
    contribution: 200,
    reserveCash: 301,
    useCurrentCash: true,
  });
  assert.match(result.errors.join('\n'), /预留现金不能超过本次参与计算的资金/);
});

test('佣金取比例佣金和最低佣金中的较大值', () => {
  assert.equal(calculateCommission(1000, { commissionRate: 2.5, minimumCommission: 5 }), 5);
  assert.equal(calculateCommission(100000, { commissionRate: 2.5, minimumCommission: 5 }), 25);
});

test('同一资产多手按总成交额计算一次佣金且总成本不超预算', () => {
  const plan = calculateExecutablePlan([asset({ target: 100, price: 10 })], {
    contribution: 3025,
    commissionRate: 100,
    minimumCommission: 5,
  });
  assert.equal(plan.items[0].shares, 200);
  assert.equal(plan.items[0].commission, 20);
  assert.ok(plan.spent <= plan.availableCash);
});

test('目标比例低于 100% 时差额作为现金比例且不报错', () => {
  const assets = [asset({ target: 95, price: 10 })];
  const validation = validatePortfolio(assets, { contribution: 10000 });
  assert.equal(validation.valid, true);
  assert.equal(validation.cashTarget, 5);
  const theoretical = calculateTheoreticalPlan(assets, { contribution: 10000 });
  assert.equal(theoretical.spent, 9500);
  assert.equal(theoretical.remainingCash, 500);
});

test('目标比例超过 100% 时仍然报错', () => {
  const validation = validatePortfolio([asset({ target: 101 })]);
  assert.match(validation.errors.join('\n'), /不能超过 100%/);
});
