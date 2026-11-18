# PWA 部署和验证

本项目使用 `vite-plugin-pwa` / Workbox 生成 Service Worker。游戏规则、AI Worker、模型和音效均在本地执行；部署服务器只负责首次下载和版本更新。

## 构建与部署

```bash
npm ci
npm run build
npm run verify:pwa
npm run preview
```

将 `dist/` 完整上传至 HTTPS 静态站点即可。支持网站根目录和子目录；manifest 的 `id`、`scope`、`start_url` 均为 `./`，静态资源路径也是相对路径。子目录 URL 应以 `/` 结束。`localhost` 和 `127.0.0.1` 可通过 HTTP 测试，普通局域网 IP 需要 HTTPS。开发服务器不注册 Service Worker，避免开发缓存掩盖代码修改。

服务器应给 `sw.js`、`index.html`、`manifest.webmanifest` 设置需要重新验证的缓存策略（例如 `Cache-Control: no-cache`）；带内容哈希的 `assets/` 文件可以长期缓存。更新时应先发布资源文件，最后发布页面和 Service Worker，并暂时保留旧版本带哈希的资源，以兼容仍在运行的页面。

## 安装和离线使用

1. 在线打开生产构建，等待“可离线使用”。此状态表示 Service Worker 已安装，必需资源已完成预缓存。
2. 点击“安装游戏”。支持应用安装事件的浏览器会显示安装确认；其他浏览器可通过浏览器菜单安装，iOS / iPadOS 使用分享菜单的“添加到主屏幕”。
3. 安装完成后，即使没有网络，也可以重新启动、开始对局、运行 AI 和恢复本地存档，无需运行 npm 或本地服务器。

预缓存包含 HTML、JS、CSS、图标、manifest，及单独输出的 AI Worker。`verify:pwa` 检查构建文件是否全部进入预缓存、缓存键是否冲突、Worker 是否包含、图标尺寸以及子目录所需的相对路径。

安装入口会申请浏览器持久存储，获准与否由浏览器决定。存档与程序缓存分开保存。浏览器或用户清理站点数据仍可能移除离线文件和存档，重要对局可通过“导出存档”备份。

## 更新行为

新版本下载完成后显示“更新并重启”，不会自动重载正在进行的对局。更新按钮先调用存档回调；存档失败或 AI 尚在处理时不允许更新。用户确认后激活等待中的 Service Worker，再重新载入页面。应用回到前台或恢复网络时会检查更新。

## 实机验收流程

以下是可复现的验收步骤，实际执行结果记录在本次交付的测试报告中：

1. 在线安装生产构建，确认独立应用窗口和“可离线使用”。
2. 建立对局并保存，记录种子、回合、资源及单位位置。
3. 关闭全部游戏窗口；停止测试服务器或禁用网络，重新从安装图标启动。
4. 选择“继续游戏”，核对记录值，执行移动、研究、结束回合，确认 AI Worker 正常运行。
5. 保存并关闭，再次断网重启，核对新回合状态。
6. 在离线状态推进到胜利或失败界面，并检查控制台无资源加载错误。
7. 另测 64×64、10 个 AI 回合期间拖动和缩放，确认 UI 不被 AI 计算阻塞。

仅刷新已打开的网页不足以验证离线冷启动。只检查 manifest 或 Service Worker 注册也不足以证明能够离线完成对局。

## 实现参考

- [Vite PWA：更新提示](https://vite-pwa-org.netlify.app/guide/prompt-for-update)
- [Vite PWA：静态资源预缓存](https://vite-pwa-org.netlify.app/guide/static-assets)
- [web.dev：离线数据与持久存储](https://web.dev/learn/pwa/offline-data/)
