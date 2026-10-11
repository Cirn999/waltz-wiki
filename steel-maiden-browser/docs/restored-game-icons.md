# 补齐原版国籍与空袭金桨图标

素材来源：工作区 `钢铁华尔兹.apk`，由 APK 内 `assets/Resources/config/UIStyle.dat` 的资源代码定位。只补充下列五张图片，不替换当前客户端配置、车辆属性或计算规则。

| 用途 | UIStyle 代码 | APK 资源 | 网页资源 |
| --- | --- | --- | --- |
| 瑞士（AttackType 13） | gjbz-013 | ui/root-national_flag-13.pn_ | /art/nations/gjbz-013.webp |
| 匈牙利（AttackType 14） | gjbz-014 | ui/root-national_flag-14.pn_ | /art/nations/gjbz-014.webp |
| 澳大利亚（AttackType 15） | gjbz-015 | ui/root-national_flag-15.pn_ | /art/nations/gjbz-015.webp |
| 巴西（AttackType 16） | gjbz-016 | ui/root-national_flag-16.pn_ | /art/nations/gjbz-016.webp |
| 空袭金桨 | bjk-045 | ui/comme.plist + comme.pn_，帧 comme-resume-02.pn_ | /art/magic-ordnance/bjk-045.webp |

APK 资源路径均相对于 `assets/Resources/`。金桨的调用依据是客户端 `MoSkillUI.lua` 的空袭门槛分支：任务标签 49 使用 `UIStylePictureToString('bjk-045')`；不要混用外观不同的 `root-resume-02.pn_`。

`scripts/restored-game-icons.mjs` 是统一素材导出入口：按代码读取新 APK，保留透明边缘，导出无损 WebP。全量 `prepare:data` 同样调用此入口。`prepare:restored-icons` 可以单独更新素材和现有 `maidens.json`，不必重新导出全部立绘。

国家图标同时写入 `gameIcons.nations` 和所有对应车辆的 `nationIcon`（目前共 13 辆），因此属性表、立绘卡片、详情、双车对比、配装模拟及两个筛选器复用同一资源。金桨写入 `magicProgression.markIcons.金桨`，供魔改辎械/战术的门槛与各级表使用。

验证：

- `npm run verify:restored-icons`：五张图与原始 PNG 的可见像素一致、13 辆车辆的映射完整、774 辆车辆均无国籍图片缺失。
- `npm run audit:restored-icons -- http://localhost:3100`：浏览器检查所有国家图标使用界面，以及空钢魔改辎械和战术的金桨门槛。
- `node scripts/audit-magic-cost-filters.mjs http://localhost:3100`：两个筛选器的费用选择、多选逻辑、间距与竖直分隔线。
