const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
const app = fs.readFileSync('app.js', 'utf8');

test('预留现金带说明文本以保持资金输入框对齐', () => {
  assert.match(html, /预留现金（元）<small>本次计算后希望保留的现金<\/small>/);
});

test('资产输入行顶部对齐且进度条未填充区域为白色', () => {
  assert.match(css, /\.asset-table td[^}]*vertical-align:\s*top/);
  assert.match(css, /\.bar-track[^}]*background:\s*(?:#fff|white)/);
});

test('结果表按资产名称显示且左右卡片等高', () => {
  assert.doesNotMatch(app, /item\.code \|\| item\.name/);
  assert.match(css, /\.result-grid[^}]*align-items:\s*stretch/);
});

test('默认自定义资产使用占位文字而不是输入值', () => {
  assert.match(app, /placeholder="自定义行业ETF或个股"/);
});

test('删除按钮使用叉号且配置图使用两条独立轨道', () => {
  assert.match(app, />×<\/button>/);
  assert.match(app, /class="bar-line current-line"/);
  assert.match(app, /class="bar-line after-line"/);
  assert.doesNotMatch(app, /<span class="bar-before"[^>]*><\/span><span class="bar-after"/);
});

test('资产操作控件居中且横条数值保持完整', () => {
  assert.match(css, /\.asset-table td:nth-child\(7\)[^}]*padding-top/);
  assert.match(css, /\.delete-row[^}]*margin-top/);
  assert.match(css, /\.line-value[^}]*white-space:\s*nowrap/);
});

test('整手模式说明使用精简的一行文案', () => {
  assert.match(html, /逐手优化偏差，每项买入按整笔计佣金。/);
  assert.match(css, /\.mode-title p[^}]*white-space:\s*nowrap/);
});

test('顶部导出导入与重置按钮使用统一字号', () => {
  assert.match(css, /\.hero-actions \.button, \.hero-actions button[^}]*font-size:\s*13px/);
});

test('资产表不再显示单独的逐行行情获取列', () => {
  assert.doesNotMatch(html, /<th>行情<\/th>/);
  assert.doesNotMatch(app, /data-quote=/);
  assert.doesNotMatch(app, />获取<\/button>/);
});

test('横条右侧显示数据且目标用轨道标记', () => {
  assert.match(app, /class="line-value">\$\{formatPercent\(before\.actual\)\}/);
  assert.match(app, /class="line-value"><b>\$\{formatPercent\(after\.actual\)\}<\/b>/);
  assert.match(app, /class="target-marker"/);
  assert.doesNotMatch(app, /class="bar-values"/);
  assert.match(css, /\.target-marker[^}]*width:\s*2px/);
  assert.match(css, /\.target-marker[^}]*transform:\s*translateX\(-50%\)/);
  assert.doesNotMatch(css, /\.target-marker[^}]*rotate\(/);
  assert.match(css, /\.bar-before, \.bar-after[^}]*border-radius:\s*10px 0 0 10px/);
});

test('页面不再包含固定风险提示', () => {
  assert.doesNotMatch(html, /<footer>/);
  assert.doesNotMatch(css, /footer\s*\{/);
});

test('配置横条统一使用真实的零到百分之百刻度', () => {
  assert.doesNotMatch(app, /const scale = Math\.max/);
  assert.match(app, /const targetPosition = Math\.min\(100, Math\.max\(0, asset\.target\)\)/);
  assert.match(app, /width:\$\{Math\.min\(100, Math\.max\(0, before\.actual\)\)\}%/);
  assert.match(app, /width:\$\{Math\.min\(100, Math\.max\(0, after\.actual\)\)\}%/);
});

test('手机版资产支持折叠编辑并在列表底部提供添加按钮', () => {
  assert.match(app, /class="mobile-asset-toggle"/);
  assert.match(html, /id="add-asset-mobile"/);
  assert.match(css, /\.asset-row\.is-collapsed/);
  assert.match(css, /\.mobile-asset-actions/);
});

test('整手模式提供实际手数输入并按实际方案确认', () => {
  assert.match(html, /<th>实际手数<\/th>/);
  assert.match(app, /data-manual-lots/);
  assert.match(app, /calculateManualPlan/);
  assert.match(app, /latestPlan\.actual/);
});

test('手机端模式标题不拆字且资产编辑控件统一对齐', () => {
  assert.match(css, /@media \(max-width: 540px\)[\s\S]*\.mode-title\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.mode-title h3[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.asset-table td:first-child > \.name-input[^}]*grid-column:\s*2/);
  assert.match(css, /\.asset-table td:nth-child\(4\) \.quote-time[^}]*grid-column:\s*2/);
  assert.match(css, /\.asset-table td:nth-child\(7\) input\[type="checkbox"\][^}]*width:\s*28px/);
  assert.match(css, /\.asset-table td:nth-child\(8\) \.delete-row[^}]*width:\s*28px/);
});
