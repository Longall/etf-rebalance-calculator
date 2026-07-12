const test = require('node:test');
const assert = require('node:assert/strict');

const { toTencentSymbol, parseTencentQuote, fetchQuote } = require('../quotes.js');

test('沪深六位代码映射为腾讯行情标识', () => {
  assert.equal(toTencentSymbol('512345'), 'sh512345');
  assert.equal(toTencentSymbol('603210'), 'sh603210');
  assert.equal(toTencentSymbol('159999'), 'sz159999');
  assert.equal(toTencentSymbol('002345'), 'sz002345');
  assert.throws(() => toTencentSymbol('123'), /六位数字/);
  assert.throws(() => toTencentSymbol('812345'), /暂不支持/);
});

test('解析腾讯行情中的名称、最新价和行情时间', () => {
  const fields = Array(31).fill('0');
  fields[0] = '1'; fields[1] = '测试ETF'; fields[2] = '512345'; fields[3] = '4.829'; fields[30] = '20260710161431';
  const quote = parseTencentQuote(`v_sh512345="${fields.join('~')}";`, '512345');
  assert.deepEqual(quote, { code: '512345', name: '测试ETF', price: 4.829, quoteTime: '2026-07-10 16:14:31' });
});

test('请求失败时抛出中文错误', async () => {
  await assert.rejects(() => fetchQuote('512345', async () => { throw new Error('offline'); }), /行情获取失败/);
});
