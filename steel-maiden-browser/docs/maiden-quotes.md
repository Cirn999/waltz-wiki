# 钢舞姬台词

详情页最下方的四类台词来自本地客户端，不根据人物简介或其他车辆补写。
默认收录该车辆默认模型对应的中文文本；不随立绘皮肤切换，不提供语音播放。
空分类显示“客户端暂无收录”，请求失败单独提示并可重试。

## 数据来源

- roleModelInfo.dat 的 resource_b 是实际对白文件名，不能用 modelId 代替。
- 优先 patch/_1.18/dialogueConfig/<resource_b>.zh.dc，回退 Resources/dialogueConfig。
- 原生 RoleModelCacheManager::loadRoleDialogueConfig（0x887504）、
  Config::operator>>(BufferStream&,DialogueParamItem&)（0x8895d0）核对读取格式；
  GetDialogueGroupWithModelPorpertyTag（0x810b30）按模型内标签查询，
  GetTextWithDialogueStyleId（0x810c88）取当前语言文本。
- 文件头为 u32 模型、cstring 名称、u8 条目数。条目依次为 u32 标志、标签向量、
  u8 数量的语言字符串、u8 数量的扩展字符串、表情、语音、u32 参数、动作字符串。
  每个文件都校验恰好抵达 EOF，只读中文语言槽，不跨语言借用。
- #VOICE# 前缀按 CardInfoUI 显示逻辑去除。同类别相同文本去重，剧情不去重。

## 分类与客户端调用

| 分类 | 标签 | 依据 |
| --- | --- | --- |
| 入队 | 1003 | CardControlUI、CardInfoUI |
| 授勋 | 1029 | CardInfoUI 19914/20524/20716 |
| 主界面触摸 | 1004、1034 | MainUI 5059–5070 / MainPCUI |
| 出征 | 1011 | ChapterUI 4046/4059 |
| 攻击 | 1012 | CompetitionEffect |
| 轻伤 / 重伤 / 其他受击 | 1016 / 1015 / 1024 | CompetitionEffect 9572–9577 |
| 撤退 | 1018 | CompetitionEffect |
| 胜利 / 失败 | 1019 / 1020 | BattleUI 1708/1721 |
| 战斗对白 | 1002 | CompetitionEffect 11494、11545–11550 |

1002 是战斗画面显示的对白，与攻击语音标签 1012 分开；部分车辆仅有三句通用战斗对白。
没有明确触发依据的标签不猜测分类。主界面固定模型 10685 的特殊操作不混入玩家车辆。

## 入队剧情

从 MPUI / PCUI 的 FirstMeet → MeetDrama 数组提取车辆与剧情映射，并校验两端一致。
共 19 个映射，不将任意 DRAMA 元数据误作入队剧情。
复用 DramaScriptInfo、DramaTemplateTypeInfo、DramaHeadTemplateInfo 与中文字符串解析器，
保留可见对话、旁白、提示的顺序和说话人；玩家称为“指挥官”。
不执行剧情指令、账户回调或音效。发现新增脚本扩展参数会停止生成，要求人工核对。

入队剧情与剧情一览共用 StoryChatLine 组件和 stories.css：原版头像与人物名、
脚本指定的左右气泡、居中旁白。详情页内自然展开，使用详情页滚动条，不嵌套第二条滚动条。
schemaVersion 2 增加每句的 head / side / player，以及本段涉及的人物字典；
人物图像与裁剪参数复用 story-catalog.json，校验 19 段剧情与剧情一览逐句一致。

- 缪 9879 → 20760，45 段可见文本。
- 艾丽莎 9838 → 20761，45 段可见文本。

## 同步与验证

- npm run prepare:quotes：重建 777 个按车辆拆分的 JSON 和来源索引。
- prepare:data / sync:archive 同步调用此生成器。
- npm run verify:quotes：重算比对全部文件、四类覆盖、样例及两段完整剧情。
- npm run audit:quotes -- http://127.0.0.1:56501：窄屏、键盘切换、缺失、错误重试与剧情展开。

打开详情时只请求该车文本；切车取消旧请求并重置分类，缓存最多 48 辆。
数据不进入首页首屏 JS，导出包随 public/data 一并携带，无在线 API 依赖。
