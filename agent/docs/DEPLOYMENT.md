# 开发、安装和发布

现在准备了 GitHub Pages 手动发布配置；本次没有推送代码、启用 Pages 或发布网站。

## 四个入口的区别

| 入口 | 加载什么 | 什么时候变成新版 | 断网使用 |
| --- | --- | --- | --- |
| 开发网页 `http://127.0.0.1:5173/` | 当前源码，支持热更新 | 保存代码后由 Vite 更新 | 需本机开发服务器运行；没有 PWA 离线缓存 |
| 生产预览 `http://127.0.0.1:5174/` | 最近一次构建的 `dist/` | 重新构建后，通过更新提示载入 | 完成缓存后可离线启动 |
| 从本地地址安装的 PWA | 安装来源地址的生产版本和缓存 | 同一来源地址重新提供新版，应用检测并提示更新 | 缓存完成且未被清理时可用，无需保持本地服务器运行 |
| 将来从 GitHub Pages 安装的 PWA | Pages 发布的生产版本和缓存 | 发布新版本并联网获取更新 | 缓存完成且未被清理时可用 |

修改源码不会自动改掉已经安装的生产版本。要更新本地安装版本，需要重新构建，并在**原来的协议、主机名、端口和路径**提供新版本，再打开应用，等待“更新并重启”。当前更新流程先保存对局，AI 忙时不允许重启；普通联网检查不会强制刷新正在玩的页面。[Vite PWA 更新说明](https://vite-pwa-org.netlify.app/guide/prompt-for-update)

本地对应命令：

```bash
# 开发界面
npm run dev

# 构建、校验并提供生产版本，按顺序执行
npm run build
npm run verify:pwa
npm run preview
```

这里列出的 `5173`、`5174` 已固定在 npm 脚本中。`--strictPort` 防止端口占用时静默换地址。`vite preview` 用于本机验收，公网发布由静态托管服务提供。[Vite 静态部署说明](https://vite.dev/guide/static-deploy)

## 存档与已安装应用

浏览器按协议、主机名、端口区分来源。下面这些来源相互独立：

- `http://127.0.0.1:5173`
- `http://127.0.0.1:5174`
- `http://localhost:5174`
- `https://myoukin.github.io`

因此开发网页、本地生产版和 Pages 版的存档不会自动迁移；`localhost` 与 `127.0.0.1` 即使访问同一台电脑也不共用存档。不同浏览器、浏览器资料或设备之间也没有云同步。[浏览器同源与存储规则](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)

迁移方法：在旧入口的“设置”中导出存档 → 打开新入口 → “设置”中导入存档。若新入口已有要保留的对局，先导出其备份，再主动导入。不要为迁移清空旧应用的数据。

本地安装的 PWA 不会自动改成 GitHub Pages 应用。Pages 发布后应从 Pages 地址另行安装，再导入需要继续的存档。手机上的 `localhost` / `127.0.0.1` 指手机自己，不能用它访问电脑上的预览服务。

## GitHub Pages 发布准备

当前仓库为 [MyouKin/four-shades-of-autumn](https://github.com/MyouKin/four-shades-of-autumn)。如果采用默认项目站点地址，预计发布 URL 是 [https://myoukin.github.io/four-shades-of-autumn/](https://myoukin.github.io/four-shades-of-autumn/)；**这是根据仓库名推定的地址，目前不代表已经发布。** 项目站点的默认路径由账号与仓库名组成。[GitHub Pages 站点类型](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

已准备的 `.github/workflows/deploy-pages.yml` 只响应 `workflow_dispatch`。推送代码或提交 PR 都不会自动发布。工作流依次执行 `npm ci`、`npm test`、`npm run build`、`npm run verify:pwa`，全部通过后仅上传 `dist/` 并部署；不上传源码目录、文档或本地存档。

正式发布时：

1. 将要发布的代码、锁文件及工作流提交并推送至仓库，工作流必须存在于默认分支。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 **Actions → Deploy GitHub Pages → Run workflow** 选择要发布的分支并执行。
4. 等构建与部署都成功，打开工作流输出的实际站点链接。
5. 在线等待“可离线使用”，安装应用；另在手机上检查布局、触控与离线启动。

以上是待执行步骤，本次没有触发工作流。[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[手动运行工作流](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

Pages 负责通过 HTTPS 分发静态文件。游戏 AI 继续在玩家设备的 Web Worker 中执行；发布不会增加服务端 AI、账号、存档同步或多人对战后端。[GitHub Pages 服务性质](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## 子目录和更新验收

当前 `base: "./"` 将构建资源写为相对路径；manifest 的 `id`、`scope`、`start_url` 及 Service Worker 注册路径也相对项目目录。现阶段页面没有路径路由，因此可以将整个 `dist/` 部署在 `/four-shades-of-autumn/`，使用带结尾 `/` 的入口。无需在工作流里另行覆盖 base。[Vite 相对基础路径](https://vite.dev/guide/build#relative-base)

上线后应在实际 Pages URL 复查：

- 页面、manifest、图标、Service Worker、AI Worker 均从 `/four-shades-of-autumn/` 加载，不能误指向域名根目录。
- 安装后的启动地址仍在该目录；关闭所有窗口后，断网启动、读档和结束 AI 回合都可正常完成。
- 发布第二个版本后，旧窗口保持可操作；联网看到更新提示，主动保存并更新后可以继续旧存档。

更新应保持站点地址和应用标识稳定。后续增加路径路由、改域名或改仓库名时，需要重新检查资源路径、应用身份和存档迁移。不要通过改 `id`、清理所有站点数据或强制刷新来掩盖缓存问题。

PWA 文档建议页面、manifest 和 Service Worker 避免长期不可变缓存；Pages 的实际响应头由托管平台决定，上线后须检查更新行为，不能只根据本地预览判断更新已生效。[Vite PWA 部署要求](https://vite-pwa-org.netlify.app/deployment/)

更详细的离线流程见 [PWA.md](PWA.md)，已执行和待执行的测试分别记录在 [VERIFICATION.md](VERIFICATION.md)。
