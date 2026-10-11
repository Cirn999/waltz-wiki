# Waltz Wiki · 钢舞姬战术档案库

《钢铁华尔兹》资料查询与配装辅助网页，收录钢舞姬、装备、科技、研发、关卡、剧情、任务和地形等资料。

## 本地运行

需要 Node.js 22.13 或更新版本（建议 Node.js 24）。网页所需的整理后数据及图片已随仓库提供，运行和构建无需 APK，也无需先执行数据提取脚本。

```sh
cd steel-maiden-browser
npm ci
npm run dev
```

在浏览器中打开终端显示的本地地址。构建静态网页：

```sh
npm run build
```

构建产物不纳入 Git 仓库。

## 目录

- `steel-maiden-browser/app/`：网页界面、查询、筛选及计算逻辑。
- `steel-maiden-browser/public/data/`：档案库使用的整理后 JSON 数据。
- `steel-maiden-browser/public/art/`：网页展示所需的图片、图标和立绘。
- `steel-maiden-browser/scripts/`：资源整理脚本与校验脚本。
- `steel-maiden-browser/docs/`：功能说明、数据来源及已确认的实现规则。
- `analysis_apk/tools/`：与档案库相关的数据生成器及其依赖源码，不包含游戏原文件。

## 数据维护与校验

常规界面开发直接使用仓库中的现成数据。`prepare:*`、`sync:archive` 及部分 `verify:*` 命令用于维护者从本地游戏资源重新生成或核对数据，依赖未公开附带的客户端配置和中间分析结果，不能在刚克隆的仓库中直接运行。

下列检查不需要游戏原文件：

```sh
cd steel-maiden-browser
npx tsc --noEmit
npm run verify:atlas-team
npm run verify:technology-paths
```

浏览器回归脚本还需要 Playwright 浏览器及正在运行的本地网页，部分历史检查脚本使用 Windows 环境路径。

## 收录范围

本仓库只收录档案库源码、说明文档及网页所需的整理后数据与素材。不包含 APK、原始解包目录、游戏客户端原文件、发布压缩包、原生可执行程序、依赖目录、构建缓存、设备日志、账号凭据或旧工作区 Git 历史。

游戏名称、角色、图片、台词及相关素材的权利归各自权利人所有；仓库公开不表示这些游戏素材被重新授予开源许可。静态资料可能与正式服、活动开放状态或后续版本存在差异，以游戏内实际表现为准。
