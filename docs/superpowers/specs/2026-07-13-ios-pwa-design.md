# ETF Rebalance iOS PWA 设计

日期：2026-07-13

## 目标

将现有纯前端 ETF 再平衡计算器改造成可安装到 iPhone 主屏幕、离线启动和离线计算的 PWA。应用名称为 `ETF Rebalance`，保持现有 localStorage 数据模型和无后端架构。

## 安装与运行边界

- PWA 首次加载与安装必须来自 HTTPS 地址；`localhost` 仅用于开发测试。
- 直接通过 `file://` 打开时继续提供现有计算功能，但不注册 Service Worker，也不具备安装和离线缓存能力。
- 安装到主屏幕后，HTML、CSS、JavaScript、Manifest 和图标存储在设备缓存中，不依赖 Mac 在线。
- 行情接口需要网络；离线时保留资产已保存价格并允许手工输入。
- 持仓、现金、历史记录和设置继续存放在当前 PWA 容器的 localStorage，不上传服务器。

## PWA 元数据

- `name`：`ETF Rebalance`
- `short_name`：`ETF Rebalance`
- `lang`：`zh-CN`
- `display`：`standalone`
- `start_url`：`./index.html`
- `scope`：`./`
- `theme_color`：当前页面深绿色 `#17231f`
- `background_color`：页面米白色 `#f4f1e9`
- 屏幕方向不锁定，允许竖屏和横屏。

提供 192×192 与 512×512 PNG 图标，以及 180×180 Apple Touch Icon。图标采用深绿色背景与白色再平衡折线/比例符号，不使用第三方商标。

## 缓存策略

Service Worker 使用版本化应用外壳缓存。

预缓存：

- `index.html`
- `styles.css`
- `calculator.js`
- `quotes.js`
- `app.js`
- `manifest.webmanifest`
- 三个本地图标

请求策略：

- 同源应用文件：缓存优先，缓存未命中时访问网络。
- 页面导航：优先返回缓存的 `index.html`，确保离线启动。
- 腾讯行情及所有跨域请求：只走网络，不写入 Service Worker 缓存。
- 未列入应用外壳的请求不主动缓存，避免无限增长。

激活新版 Service Worker 后删除旧版本应用缓存，不触碰浏览器的 localStorage。

## 更新体验

- 页面加载后注册 `service-worker.js`。
- 首次安装静默完成。
- 检测到等待中的新版本时，在页面顶部显示非阻塞更新提示：“新版本已准备好”。
- 用户点击“立即刷新”后向等待中的 Worker 发送 `SKIP_WAITING`，待控制器切换后只刷新一次页面。
- 不在用户输入过程中自动刷新。
- 更新提示可暂时关闭，本次页面停留期间不重复打扰。

## 离线与错误提示

- 使用 `navigator.onLine` 和 `online`/`offline` 事件显示轻量状态。
- 离线时说明：“当前离线，可继续计算；行情刷新暂不可用。”
- 点击“刷新全部行情”时若离线，立即显示中文提示，不发起请求。
- 网络请求失败仍沿用现有策略：保留旧价格，不清空数据。

## 文件边界

- 新增 `manifest.webmanifest`：安装元数据。
- 新增 `service-worker.js`：缓存、导航回退、版本清理与更新消息。
- 新增 `pwa.js`：注册、更新提示和在线状态 UI，不侵入计算逻辑。
- 新增 `icons/`：主屏幕图标。
- 修改 `index.html`：Manifest、主题、Apple PWA 元数据、图标、状态与更新提示。
- 修改 `styles.css`：PWA 状态条和更新提示样式。
- 修改 `app.js`：仅增加刷新行情前的离线判断。

## 测试与验收

自动测试：

- Manifest 字段、相对路径与图标尺寸声明正确。
- Service Worker 预缓存清单包含所有本地应用文件。
- 跨域行情不会进入缓存策略。
- 导航离线回退到 `index.html`。
- 旧缓存仅按应用缓存前缀删除。
- 页面包含 iOS 与通用 PWA 元数据。
- PWA 注册仅在安全上下文且非 `file:` 环境运行。
- 现有计算、行情解析和 UI 测试全部通过。

浏览器验收：

- HTTPS 或 localhost 下 Manifest 可读取，Service Worker 成功注册。
- 第二次加载由缓存正常启动。
- 模拟离线后页面仍可打开、读取已保存数据和执行计算。
- 离线刷新行情显示中文提示。
- 桌面和手机宽度无新增横向溢出。
- 控制台无 JavaScript 错误。

## 明确限制

- PWA 离线能力不等于离线行情；行情数据源仍需联网。
- 删除 PWA、清除网站数据或重置 Safari 数据可能删除 localStorage，仍建议定期导出配置。
- Service Worker 更新依赖再次访问部署地址；长期完全离线时继续使用已缓存版本。
