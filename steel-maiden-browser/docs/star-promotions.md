# 详细信息：亮星快捷刻度与消耗

## 核对结果

对全部 777 位钢舞姬逐车核对进阶及授勋配方，共 1,554 次亮星。35/70 只是进阶配方的原始等级，必须合并授勋前置条件。实际等级如下：

| 车辆数 | 亮二星 | 亮三星 | 授勋前置 |
| --- | --- | --- | --- |
| 602 | 35 级 | 70 级 | 两次亮星均不要求授勋 |
| 69 | 60 级 | 70 级 | 60 级授勋后亮二星，如蟋蟀 H（6021） |
| 106 | 35 级 | 75 级 | 75 级授勋后亮三星 |

实际等级取进阶配方等级、前次亮星等级、所需授勋等级的最大值，同时检查授勋所需阶段不晚于当前阶段。快捷刻度、材料气泡和跳转统一使用实际等级，原始门槛保留为 recipeLevel。

- 69 位的二星、175 位的三星配方要求授勋。其中 69 位在二星时已经要求授勋，因此界面只在二星气泡显示命运之勋，不在三星重复显示；另 106 位仅在三星气泡显示。
- 普通二星要求指挥官 25 级、普通三星要求指挥官 48 级；需授勋的二星/三星配方分别要求指挥官 48/72 级。这是额外门槛，不是钢舞姬自身的亮星等级。
- 消耗按每辆车的客户端配方导出，不按图纸或魔改费用猜测。包含密码子（部分空钢使用虹氨酸）、具体资材，以及部分配方的军牌。
- 命运之勋图标表示“须先完成授勋”，不列数量，不冒充本次亮星的额外消耗；军牌仍按两次亮星各自的真实消耗显示。
- 野牛 II：二星为密码子 1,600 + 秘密计划 36；三星为密码子 12,000 + 秘密计划 320，无授勋门槛。

## 客户端证据与数据链

`patch/_1.18/RanaScripts/ui/CardControlUI.lua`：

- 5058–5059：`GetTrainCapsuleFacutlyConsume` 获取本次亮星消耗。
- 5157–5173：`GetCapsuleTrainForEvolution` → `GetCapsuleTrainDemand(..., 5, false)` 读取钢舞姬等级及指挥官等级门槛。
- 5098、5241：通过 `GetFundResource` 使用原版材料图标。

`analysis_apk/extracted/lib/arm64-v8a/libasgame.so`：

- `r_GetCapsuleTrainForEvolution`（0x7eb2f4）读取 `CapsuleTypeInfo` 的 growth tag，再按当前阶段查进阶配方。
- `CapsuleFacultyTrainInfoReader::getEvolutionCapsuleFacultyTrainInfo`（0x8e98ac）按当前阶段与 growth tag 匹配。

数据来自 `CapsuleTypeInfo.dat` → `CapsuleFacultyTrainInfo.dat` 的阶段变更配方（`group_c_values` 为当前阶段、`group_d_values` 为目标阶段），通过 `group_e_ids` 连接 `DemandGroupInfo.dat`、`group_f_ids` 连接 `ConsumeGroupInfo.dat`。材料名称、图片来自 `FundTypeInfo.dat` 和 `StringTableInfo.dat`。导出中保存各配置 SHA-256。

`DemandGroupInfo` 条件：type 13 / faculty 1 = 钢舞姬等级；type 1 / craft 1 = 指挥官等级；type 13 / faculty 20 ≥ 1 = 已授勋。`ConsumeGroupInfo` type 0 = Fund 消耗。

## 实现与验证

授勋证据：`patch/_1.18/RanaScripts/ui/DevelopUI.lua` 4207–4226 按车辆标签 811/812/813 调用 `GetCapsuleTrainFromTag`，4326–4331 将配方绑定授勋按钮。对应 train 251/252/253（标签 1550），要求当前一/二/三星及自身 60/75/90 级。777 位车辆均唯一匹配；90 级授勋组的两次亮星不要求授勋，不应推迟到 90 级。

导出器逐项检查授勋配方的等级、未授勋状态、适用标签及 type 3 / 1128010 / 9 ≥ 70 的额外条件；该 70 并非钢舞姬等级。只校正等级门槛，不把授勋材料混入本次亮星消耗。

- `npm run prepare:star-promotions`：生成按客户端消耗组复用的 80 个配置、777 位车辆映射和 10 张游戏材料图标。
- `npm run verify:star-promotions`：重新核对全部原生配置及车辆覆盖、气泡去重规则、资源文件。
- `npm run audit:star-promotions`：检查谢尔曼 Mk-IV、野牛 II、不同授勋门槛、空钢及材料显示最宽的车辆，在 10 种宽度下验证全宽布局、桌面材料横排、气泡/刻度不重叠、图标与数量、点击更新和命运之勋唯一性。
- `node scripts/audit-detail-level-slider.mjs`：验证 1–99 级实时属性与排名、全部快捷刻度、拖动更新及加载失败时的新刻度禁用。

气泡只有游戏图标与数字，完整条件（含授勋等级）放在标题/可访问描述。1/60/90/99 级与当前车辆的两次实际亮星等级合并去重；成长数据加载失败时，预计算刻度仍可用，其余动态刻度和气泡等待加载完成。

相近等级的气泡按实测宽度避让，尖角仍对准实际等级，不移动刻度。尤其覆盖 60/70 级的车辆，保留全宽等级条布局。

等级条独占工具栏第二行并横贯内容区；基础属性标题及排名范围筛选放在第一行。桌面亮星材料在对应刻度上方横向常驻展示，材料较多也不增加顶部高度。窄屏按可用空间切为两列或单列，保留全部材料及刻度，避免图标、数字相互覆盖；属性及排名计算逻辑不变。
