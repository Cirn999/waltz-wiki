# 配装模拟：原生计算对齐核验

核验日期：2026-09-22。基准为当前工作区的客户端二进制、Lua 与配置快照，不使用第三方计算器或技能文案推导公式。

## 结论与边界

配装模拟已经改为执行客户端配置所描述的计算顺序，替换原先“当前等级裸车数值 × 合计百分比，再统一加装备、最后四舍五入”的近似算法。

原生函数离线对照：1,038 组完整面板、5,259 组装备/工艺组件，11 个属性共 69,267 个整数结果逐项一致。完整面板包含全部 774 位钢舞姬的初始配置，以及升星边界、科技、装备、强殖、魔改组合；组件覆盖 2,090 个装备等级条目，分别检查正常/战术修正，另检查 440 组航空装备重复携带和 639 种工艺/默认节点。

这是**同客户端快照、同输入配置下的原生函数对照**，不是实机账号换装截图验收，也不等于穷举所有可能组合。没有登录或操作游戏账号。未配置的账号额外效果按无额外效果处理；战斗中才触发的技能、环境与临时效果不混入静态换装面板。客户端配置变化后须重新导出和核验。

## 证据链

游戏 `Resources/RanaScripts/ui/CardInfoUI.lua` 调用 `GetCardAttribute` 展示数值。客户端原生调用链为：

1. `r_GetCardAttribute`（`0x803ab4`）→ `Unit_Set::getOwnCardAttribute`（`0x7131d8`）。
2. 按卡牌实例取出配置，调用 `getCardCarryStatusLvAttribute`（`0x712f74`），开启特性修正。
3. 先收集所携带配置的特性，再逐个计算 faculty category，最后相加。
4. `getCardFacultyLvAttribute`（`0x714a18`）→ `storeAttributePair` → `computeAttributeFromRule`（`0x713864`）。
5. `computeAtrributeFromRule`（`0x849b98`）按原规则合并参数，调用原文件 `AttributeManager.lua`，在相应位置截断为整数。

核验器使用 Unicorn 执行上述 ARM64 指令。Lua 公式使用原文件，并指定与客户端一致的 Lua 5.3 大版本；初始化时执行客户端 `lua_version` 确认。仅配置读取、内存分配、全局属性存储、Lua 调用桥接由测试适配器提供，属性修正和取整没有替换成网页算法。反汇编保存在 `analysis_apk/loadout_native_trace/`。

原生库 SHA-256：

```text
38d4b2d8429f6ba95437b4e9679171014edbe094298db706bf2c7b3fb1e92836
```

## 本次修正

| 项目 | 原生规则与实现 |
| --- | --- |
| 等级与升星 | 直接计算原生成长模板；升星另有 category 2 贡献，不与升级成长混为一项。35/70 级按模拟器既定规则自动升星。 |
| 科技 | 提供各期真实全局属性 ID，由当前星级、所选节点的参数规则决定采用哪些加成和计算基数，不再按中文名称拼接总百分比。 |
| 空工艺 | 使用客户端默认 trend。引擎、车体、防护的基础科技贡献仍按原配置结算；防护科技卡片不再标为“未装备不生效”。 |
| 强殖 | 单独使用 21–26 类别的成长模板，0–12 级，直接合并到对应面板值。 |
| 魔改战术 | 按特性、参数规则及其顺序运算。“火力构造定制”1 级基础火力增益为初始火力的 92%，穿甲为 80%；其装备修正只作用于配置了该修正规则的装备槽，不作用于弹药/车体/引擎/装甲。 |
| 魔改辎械 | 保留原生基础类别与所选节点的不同计算路径；不再把文案百分比直接乘到当前车辆等级属性上。 |
| 装备 | 通过实际升级/装备配方将物品 fund ID 映射到 native trend ID，不使用 ID 算术猜测。包括航空唯一性/重复携带修正。 |
| 取整 | 模板、规则变换等中间步骤分别向零截断；不再统一 `Math.round`。负值也遵守相同规则。 |
| 阻燃/均质/覆盖 | 读取原生静态属性 11/14/13。保留装备常驻影响；去掉原先提前叠加的“防爆/净滤”战斗阶段覆盖加成。 |
| 数据缺失 | 显示未就绪/错误与重试，不显示近似值或零值，不允许复制尚未算出的面板。 |

特别注意：每件装备分别截断后再相加，可能与“全部装备先加起来再乘 35%”差 1 点；这不是精度误差，而是原生顺序。

## 文件与复现

- `app/nativeLoadout.ts`：原生规则的可移植计算实现。
- `app/loadoutMath.ts`：界面配置到真实类别、节点、科技属性的映射。
- `public/data/loadout-rules.json`：独立计算数据，打开模拟器时懒加载；不会使用详情卡片的预览数值参与结算。
- `analysis_apk/tools/build_loadout_rules.py`：重新导出。`prepare:data` 会同步调用；也可单独运行 `npm run prepare:loadout-native`。
- `analysis_apk/tools/native_loadout_oracle.py`：原生离线核验器。
- `scripts/fixtures/native-loadout.json`、`native-components.json`：原生输出的测试基准。

在 `steel-maiden-browser` 目录运行：

```text
npm run verify:loadout
npm run verify:loadout-native
npx tsc --noEmit
npm run build
```

重新生成原生基准时，在工作区根目录运行以下命令；需 `analysis_apk/pydeps` 中的 Unicorn、Lupa、pyelftools、Capstone（当前核验使用 Unicorn 2.1.4、Lupa 2.8）：

```text
python -X utf8 analysis_apk/tools/verify_native_loadout.py --all-cards
python -X utf8 analysis_apk/tools/verify_native_components.py
```

浏览器回归另检查了 12 组界面数字与原生基准、首次加载失败/重试、等级切换、空工艺科技；现有回归覆盖换装、科技编辑、自动保存、布局与剪贴板分享。

```text
npm run audit:loadout-native -- http://localhost:3100
npm run audit:loadout -- http://localhost:3100
```

另已核对 22,087 个工艺选择和 1,135,370 个兼容槽位/装备等级选择，均有对应原生配置。尚未重新发布压缩包。
