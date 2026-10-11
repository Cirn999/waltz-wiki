"use client";
/* eslint-disable @next/next/no-img-element -- all images are local client assets */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import GenerationTabs, { generationIcons } from "./GenerationTabs";
import CraftProperties from "./CraftProperties";
import AmmoEfficiency from "./AmmoEfficiency";
import { assessmentIcon, equipmentAssessment, magicAssessment } from "./loadoutAssessment";
import { loadNativeLoadoutRules, type NativeLoadoutRules } from "./nativeLoadout";
import { deliverPng, useAndroidGalleryBridge } from "./imageDelivery";
import {
  calculateSimStats, clampLevel, craftGeneration, craftLockReason, defaultAmmo, defaultSimConfig,
  findCraftTech, maximumMagicLevel, normalizeSimConfig, relevantTechBranches,
  simStats, starCount, technologyPath,
  type SimColonization, type SimColonizationKey, type SimConfig, type SimCraft,
  type SimEquipmentData, type SimEquipmentFamily, type SimMaiden, type SimMagicData,
  type SimMagicSkill, type SimTechData, type SimTechLevels,
} from "./loadoutMath";
import "./loadout.css";

type Picker = { kind: "ammo" | "engine" | "body" | "armor" | "equipment" | "ordnance" | "tactics"; slot?: number };
type Branch = { category: string; secondary: string; image?: string };
const fieldByPicker = { ammo: "ammoId", engine: "engineId", body: "bodyId", armor: "armorId" } as const;
const pickerNames = { ammo: "弹药", engine: "引擎", body: "车体", armor: "装甲", equipment: "装备", ordnance: "魔改辎械", tactics: "魔改战术" };
const categoryByPicker = { ammo: "主炮", engine: "引擎", body: "车体", armor: "防护" } as const;
const formatted = (value: number | null) => value === null ? "—" : value.toLocaleString("zh-CN");
const resumeSprite = (number: number) => `/art/technology/resume/resume-resume-${String(number).padStart(2, "0")}.png`;
// UIStyle.dat maps each phase's bjk code to a resume background; ArrangedStyleInfo.dat pairs it with a branch symbol.
const resumeBackgrounds: Record<string, number> = {
  "bjk-007": 1, "bjk-008": 2, "bjk-009": 3,
  "bjk-010": 4, "bjk-011": 5, "bjk-012": 6,
  "bjk-013": 7, "bjk-014": 8, "bjk-015": 9,
  "bjk-016": 10, "bjk-017": 11, "bjk-018": 12,
  "bjk-032": 25, "bjk-033": 26, "bjk-034": 27,
};
const resumeSymbols: Record<string, number> = {
  "常规弹": 15, "硬芯弹": 18, "脱壳弹": 14, "榴弹": 17, "火箭弹": 13, "破甲弹": 16, "碎甲弹": 19,
  "标准防护": 22, "重装防护": 21, "轻薄防护": 20,
  "综合车身": 24, "综合引擎": 28, "综合索敌": 23,
  // The APK resume atlas stops at 28; these aircraft branches reuse the corresponding ground-class symbol.
  "航空常规弹": 15, "航空火箭弹": 13, "航空防护": 22, "航空机身": 24, "航空引擎": 28,
};
const largeSlotIcons: Record<string, string> = {
  "炮座": "/art/slots/ico-mark/ico_mark-ico_mark-01.png",
  "内舱": "/art/slots/ico-mark/ico_mark-ico_mark-02.png",
  "外身": "/art/slots/ico-mark/ico_mark-ico_mark-03.png",
  "内壁": "/art/slots/ico-mark/ico_mark-ico_mark-04.png",
  "炮架": "/art/slots/ico-mark/ico_mark-ico_mark-05.png",
  "特殊": "/art/slots/ico-mark/ico_mark-ico_mark-06.png",
  "改装": "/art/slots/ico-mark/ico_mark-ico_mark-07.png",
};

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : null; }
  catch { return null; }
}

export default function LoadoutSimulator({ maiden, equipment, technology, magic, attributeIcons, onClose }: {
  maiden: SimMaiden;
  equipment: SimEquipmentData;
  technology: SimTechData;
  colonization?: SimColonization;
  magic?: SimMagicData;
  attributeIcons: Record<string, string>;
  onClose: () => void;
}) {
  const vehicleKey = `steel-loadout-vehicle-v1:${maiden.id}`;
  const techKey = "steel-loadout-global-tech-v1";
  const [tech, setTech] = useState<SimTechLevels>(() => readStorage<SimTechLevels>(techKey) ?? {});
  const [config, setConfig] = useState<SimConfig>(() => normalizeSimConfig(maiden, readStorage<SimConfig>(vehicleKey) ?? defaultSimConfig(maiden), equipment, technology, readStorage<SimTechLevels>(techKey) ?? {}, magic));
  const [picker, setPicker] = useState<Picker | null>(null);
  const [pickerRank, setPickerRank] = useState(1);
  const [equipmentPickerLevel, setEquipmentPickerLevel] = useState(1);
  const [pickerQuery, setPickerQuery] = useState("");
  const [editingTech, setEditingTech] = useState<Branch | null>(null);
  const [draftTech, setDraftTech] = useState([0, 0, 0]);
  const [shareState, setShareState] = useState<"idle" | "working" | "copied" | "saved" | "error">("idle");
  const androidGallery = useAndroidGalleryBridge();
  const [notice, setNotice] = useState("");
  const [rules, setRules] = useState<NativeLoadoutRules | null>(null);
  const [rulesError, setRulesError] = useState("");
  const [rulesRetry, setRulesRetry] = useState(0);
  const captureRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    loadNativeLoadoutRules().then((data) => {
      if (!data.cards[maiden.id]) throw new Error(`缺少钢舞姬 #${maiden.id} 的原生配装规则`);
      if (active) { setRules(data); setRulesError(""); }
    }).catch((cause: unknown) => {
      if (active) setRulesError(cause instanceof Error ? cause.message : "原生配装数据加载失败");
    });
    return () => { active = false; };
  }, [maiden.id, rulesRetry]);

  useEffect(() => { try { window.localStorage.setItem(vehicleKey, JSON.stringify(config)); } catch { /* Browsing still works without storage. */ } }, [config, vehicleKey]);
  const changeTech = (next: SimTechLevels) => {
    setTech(next);
    setConfig((current) => normalizeSimConfig(maiden, current, equipment, technology, next, magic));
    try { window.localStorage.setItem(techKey, JSON.stringify(next)); } catch { /* Keep current session state. */ }
  };
  const closeDialog = () => { setPicker(null); setEditingTech(null); };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (picker || editingTech) closeDialog(); else onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [picker, editingTech, onClose]);

  const calculation = useMemo(() => {
    if (!rules) return { result: null, error: "" };
    try { return { result: calculateSimStats(maiden, config, equipment, technology, tech, rules), error: "" }; }
    catch (cause) { return { result: null, error: cause instanceof Error ? cause.message : "配装计算失败" }; }
  }, [maiden, config, equipment, technology, tech, rules]);
  const result = calculation.result;
  const equipmentGrade = equipmentAssessment(maiden.slotDetails.length, config.equipment, equipment);
  const magicGrade = magicAssessment(config.ordnance, config.tactics);
  const calculationError = rulesError || calculation.error;
  const branches: Branch[] = useMemo(() => relevantTechBranches(maiden, config, technology, rules ?? undefined), [maiden, config, technology, rules]);
  const activeAmmo = maiden.allAmmunition.find((item) => item.id === config.ammoId);
  const activeEngine = maiden.engineOptions.find((item) => item.id === config.engineId);
  const activeBody = maiden.bodyOptions.find((item) => item.id === config.bodyId);
  const activeArmor = maiden.armorOptions.find((item) => item.id === config.armorId);
  const scoutLevel = technology.blocks.filter((block) => block.secondary === "综合索敌" && block.generation <= starCount(config.level)).reduce((total, block) => total + (tech[block.id] ?? 0), 0);

  const openPicker = (kind: Picker["kind"], slot?: number) => {
    if (kind === "equipment" && slot !== undefined && config.equipment[slot]?.familyId) setEquipmentPickerLevel(config.equipment[slot].level);
    setPicker({ kind, slot }); setPickerRank(1); setPickerQuery("");
  };
  const openTech = (branch: Branch) => {
    setPicker(null);
    setEditingTech(branch);
    setDraftTech([1, 2, 3].map((generation) => tech[technology.blocks.find((block) => block.category === branch.category && block.secondary === branch.secondary && block.generation === generation)?.id ?? ""] ?? 0));
  };
  const saveTech = () => {
    if (!editingTech) return;
    const next = { ...tech };
    for (const generation of [1, 2, 3]) {
      for (const block of technology.blocks) {
        if (block.generation !== generation || block.category !== editingTech.category) continue;
        if (editingTech.category !== "主炮" && block.secondary !== editingTech.secondary) continue;
        next[block.id] = clampLevel(draftTech[generation - 1], 0, 16);
      }
    }
    changeTech(next);
    setEditingTech(null);
    setNotice(editingTech.category === "主炮" ? "所有弹种的各期科技等级已同步；当前仅计算携带弹种的加成。" : "科技等级已保存；不再满足条件的工艺和魔改会自动卸下或降级。");
  };
  const changeVehicleLevel = (level: number) => setConfig((current) => normalizeSimConfig(maiden, { ...current, level: clampLevel(level, 1, 99) }, equipment, technology, tech, magic));
  const resetVehicle = () => { setConfig(defaultSimConfig(maiden)); setNotice("本车配装已重置，全局科技配置保留。"); };

  const share = useCallback(async () => {
    const target = captureRef.current;
    if (!result) { setNotice(`原生配装数据尚未就绪，暂不能${androidGallery ? "保存" : "复制"}配装数值。`); return; }
    if (!target || shareState === "working") return;
    setShareState("working");
    target.dataset.exporting = "true";
    try {
      await document.fonts?.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const width = Math.ceil(target.scrollWidth);
      const height = Math.ceil(target.scrollHeight);
      const ratio = Math.max(.7, Math.min(1.5, window.devicePixelRatio || 1, 14000 / width, 14000 / height, Math.sqrt(56_000_000 / (width * height))));
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(target, { backgroundColor: "#f5f9f2", cacheBust: true, pixelRatio: ratio, width, height, style: { height: `${height}px`, maxHeight: "none", overflow: "visible" }, filter: (node) => !(node instanceof HTMLElement && node.classList.contains("share-export-hide")) });
      if (!blob) throw new Error("截图引擎没有返回图像");
      const destination = await deliverPng(blob, `steel-maiden-loadout-${maiden.id}`);
      setShareState(destination === "gallery" ? "saved" : "copied");
      setTimeout(() => setShareState("idle"), 2600);
    } catch (error) { console.error("Loadout share failed", error); setShareState("error"); setTimeout(() => setShareState("idle"), 4200); }
    finally { delete target.dataset.exporting; }
  }, [shareState, result, androidGallery, maiden.id]);

  const chosenCraftCard = (kind: "ammo" | "engine" | "body" | "armor", item: SimCraft | undefined, icon: string) => {
    const rankLabel = item ? `${craftGeneration(technology, categoryByPicker[kind], item)}期` : kind === "ammo" ? "基础" : "—";
    return <button className={`sim-craft-card ${item ? "filled" : ""}`} type="button" onClick={() => openPicker(kind)} aria-label={`选择${pickerNames[kind]}，当前${item?.name ?? "空"}`}>
      <span className="sim-craft-main"><span className="sim-craft-art"><img src={item?.image || icon} alt="" /></span><span className="sim-craft-copy"><small className={kind === "ammo" ? "sim-ammo-meta" : undefined}>{pickerNames[kind]}{kind === "ammo" && <span className="sim-craft-rank">{rankLabel}</span>}</small><strong title={item?.name}>{item?.name ?? (kind === "ammo" ? `基础${maiden.ammo?.[0] ?? "弹药"}` : "未装备")}</strong></span>{kind === "ammo" ? <AmmoEfficiency value={item ? item.efficiency : maiden.baseAmmoEfficiency} /> : <span className="sim-craft-rank">{rankLabel}</span>}</span>
      {item && <span className="sim-craft-details">
        <CraftProperties item={item} ammunition={kind === "ammo"} simulator traits={findCraftTech(technology, categoryByPicker[kind], item.id, item.rank)?.node.traits} />
      </span>}
    </button>;
  };

  const magicCard = (kind: "ordnance" | "tactics") => {
    const selected = config[kind];
    const options = kind === "ordnance" ? maiden.magicOrdnance : magic?.tactics ?? [];
    const skill = options.find((item) => item.trendId === selected.trendId);
    const max = maximumMagicLevel(maiden, magic, kind, scoutLevel);
    const path = technologyPath(magic, maiden.magicSelectors[kind]);
    const next = path?.levels.find((entry) => entry.level === selected.level + 1);
    const ordnanceEffect = kind === "ordnance" ? maiden.magicOrdnance.find((item) => item.trendId === selected.trendId)?.levels.find((item) => item.level === selected.level) : undefined;
    const tacticEffects = kind === "tactics" ? magic?.tactics.find((item) => item.trendId === selected.trendId)?.levels.find((item) => item.level === selected.level)?.effects : undefined;
    const label = kind === "ordnance" ? "辎械" : "战术";
    return <div className="sim-magic-row" key={kind} data-magic-kind={kind}>
      <button className="sim-magic-select" type="button" onClick={() => openPicker(kind)} aria-label={`选择魔改${label}，当前${skill?.name ?? "未携带"}`}><span className="sim-magic-art">{skill?.image ? <img src={skill.image} alt="" /> : <img src={kind === "ordnance" ? "/art/magic-ordnance/mgj-024.webp" : "/art/magic-ordnance/mgj-002.webp"} alt="" />}</span><span><small>{label}</small><strong>{skill?.name ?? "未携带"}</strong></span></button>
      <label className="sim-magic-level"><span>等级</span><input type="number" min={0} max={max} value={selected.level} aria-label={`${kind === "ordnance" ? "辎械" : "战术"}等级`} disabled={!skill || max === 0} onChange={(event) => setConfig((current) => ({ ...current, [kind]: { ...current[kind], level: clampLevel(Number(event.target.value), 0, max) } }))} /></label>
      <div className="sim-magic-effect" aria-live="polite">
        {!skill ? <p className="sim-magic-empty">点击图标选择{label}</p> : selected.level === 0 ? <p className="sim-magic-empty">未魔改，暂无该级技能效果</p> : kind === "tactics" ? tacticEffects?.length ? tacticEffects.map((effect) => <p key={effect.name}>{effect.description}</p>) : <p className="sim-magic-empty">暂无该级效果数据</p> : ordnanceEffect ? <>
          <p>{ordnanceEffect.effect}</p>
          {ordnanceEffect.condition && <small className="sim-magic-condition">发动条件：{ordnanceEffect.condition}</small>}
        </> : <p className="sim-magic-empty">暂无该级效果数据</p>}
      </div>
      <small className="sim-magic-requirement">{max === 0 ? "需提升索敌科技" : next ? `下级需索敌 ${next.scoutLevel} 级` : "已达当前上限"}</small>
    </div>;
  };

  const renderTechnologyTile = (branch: Branch) => {
    const blocks = technology.blocks.filter((block) => block.category === branch.category && block.secondary === branch.secondary);
    const total = blocks.filter((block) => block.generation <= starCount(config.level)).reduce((sum, block) => sum + (tech[block.id] ?? 0), 0);
    const phase = blocks.find((block) => block.generation === starCount(config.level)) ?? blocks.at(-1);
    const background = resumeBackgrounds[phase?.iconCode ?? ""];
    const symbol = resumeSymbols[branch.secondary];
    const state = `生效等级 ${total}`;
    return <button key={`${branch.category}:${branch.secondary}`} className="sim-tech-tile" type="button" onClick={() => openTech(branch)} title={`${branch.secondary} · ${state}`} aria-label={`设置${branch.secondary}科技，${state}`}>
      {background && <img className="sim-tech-backdrop" src={resumeSprite(background)} alt="" />}
      {symbol && <img className="sim-tech-symbol" src={resumeSprite(symbol)} alt="" />}
      <strong>{total}</strong><span>{branch.secondary}</span>
    </button>;
  };

  const pickerOptions: SimCraft[] = picker?.kind === "ammo" ? maiden.allAmmunition : picker?.kind === "engine" ? maiden.engineOptions : picker?.kind === "body" ? maiden.bodyOptions : picker?.kind === "armor" ? maiden.armorOptions : [];
  const pickerFamilies = picker?.kind === "equipment" ? equipment.families.filter((family) => {
    const slot = maiden.slotDetails[picker.slot ?? -1];
    return equipment.slots.some((item) => item.tag === family.slotTag && item.icon === slot?.image);
  }) : [];
  const lowerQuery = pickerQuery.trim().toLocaleLowerCase();
  const visibleCrafts = pickerOptions.filter((item) => craftGeneration(technology, categoryByPicker[picker!.kind as "ammo" | "engine" | "body" | "armor"], item) === pickerRank && (!lowerQuery || item.name.toLocaleLowerCase().includes(lowerQuery)));
  const visibleFamilies = pickerFamilies.filter((item) => !lowerQuery || item.name.toLocaleLowerCase().includes(lowerQuery));
  const magicOptions: SimMagicSkill[] = picker?.kind === "ordnance" ? maiden.magicOrdnance : picker?.kind === "tactics" ? magic?.tactics ?? [] : [];
  const techDialogBlocks = editingTech ? [1, 2, 3].map((generation) => technology.blocks.find((block) => block.category === editingTech.category && block.secondary === editingTech.secondary && block.generation === generation)) : [];

  if (typeof document === "undefined") return null;
  return createPortal(<div className="sim-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section ref={captureRef} className="sim-shell share-capture-surface" role="dialog" aria-modal="true" aria-label={`${maiden.tank} 配装模拟`}>
      <header className="sim-header">
        <div className="sim-title">
          {maiden.nationIcon && <img className="sim-identity-nation" src={maiden.nationIcon} alt="国籍" />}
          {maiden.classIcon && <img className="sim-identity-class" src={maiden.classIcon} alt="车种" />}
          {(equipmentGrade > 0 || magicGrade > 0) && <span className="sim-assessments" aria-live="polite">
            <span className="sim-assessment" data-assessment="equipment">{equipmentGrade > 0 && <img src={assessmentIcon("equipment", equipmentGrade)} alt={`装备评估${equipmentGrade}星`} />}</span>
            <span className="sim-assessment" data-assessment="magic">{magicGrade > 0 && <img src={assessmentIcon("magic", magicGrade)} alt={`魔改评估${magicGrade}星`} />}</span>
          </span>}
          <span className="sim-identity-names"><em>{maiden.person}</em><strong>{maiden.tank}</strong></span>
        </div>
        <div className="sim-top-controls"><label>等级 <input type="number" min={1} max={99} value={config.level} onChange={(event) => changeVehicleLevel(Number(event.target.value))} aria-label="钢舞姬等级" /></label><span className="sim-stars" aria-label={`${starCount(config.level)}星`}>{"★".repeat(starCount(config.level))}{"☆".repeat(3 - starCount(config.level))}</span><button className="share-export-hide" type="button" onClick={resetVehicle}>重置本车</button><button className="sim-share share-export-hide" type="button" onClick={share} disabled={shareState === "working"}>{shareState === "working" ? (androidGallery ? "正在保存…" : "正在复制…") : shareState === "saved" ? "已保存到相册" : shareState === "copied" ? "已复制图片" : shareState === "error" ? (androidGallery ? "保存失败，重试" : "复制失败，重试") : (androidGallery ? "保存图片到相册" : "复制分享图")}</button><button className="sim-close share-export-hide" type="button" onClick={onClose} aria-label="返回钢舞姬详情">×</button></div>
      </header>
      {!result && <div className="sim-growth-status" role={calculationError ? "alert" : "status"}>{calculationError ? `暂不能计算：${calculationError}` : "正在加载原生配装计算数据…"}{rulesError && <button type="button" onClick={() => { setRulesError(""); setRulesRetry((value) => value + 1); }}>重试</button>}</div>}
      <div className="sim-stat-strip" aria-live="polite">{simStats.map(({ key, label }) => <div className="sim-stat" key={key}><span>{attributeIcons[label] && <img src={attributeIcons[label]} alt="" />}{label}</span><strong>{formatted(result?.values[key] ?? null)}</strong></div>)}{(["fireproof", "homogeneity", "coverage"] as const).map((key) => { const label = { fireproof: "阻燃", homogeneity: "均质", coverage: "覆盖" }[key]; return <div className="sim-stat sim-grade" key={key} title={result ? `${label}：原生静态面板 ${formatted(result.grades[key].value)}，其中装备贡献 ${result.gradeBonuses[key] >= 0 ? "+" : ""}${result.gradeBonuses[key]}；不计战斗中触发的临时效果` : "原生配装数据加载中"}><span>{attributeIcons[label] && <img src={attributeIcons[label]} alt="" />}{label}</span><strong>{result?.grades[key].grade ?? "—"}</strong><small>{formatted(result?.grades[key].value ?? null)}</small></div>; })}</div>
      <div className="sim-content-grid">
        <section className="sim-panel sim-build-panel" aria-label="弹药工艺与装备">
          <div className="sim-build-main">
          <div className="sim-panel-heading"><h3>弹药与各期工艺</h3><small>点击游戏图标更换</small></div>
          <div className="sim-craft-layout">
            <div className="sim-portrait"><img src={maiden.image} alt={`${maiden.tank}立绘`} /></div>
            <div className="sim-craft-grid">{chosenCraftCard("ammo", activeAmmo, defaultAmmo(maiden)?.image ?? "")}{chosenCraftCard("body", activeBody, maiden.bodyOptions[0]?.image ?? "")}{chosenCraftCard("engine", activeEngine, maiden.engineOptions[0]?.image ?? "")}{chosenCraftCard("armor", activeArmor, maiden.armorOptions[0]?.image ?? "")}</div>
          </div>
          </div>
          <div className="sim-equipment-section">
          <div className="sim-panel-heading sim-equipment-heading"><h3>装备槽</h3><small>选择窗口中输入 S 级，再点装备即可应用</small></div>
          <div className="sim-equipment-grid">{maiden.slotDetails.map((slot, index) => {
            const choice = config.equipment[index];
            const family = equipment.families.find((item) => item.id === choice?.familyId);
            const currentLevel = family?.levels.find((item) => item.level === choice?.level);
            return <div className={`sim-equipment-slot ${family?.advanced ? "advanced" : ""}${family ? "" : " empty"}`} key={`${slot.name}-${index}`}>
              <button type="button" onClick={() => openPicker("equipment", index)} title={family ? `${slot.name} · ${family.name} S${choice.level}` : `${slot.name} · 空槽`} aria-label={`选择第${index + 1}个${slot.name}槽装备`}><img src={currentLevel?.icon || largeSlotIcons[slot.name] || slot.image} alt="" />{family && <b>S{choice.level}</b>}<img className="sim-slot-badge" src={slot.image} alt="" /></button>
            </div>;
          })}</div>
          </div>
        </section>
        <section className="sim-panel sim-adjust-panel" aria-label="强殖魔改与科技">
          <div className="sim-adjust-main">
            <div className="sim-panel-heading"><h3>强殖</h3><small>每项 0–12 级</small></div><div className="sim-colonization-grid">{simStats.slice(0, 6).map(({ key, label }) => <label className="sim-colonization" key={key}>{attributeIcons[label] && <img src={attributeIcons[label]} alt="" />}<span>{label}</span><input type="number" min={0} max={12} value={config.colonization[key as SimColonizationKey]} onChange={(event) => setConfig((current) => ({ ...current, colonization: { ...current.colonization, [key]: clampLevel(Number(event.target.value), 0, 12) } }))} aria-label={`${label}强殖等级`} /></label>)}</div>
            <div className="sim-panel-divider" /><div className="sim-panel-heading"><h3>魔改</h3><small>等级受索敌科技限制</small></div><div className="sim-magic-list">{magicCard("tactics")}{magicCard("ordnance")}</div>
          </div>
          <div className="sim-technology-section"><div className="sim-panel-divider" /><div className="sim-panel-heading sim-technology-heading"><h3>生效科技</h3><small>点图标设置各期等级 · 全局共享</small></div><div className="sim-tech-grid">{branches.map(renderTechnologyTile)}</div></div>
        </section>
      </div>
      <footer className="sim-footer"><span>按客户端原生规则逐项结算与取整；升星、科技、强殖和魔改单独计入。空工艺仍按本车默认配置结算科技。</span><span>{notice || "本车配置自动保存，科技配置对所有钢舞姬生效。"}</span><small>显示换装后的静态面板；不叠加战斗中触发的技能、环境或临时效果。</small></footer>
    </section>
    {(picker || editingTech) && <div className="sim-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}><section className="sim-dialog" role="dialog" aria-modal="true" aria-label={editingTech ? `设置${editingTech.category === "主炮" ? "全部弹种" : editingTech.secondary}科技` : `选择${pickerNames[picker!.kind]}`}><header><div><strong>{editingTech ? `${editingTech.category === "主炮" ? "全部弹种" : editingTech.secondary}科技` : `选择${pickerNames[picker!.kind]}`}</strong><small>{editingTech ? editingTech.category === "主炮" ? "一／二／三期等级同步应用于全部弹种；仅当前携带弹种生效" : "每期 0–16 级；科技全局共享" : "游戏素材与科技解锁条件"}</small></div><button type="button" onClick={closeDialog} aria-label="关闭选择">×</button></header>
      {editingTech ? <><div className="sim-tech-editor"><div className="sim-tech-editor-icon"><img src={editingTech.image || techDialogBlocks.find((block) => block?.nodes[0]?.image)?.nodes[0]?.image || attributeIcons["侦查"]} alt="" /></div>{techDialogBlocks.map((block, index) => <label key={index} className="sim-tech-phase"><img src={generationIcons[index]} alt="" /><span>{index + 1}期{index + 1 > starCount(config.level) && <small>本车尚未生效</small>}</span><input type="number" min={0} max={16} value={draftTech[index]} onChange={(event) => setDraftTech((current) => current.map((value, phase) => phase === index ? clampLevel(Number(event.target.value), 0, 16) : value))} aria-label={`${index + 1}期科技等级`} disabled={!block} /></label>)}</div><div className="sim-dialog-actions"><button type="button" onClick={closeDialog}>取消</button><button className="primary" type="button" onClick={saveTech}>保存科技等级</button></div></> : <><div className="sim-picker-toolbar"><input type="search" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="搜索名称" aria-label="搜索可选内容" />{picker?.kind === "equipment" && <label className="sim-picker-equipment-level">装备等级 <input type="number" min={1} max={10} value={equipmentPickerLevel} onChange={(event) => setEquipmentPickerLevel(clampLevel(Number(event.target.value), 1, 10))} aria-label="待选择装备的等级" /><strong>S{equipmentPickerLevel}</strong></label>}{picker && ["ammo", "engine", "body", "armor"].includes(picker.kind) && <GenerationTabs className="sim-picker-ranks" selected={pickerRank} onSelect={setPickerRank} label={`${pickerNames[picker.kind]}期数`} />}</div><div className="sim-option-grid">
        {picker?.kind === "ammo" && <button className="sim-option sim-option-base-ammo" type="button" onClick={() => { setConfig((current) => ({ ...current, ammoId: 0 })); closeDialog(); }}><img src={defaultAmmo(maiden)?.image} alt="" /><span className="sim-craft-copy"><strong>基础{maiden.ammo?.[0] ?? "弹药"}</strong><small>仅保留弹种，不附加弹药面板属性</small></span><AmmoEfficiency value={maiden.baseAmmoEfficiency} /></button>}
        {picker?.kind && ["engine", "body", "armor", "equipment"].includes(picker.kind) && <button className="sim-option sim-option-empty" type="button" onClick={() => { if (picker.kind === "equipment") setConfig((current) => ({ ...current, equipment: current.equipment.map((slot, index) => index === picker.slot ? { familyId: null, level: 1 } : slot) })); else setConfig((current) => ({ ...current, [fieldByPicker[picker.kind as "engine" | "body" | "armor"]]: null })); closeDialog(); }}><span>空槽</span><strong>不装备</strong></button>}
        {picker && ["ammo", "engine", "body", "armor"].includes(picker.kind) && visibleCrafts.map((item) => {
          const kind = picker.kind as "ammo" | "engine" | "body" | "armor";
          const reason = craftLockReason(maiden, technology, tech, categoryByPicker[kind], item, config.level);
          const unlock = findCraftTech(technology, categoryByPicker[kind], item.id, item.rank);
          return <div className={`sim-option sim-option-craft ${reason ? "locked" : ""}`} key={item.id} data-craft-id={item.id}>
            <button type="button" disabled={Boolean(reason)} onClick={() => { setConfig((current) => ({ ...current, [fieldByPicker[kind]]: item.id })); closeDialog(); }}>
              <span className="sim-craft-main"><span className="sim-craft-art"><img src={item.image} alt="" /></span><span className="sim-craft-copy"><strong title={item.name}>{item.name}</strong><small>{craftGeneration(technology, categoryByPicker[kind], item)}期{reason ? ` · ${reason}` : " · 可装备"}</small></span>{kind === "ammo" && <AmmoEfficiency value={item.efficiency} />}</span>
              <span className="sim-craft-details"><CraftProperties item={item} ammunition={kind === "ammo"} simulator traits={unlock?.node.traits} /></span>
            </button>
            {reason && unlock && <button className="sim-option-tech" type="button" title={`设置${unlock.block.secondary}科技`} aria-label={`设置${unlock.block.secondary}科技`} onClick={() => openTech({ category: unlock.block.category, secondary: unlock.block.secondary, image: unlock.node.image })}><img src={unlock.node.image} alt="" /><span>调整科技</span></button>}
          </div>;
        })}
        {picker?.kind === "equipment" && [false, true].flatMap((advanced) => visibleFamilies.filter((item) => item.advanced === advanced).map((family: SimEquipmentFamily) => {
          const appliedLevel = clampLevel(equipmentPickerLevel, family.levels[0]?.level ?? 1, family.levels.at(-1)?.level ?? 10);
          const levelIcon = family.levels.find((item) => item.level === appliedLevel)?.icon ?? family.icon;
          return <button className={`sim-option sim-equipment-option ${advanced ? "advanced" : ""}`} type="button" key={family.id} onClick={() => { setConfig((current) => ({ ...current, equipment: current.equipment.map((slot, index) => index === picker.slot ? { familyId: family.id, level: appliedLevel } : slot) })); closeDialog(); }}><span className="sim-option-equipment-art"><img src={levelIcon} alt="" /><img src={family.typeIcon} alt="" /><b>S{appliedLevel}</b></span><span><strong>{family.name}</strong><small>{advanced ? "高级装备" : "普通装备"} · 选择 S{appliedLevel}</small></span></button>;
        }))}
        {picker && (picker.kind === "ordnance" || picker.kind === "tactics") && <button className="sim-option sim-option-empty" type="button" onClick={() => { setConfig((current) => ({ ...current, [picker.kind]: { trendId: null, level: 0 } })); closeDialog(); }}><span>空</span><strong>不携带</strong></button>}
        {picker && (picker.kind === "ordnance" || picker.kind === "tactics") && magicOptions.filter((item) => !lowerQuery || item.name.toLocaleLowerCase().includes(lowerQuery)).map((skill) => <button className="sim-option sim-skill-option" type="button" key={skill.trendId} onClick={() => { const kind = picker.kind as "ordnance" | "tactics"; setConfig((current) => ({ ...current, [kind]: { trendId: skill.trendId, level: Math.min(current[kind].level, maximumMagicLevel(maiden, magic, kind, scoutLevel)) } })); closeDialog(); }}><img src={skill.image} alt="" /><strong>{skill.name}</strong></button>)}
      </div></>}
    </section></div>}
  </div>, document.body);
}
