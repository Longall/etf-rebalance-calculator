const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calculator = require('../calculator.js');
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const STORAGE_KEY = 'etf-rebalance-calculator-v1';

function initializeApp(savedState) {
  const elements = new Map();
  const element = () => ({
    addEventListener() {},
    classList: { toggle() {} },
    scrollIntoView() {},
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
  });
  const document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
  };
  const writes = [];
  const localStorage = {
    getItem(key) {
      return key === STORAGE_KEY ? JSON.stringify(savedState) : null;
    },
    setItem(key, value) {
      writes.push([key, value]);
    },
  };
  const window = { ETFCalculator: calculator };

  vm.runInNewContext(appSource, { console, document, localStorage, window, Blob, URL, Intl, Date });
  return { elements, writes };
}

test('应用重新加载时原样保留用户自己的资产配置', () => {
  const savedState = {
    assets: [
      { ...calculator.DEFAULT_ASSETS[0], id: 'saved-1', code: 'ABC', name: '我的资产' },
    ],
    settings: {},
    history: [],
  };

  const { elements, writes } = initializeApp(savedState);

  assert.match(elements.get('#asset-rows').innerHTML, /我的资产/);
  assert.equal(writes.length, 0);
  assert.match(elements.get('#overview-metrics').innerHTML, /所有总资产/);
});

test('旧配置缺少资金默认值时使用新的月投入和佣金默认值', () => {
  const savedState = {
    assets: calculator.DEFAULT_ASSETS,
    settings: {},
    history: [],
  };
  const { elements } = initializeApp(savedState);
  assert.equal(elements.get('#contribution').value, 5000);
  assert.equal(elements.get('#commission-rate').value, 0.85);
  assert.equal(elements.get('#minimum-commission').value, 0);
});
