# 属性表指挥官等级上限模拟

2026-11-01，数据基线为 261031 客户端。该功能独立于配装模拟器。

## 使用口径

- 属性表的「列设置」右侧为指挥官等级，右侧紧接战术选择按钮，默认「泛用战法定制」（trend 211）。
- 留空时保持原基础属性；填写正整数后计算这个指挥官等级下的培养上限。车辆等级仍由原来的 1 / 60 / 90 / 99 切换控制。
- 假设资源充足，升满满足全部前置的科技分期，研究所有满足前置的工艺节点，并计入永久属性加成。研究时间、资源数量与账号实际进度不限制本模拟。
- 使用原生默认主炮、引擎、车体、防护；不自动换成高阶工艺。**默认主炮仍然接受对应弹种科技等级和工艺研发加成**。
- 空装备、六项强殖为 0；按车辆等级、指挥官等级及授勋门槛确定可亮星阶段，再根据每车配方计算辎械与战术魔改最高等级。
- 假设所需授勋材料充足且完成授勋，必须先满足相应等级门槛，例如蟋蟀H的二星不能提前到 35 级。
- 表格排序、数值下限、中位数差值、柱状图及散点图统一使用模拟属性。图表可独立切换四档车辆等级；复制图片保留指挥官等级和战术说明。
- 表格仍可点击打开原来的车辆详情或独立配装模拟；上限模拟不会写入它们的配置。

## 计算与存储

`app/commanderSimulation.ts` 是纯计算入口，复用 `nativeLoadout.ts` 的完整原生求值与 `loadoutMath.ts` 的科技效果合并、数值显示规则。请勿重新用简单百分比近似，也不要把亮星的 category 2 效果额外乘一次。

`useCommanderSimulation.ts` 延迟 200ms 后启动 Web Worker。一次计算全 780 车的四档车辆等级，车辆等级切换直接读取结果。输入或战术变化时取消旧任务，结果只接受当前请求；加载失败显示重试，不回退到近似值或混用旧数值。

设置单独存在 `steel-commander-simulation-v1`：`{input,tacticTrend}`。不得写入 `steel-loadout-global-tech-v1` 或 `steel-loadout-vehicle-v1:<ID>`。

Worker 使用 Vite 的 `?worker&url` 导入。当前 vinext 构建会把客户端 `import.meta.url` 改成 `file:///ROOT/...`，所以不能恢复为 `new Worker(new URL(..., import.meta.url))`；本地 HTTP 与 Pages 子路径都需要验证实际 Worker 请求。

## 原始规则与增量更新

`analysis_apk/tools/build_commander_limits.py` 接在 `prepare:data` 的 `build_loadout_support.py` 后执行。它依赖私有客户端配置，公开克隆可直接使用已生成 JSON，无需这些原文件。

来源：`ProduceRuleInfo.dat`、`DemandGroupInfo.dat`、`AwardTableInfo.dat`、`AwardGroupInfo.dat`、`AwardPoolInfo.dat`、`CapsuleFacultyTrainInfo.dat`；记录 SHA-256 于 `technology-catalog.json.commanderLimits`。

- 只解析正常研究规则 tag 1401 / 1405，排除礼包/活动直接授予工艺的规则。
- 对 54 个科技分期共 864 次升级、675 个工艺节点，共 1539 条规则递归求全部 AND 前置的最早指挥官等级。
- 当前规则需求均为 Demand type 1。craft 1 代表指挥官等级，其余为科技分期或工艺节点。必须覆盖全部目标，拒绝未知依赖、循环、多个候选规则和非单调门槛。
- 科技等级新增 `unlockCommanderLevel`。工艺节点新增 `unlockCommanderLevel`、`researchRequirements`、`researchRuleId`。当前全部科技研究的最大所需指挥官等级为 147，这不是声明游戏的指挥官等级上限。
- 核对 124 条魔改路径共 1240 条规则，补充每一级的 `phases`。正常魔改规则有全局综合索敌 property 64、资源、时间、配方选择器、前一级魔改五类需求；当前时间条件已开放且无结束时间。
- property 64 使用全部三期综合索敌等级总和；可用亮星阶段由规则的 `phases` 独立限制。不能按车辆星级截断全局综合索敌再计算。
- 当前所有路径的魔改 1–3 / 4–6 / 7–10 分别允许一星以上 / 二星以上 / 三星。仍逐条读取规则，不硬编码此分组。
- 亮星门槛来自 `star-promotions.json`，包含授勋后的实际最早车辆等级与指挥官等级。

若未来客户端增加需求类型或限制，应扩展解析并补测试，不能悄悄忽略。不要复制原始配置、ADB 数据、APK或私有探查输出到公开目录。

## 校验

在应用目录：

```bat
python -B -X utf8 ../analysis_apk/tools/build_commander_limits.py --check
npm run verify:commander-simulation
npm run verify:loadout-native
npm run verify:loadout-research
npx tsc --noEmit
npm run build
node scripts/audit-commander-simulation.mjs http://127.0.0.1:PORT
```

公开副本的 Pages 构建：

```bat
npm run build:pages
npm run verify:pages
node scripts/audit-commander-simulation.mjs --pages
```

纯计算检查包括全部车辆基础值、四档模拟结果、科技门槛/前置、蟋蟀H授勋、魔改阶段、默认主炮科技与战术差异。浏览器检查包括控件顺序、数值/排序/筛选/中位数、两种图表及实际 PNG 剪贴板、独立记忆、清空恢复、输入竞态、加载失败重试、1440/1152/390px布局和部署资源。

指挥官 90 级下，榴弹三期科技分别 16 / 13 / 9，综合索敌 14 / 10 / 6。默认工艺、车辆 90 级、泛用战法定制的 PLZ05 八维：7960 / 7695 / 2926 / 1020 / 2299 / 807 / 340 / 295；辎械/战术魔改均 3 级。这是指定假设下的上限示例，不是此前 83 级实机配装样本。

本次已通过原始配置一致性检查、780 车四档模拟检查、现有 1044 个原生面板及 5262 个组件回归、类型检查与相关 ESLint；普通构建及 Pages 构建均通过上述浏览器检查，页面异常与失败资源请求均为 0。

本次只更新源码与本地构建，未打包、提交、推送或部署。
