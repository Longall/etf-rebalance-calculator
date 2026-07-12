(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ETFQuotes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function toTencentSymbol(code) {
    const value = String(code || '').trim();
    if (!/^\d{6}$/.test(value)) throw new Error('证券代码必须是六位数字');
    if (/^[569]/.test(value)) return `sh${value}`;
    if (/^[0123]/.test(value)) return `sz${value}`;
    throw new Error('暂不支持该证券代码，仅支持沪深 ETF 和 A 股');
  }

  function formatQuoteTime(value) {
    if (!/^\d{14}$/.test(value || '')) return '';
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12, 14)}`;
  }

  function parseTencentQuote(text, expectedCode) {
    const match = String(text || '').match(/="([\s\S]*?)"/);
    if (!match) throw new Error('行情接口没有返回有效数据');
    const fields = match[1].split('~');
    const code = fields[2];
    const price = Number(fields[3]);
    if (code !== String(expectedCode) || !fields[1] || !Number.isFinite(price) || price <= 0) {
      throw new Error('未找到该证券的有效行情，请检查代码');
    }
    return { code, name: fields[1], price, quoteTime: formatQuoteTime(fields[30]) };
  }

  async function fetchQuote(code, fetchImpl = globalThis.fetch) {
    const symbol = toTencentSymbol(code);
    try {
      const response = await fetchImpl(`https://qt.gtimg.cn/q=${symbol}`, { cache: 'no-store' });
      if (response && 'ok' in response && !response.ok) throw new Error(`HTTP ${response.status}`);
      let text;
      if (response && typeof response.arrayBuffer === 'function') {
        const buffer = await response.arrayBuffer();
        text = new TextDecoder('gbk').decode(buffer);
      } else if (response && typeof response.text === 'function') {
        text = await response.text();
      } else {
        throw new Error('响应格式错误');
      }
      return parseTencentQuote(text, String(code).trim());
    } catch (error) {
      if (/证券代码|暂不支持|未找到|没有返回/.test(error.message)) throw error;
      throw new Error(`行情获取失败：${error.message || '网络不可用'}`);
    }
  }

  return { toTencentSymbol, parseTencentQuote, fetchQuote };
});
