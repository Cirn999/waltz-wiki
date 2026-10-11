# 剧情头像映射审计（2026-10-05）

## 根因与规则

剧情中的人物身份由 `DramaHeadTemplateInfo` 指向的 `roleModelInfo` 模型确定。
`roleModelInfo.resource_a` 不能一律视为该角色的真实头像：多个仅用于剧情的 NPC
把这个字段填成了 `ctx-163`（红衣男性指挥官），黄衣指挥官甚至填成了
`ctx-026`（阿基米德/敌方战车兽）。演出立绘正确，不代表此头像字段也正确。

本次对当前全部 **550 个人物模板（含无模型占位模板）、217 个非零模型** 做了
映射清查，并逐个查看模型立绘与当前头像的对照。除已修正的黄衣指挥官与
艾莉丝两套衣服外，新增修正 **14 个 NPC 模型、25 个人物模板**。

处理规则：

- 原生独立头像与角色匹配时保留；不统一替换钢舞姬、敌人或皮肤的真实头像。
- 确认借用占位头像的模型，使用**该模型自己的演出立绘**，通过 CSS 方形裁切再圆形显示头像。
- 使用模型 ID 匹配，不按姓名、地图类型或 `PLAYER_HEAD` 统一设置；匿名版本与表情版本同样遵循模型。
- 原图不修改、不新增位图裁切文件；头像的 `avatar` 与 `image` 指向同一个已有资源。
- 无人物模型仍保留未知角色占位，不借用指挥官形象。

## 本次修正模型

| 模型 ID | 人物 | 覆盖范围 |
| --- | --- | --- |
| 11307 | 死水哨兵 | 哨兵及 A–E 等称谓 |
| 11310 | 芮蓓 | 原生剧情模型 |
| 11311 | 隆美尔 | 原生剧情模型 |
| 11315 | 病叶灰人 | 原生剧情模型 |
| 11319、11323、11324 | 克莱尔·杜邦 | 三个表情模型分别取本身立绘 |
| 11320、11322 | 洛伦斯·尼维尔 | 两个表情模型分别取本身立绘 |
| 11325 | 特勤局军官 | A–F 及未知称谓 |
| 11327 | 亚当斯·哈柏林 | 原生剧情模型 |
| 11331 | 菲尼克斯 | 原生剧情模型 |
| 11332 | 德怀特 | 原生剧情模型 |
| 11333 | 戴高乐 | 男性将军，不是艾莉丝 |

已存在的修正继续保留：`11301` 黄衣男性指挥官、`11308` 蓝衣艾莉丝、
`11309` 红衣艾莉丝。`11304` 红衣男性指挥官仍使用正确的原生 `ctx-163`。

## 实现与防回归

- `../analysis_apk/tools/build_story_catalog.py`
  - `PORTRAIT_AVATAR_CROPS` 保存逐模型人工核对的 `x / y / size / sourceWidth`。
  - `RESERVED_AVATAR_MODELS` 限制 `ctx-163` 只归属模型 `11304`、`ctx-026` 只归属模型 `6120`。
  - 新模型如果借用上述字段且没有已审核裁切配置，导出直接报错，不能静默套用。
- `public/data/story-catalog.json`：重新导出的头像、立绘及裁切元数据。
- `app/StoryArchive.tsx` 的 `Avatar`、`app/stories.css` 的 `.story-avatar.is-cropped`：
  沿用现有等比例裁切实现，不改变台词、立绘、人物左右位置、播放顺序。
- `scripts/verify-stories.mjs`：检查全部人物头像、裁切边界与实际图片尺寸；
  断言上述 NPC 头像等于自己的立绘，并禁止任何无关模型使用指挥官/阿基米德头像。
  对跨模型复用的原生头像建立已核对名单；后续出现新的复用关系会要求人工审核。
- `scripts/audit-story-avatars.mjs`：生成全部模型的立绘/头像对照截图和模型清单，
  输出到 `.cache/story-avatar-review-<label>/`，仅作为检查产物，不加入发布资源。
- `scripts/audit-stories.mjs`：真实打开“滇缅公路”（地图 ID `117`），检查克莱尔与
  洛伦斯的全部对白头像；使用原生台词测试 14 个修正模型在演出/对话记录模式中的显示。

## 验证与复现

在工作区根目录重新导出：

```sh
python -X utf8 analysis_apk/tools/build_story_catalog.py
```

在 `steel-maiden-browser` 内执行：

```sh
npm run verify:stories
node scripts/audit-story-avatars.mjs http://127.0.0.1:3010 after
node scripts/audit-stories.mjs http://127.0.0.1:3010
```

导出后需刷新已打开的页面，因为剧情目录使用内存 Promise 缓存。
安卓/离线发布继续打包最新 `public/data/story-catalog.json`（静态构建后在
`dist/client/data/story-catalog.json`），不需要重跑 Live2D 渲染，也没有新增音频依赖。
