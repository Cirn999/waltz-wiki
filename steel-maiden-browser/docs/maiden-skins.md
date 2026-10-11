# 详情页立绘与皮肤

详情页的成长区域在桌面端左右各占一半：左侧立绘，右侧四属性成长曲线。窄屏上下排列。只有默认立绘时不显示切换按钮；多套立绘通过左右按钮或方向键循环切换，显示客户端皮肤名称和画师。切换立绘不影响等级、属性、配装或成长曲线定位。

## 客户端来源

复现 `Resources/RanaScripts/ui/CardInfoUI.lua` ChangeSkin 窗口（约 19421–19480 行）的关联链：

1. `CapsuleTypeInfo` 标签与带 `120` 标签的 `ArrangedStyleInfo` 皮肤项匹配。
2. `Skin` 的数字条目 `7` 经 `FacultyTrendCategoryInfo` 映射为 trend。
3. 卡牌一期 `CapsulePhaseInfo` 中 `category_id=19` 的 `FacultyTrendGroupInfo` 将 trend 解析为 faculty。
4. 用该 faculty 的一级状态匹配 `UnitAppearanceInfo.conditional_appearances`，取得模型。
5. `Skinname`、`Painter` 的数字条目 `5` 从 `StringTableInfo` 取名。

不能把所有条件外观都作为皮肤：category 20 的 faculty 10 是默认 Live2D 展示开关，并非额外皮肤。本图库沿用档案已有默认立绘，额外关联真实皮肤。

当前配置有 **71 位车辆、88 套额外皮肤**；迷你埃普西隆（俘获型，7002）对应：

| 名称 | Skin 标签 | Trend | Faculty | 模型 |
| --- | --- | --- | --- | --- |
| 外星吃货 | 121 | 101 | 11 | 61508 |
| 埃普西隆(原生型) | 122 | 102 | 12 | 61509 |
| 星团制服 | 124 | 103 | 13 | 61515 |

模型从本地补丁、预置包、Resources 顺序查找。RMC 明确指定的完整静态立绘优先；没有明确静态立绘时渲染完整 Live2D 模型，不能直接展示其拆分纹理。导出透明 WebP，图库只加载当前立绘。

## 更新与验证

- `npm run prepare:skins`：仅更新皮肤索引和立绘，不改车辆主数据。完整 `prepare:data` 也会调用。
- `npm run audit:skins -- http://localhost:3100`：核对全部索引、图片，测试多皮肤循环、单立绘、键盘、等宽布局、窄屏、独立曲线状态、加载失败重试。检查截图位于 `.cache/skin-gallery-*.png`。
- `npm run audit:growth-curves-ui -- http://localhost:3100`：确认缩窄后的曲线点击、拖动和键盘定位仍使用正确等级。

前端索引独立保存在 `public/data/maiden-skins.json`，不增大主属性表的数据加载量。

卡牌图鉴也复用此索引进行右键换肤。每个皮肤增加 `headImage`：由皮肤模型的 `Head_Square` 配置导出原版方形头像，不从大立绘随意截头像。目前 88 套全部补齐；其中 `ftx-990` 配置指向的 `root-head_square-251` 使用已保存的原版 APK PNG 导出补足。`prepare:skins` 自动调用头像导出，详情页仍只使用立绘字段。

卡牌中的皮肤取景使用独立 `skin-card-framing.json`，按皮肤自身的原生模型坐标及导出裁边偏移生成；特殊构图有显式记录的卡面适配。`prepare:skins` 会同步重建这些数据，详情页仍完整显示原图，不应用卡牌裁切。

## PNG 大图

双击当前立绘（键盘聚焦后也可按 Enter 或空格）打开大图。保留所选默认立绘／皮肤，不改变图库位置或成长曲线；Esc、关闭按钮和遮罩可关闭大图，详情页保留。

浏览时仍使用现有 WebP；仅打开大图时，按当前资源的自然像素尺寸在浏览器中生成透明 PNG，并用原生 `img` 展示，用户可右键保存。不是将 WebP 改后缀，也不会把预览棋盘格或界面文字写进 PNG；转换不增加原资源的分辨率。关闭时回收 Blob URL。
