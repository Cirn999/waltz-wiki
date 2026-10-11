# 弹药对陆／对空效率

展示位置：弹药卡片标题右侧，两行纵向排列；详情、双车对比、配装当前弹药、配装弹药选择窗口、科技弹药详情共用 `AmmoEfficiency`。长名称保留独立的可换行区域，不覆盖效率或期数。

## 原始数据

- `patch/_1.18/config/UnitAttributeInfo.dat`：22 `TOGROUND`、23 `TOAIR`。
- `Resources/RanaScripts/ui/EnhanceUI.lua` 11911–11924：`GetCardFacultyAttribute(card, 1, 3, 1, trend, attribute, false)`；11952–11953：`floor(value / 100) .. "%"`。
- 卡片一期、类别 3 → `FacultyTrendGroupInfo` → 选中弹药 trend 的效果及基础类别效果 → `AttributeGrowthTemplateInfo`。基础弹药使用组内 `field_2` 默认 trend，不能用首个可研发弹药替代。
- 科技详情使用隐藏弹药 Capsule（`10000 + craftId` 标签）的属性模板，并与可装备车辆的预览值交叉核验。这样也覆盖了没有对应车辆解锁列表的炮射对空导弹等节点。
- 数值存放于 `efficiency: {ground, air}`，保留客户端万分比。它不进入 `stats`，也不参与现有八维属性加法或配装结算。
- `UIStyle`：对陆 `dlc-sx-014` → `comme-one_tank-17.pn_`，对空 `dlc-sx-013` → `comme-one_tank-16.pn_`。从补充的 `钢铁华尔兹.apk` 提取；旧解包 atlas 的同名素材是占位图，不可使用。

## 维护与验证

- `npm run prepare:ammunition-efficiency`：从客户端补充当前档案数据，只写新增效率字段，并提取原版图标。完整数据更新及科技单独更新也会执行此步骤。
- `npm run verify:ammunition-efficiency`：重新解码客户端逐项比对全部基础弹药、各期弹药和主炮科技节点。
- `npm run audit:ammunition-efficiency -- http://localhost:3100`：核验百分比格式、基础弹药切换、详情／对比／配装／科技界面、上下排列及长名称无重叠，覆盖 390–1600px 视口。
- `npm run verify:loadout-native`：确认原生面板计算不受展示字段影响。

本次覆盖 777 辆车、9637 条各车弹药配置、330 种可装备弹药、341 个主炮科技节点。例：丘吉尔 Mk-I 的穿甲爆破弹（中口径），原始值 10000 / 7500，显示 100% / 75%。
