"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import ResearchPortrait, { useResearchPortraits } from "./ResearchPortrait";
import { createManualGraph, expandManualGraph, expansionChoices, layoutManualGraph, manualEdgePath, visibleManualGraph, type ExpandDirection, type ManualGraph, type ManualResearchData } from "./researchManualGraph";
import { manualResearchPng } from "./researchManualExport";
import { deliverPng, useAndroidGalleryBridge } from "./imageDelivery";
import "./manual-research.css";
export default function ManualResearchGraph({ data, onOpenResearch, history, onHistoryChange: setHistory }: {
    data: ManualResearchData;
    onOpenResearch: (id: number) => void;
    history: ManualGraph[];
    onHistoryChange: (next: ManualGraph[] | ((current: ManualGraph[]) => ManualGraph[])) => void;
}) {
    const saved = history[history.length - 1];
    const graph = useMemo(() => visibleManualGraph(data, saved), [data, saved]);
    const nodes = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data]);
    const layout = useMemo(() => layoutManualGraph(graph), [graph]);
    const portraits = useResearchPortraits(), android = useAndroidGalleryBridge();
    const [query, setQuery] = useState("");
    const [expansion, setExpansion] = useState<{
        anchor: number;
        direction: ExpandDirection;
    } | null>(null);
    const [choice, setChoice] = useState<number | null>(null), [choiceQuery, setChoiceQuery] = useState("");
    const [exporting, setExporting] = useState(false), [notice, setNotice] = useState("");
    const panel = useRef<HTMLDivElement>(null), returnFocus = useRef<HTMLElement | null>(null);
    const viewport = useRef<HTMLDivElement>(null), flow = useRef<HTMLDivElement>(null);
    const panX = useRef(0), pending = useRef<{
        x: number;
        y: number;
    } | null>(null), frame = useRef<number | null>(null);
    const drag = useRef<{
        pointer: number;
        x: number;
        y: number;
        pan: number;
        scroll: number;
    } | null>(null);
    const suggestions = useMemo(() => query.trim() ? data.nodes.filter((node) => `${node.tank} ${node.person} ${node.id}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10) : [], [data.nodes, query]);
    const choices = useMemo(() => expansion ? expansionChoices(data, graph, expansion.anchor, expansion.direction) : [], [data, graph, expansion]);
    const visibleChoices = choices.filter((c) => `${c.node.tank} ${c.node.person} ${c.node.id}`.toLowerCase().includes(choiceQuery.trim().toLowerCase()));
    const selected = nodes.get(graph.rootId ?? -1);
    const availableWidth = useCallback(() => {
        const el = viewport.current;
        if (!el) return 704;
        const style = getComputedStyle(el);
        return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }, []);
    const clampX = useCallback((x: number) => {
        const available = availableWidth();
        const overflow = Math.max(0, layout.width - available);
        const room = Math.max(0, (available - layout.width) / 2);
        return Math.max(-overflow - 180, Math.min(room + 180, x));
    }, [layout.width, availableWidth]);
    const center = useCallback(() => {
        if (!viewport.current?.clientWidth) return;
        const root = layout.nodes.find((n) => n.id === graph.rootId);
        panX.current = clampX(availableWidth() / 2 - (root ? root.x + layout.cardWidth / 2 : layout.width / 2));
        if (flow.current) flow.current.style.transform = `translate3d(${panX.current}px,0,0)`;
    }, [layout, graph.rootId, clampX, availableWidth]);
    useEffect(() => {
        const token = requestAnimationFrame(center);
        const observer = new ResizeObserver(() => center());
        if (viewport.current) observer.observe(viewport.current);
        return () => { cancelAnimationFrame(token); observer.disconnect(); };
    }, [center]);
    const flush = () => { if (!pending.current)
        return; const next = pending.current; pending.current = null; panX.current = next.x; if (flow.current)
        flow.current.style.transform = `translate3d(${next.x}px,0,0)`; window.scrollTo({ left: 0, top: next.y, behavior: "instant" }); };
    const stop = (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointer !== event.pointerId)
        return; if (frame.current !== null)
        cancelAnimationFrame(frame.current); frame.current = null; flush(); drag.current = null; event.currentTarget.classList.remove("is-panning"); if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId); };
    useEffect(() => () => { if (frame.current !== null)
        cancelAnimationFrame(frame.current); }, []);
    const chooseRoot = (id: number) => { setHistory([createManualGraph(id)]); setQuery(""); setNotice(""); };
    const close = () => { setExpansion(null); requestAnimationFrame(() => returnFocus.current?.focus()); };
    useEffect(() => {
        if (!expansion)
            return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const token = requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>("input")?.focus());
        const key = (event: KeyboardEvent) => { if (event.key === "Escape") {
            event.preventDefault();
            setExpansion(null);
            returnFocus.current?.focus();
        } if (event.key === "Tab") {
            const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,[tabindex="0"]') ?? [])];
            const first = items[0], last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        } };
        window.addEventListener("keydown", key);
        return () => { cancelAnimationFrame(token); document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", key); };
    }, [expansion]);
    async function share() { if (exporting || !selected)
        return; setExporting(true); setNotice("正在生成PNG…"); try {
        const target = await deliverPng(manualResearchPng(graph, nodes, portraits), "steel-maiden-manual-research");
        setNotice(target === "gallery" ? "已保存到系统相册" : "已复制到剪贴板");
    }
    catch (error) {
        setNotice(error instanceof Error ? error.message : "复制失败，请重试");
    }
    finally {
        setExporting(false);
    } }
    return <section className="manual-research" aria-label="手动研发路线">
    <div className="chain-picker"><div className="chain-search-wrap"><form className="chain-search" onSubmit={(event) => { event.preventDefault(); const exact = data.nodes.find((n) => String(n.id) === query.trim().replace(/^#/, "") || n.tank.toLowerCase() === query.trim().toLowerCase() || n.person.toLowerCase() === query.trim().toLowerCase()) ?? suggestions[0]; if (exact)
        chooseRoot(exact.id); }}><span>⌕</span><input aria-label="手动模式起点" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入坦克名、人名或卡牌 ID…"/><button type="submit">选择钢舞姬</button></form>{suggestions.length > 0 && <div className="chain-suggestions">{suggestions.map((node) => <button type="button" key={node.id} onClick={() => chooseRoot(node.id)}><ResearchPortrait node={node}/><span><strong>{node.tank}</strong><small>{node.person} · #{node.id}</small></span></button>)}</div>}</div>{selected && <div className="chain-current"><ResearchPortrait node={selected}/><span><small>路线起点</small><strong>{selected.tank}</strong><em>{selected.person}</em></span><button type="button" onClick={() => setHistory([createManualGraph()])}>清空</button></div>}</div>
    {!selected ? <div className="chain-empty"><h3>请先指定一位钢舞姬</h3><p>从一个头像开始，点击上方或下方按钮，逐步展开你需要的路线。</p></div> : <>
      <div className="manual-toolbar"><span>{graph.ids.length} 位钢舞姬 · {graph.edges.length} 条关系</span><button type="button" disabled={history.length < 2} onClick={() => { setHistory((steps) => steps.slice(0, -1)); setNotice(""); }}>撤销上一步</button><button type="button" disabled={!graph.edges.length} onClick={() => { setHistory((steps) => [...steps, createManualGraph(graph.rootId)]); setNotice(""); }}>只保留起点</button><button type="button" onClick={center}>回到起点</button><button type="button" onClick={share} disabled={exporting}>{exporting ? "正在生成 PNG…" : android ? "保存图片到相册" : "复制分享图"}</button><span className="manual-export-notice" role="status">{notice}</span></div>
      <p className="manual-help">每次只展开选中的一辆；同一节点可反复扩展不同分支。双击头像查看完整研发配方。</p>
      <div className="chain-canvas"><div className="chain-scroll manual-scroll" ref={viewport} onPointerDown={(event) => { if (event.button !== 0 || (event.target as Element).closest("button,article,input"))
            return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, pan: panX.current, scroll: scrollY }; event.currentTarget.classList.add("is-panning"); event.preventDefault(); }} onPointerMove={(event) => { const current = drag.current; if (!current || current.pointer !== event.pointerId)
            return; pending.current = { x: clampX(current.pan + event.clientX - current.x), y: current.scroll - event.clientY + current.y }; if (frame.current === null)
            frame.current = requestAnimationFrame(() => { frame.current = null; flush(); }); event.preventDefault(); }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
        <div className="chain-flow manual-flow" ref={flow} style={{ width: layout.width, height: layout.height }}><svg className="chain-links" width={layout.width} height={layout.height} aria-hidden="true"><defs><marker id="manual-research-arrow" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" refX="9" refY="5" orient="auto"><path d="M0,0 L9,5 L0,10" fill="#799445"/></marker></defs>{layout.edges.map((edge) => <path className="manual-edge" data-source={edge.source} data-target={edge.target} key={`${edge.source}-${edge.target}`} d={manualEdgePath(edge)} fill="none" stroke="#799445" strokeWidth="2.5" markerEnd="url(#manual-research-arrow)"/>)}</svg>{layout.nodes.map((item) => {
                const node = nodes.get(item.id)!;
                return <article className={`manual-node${item.id === graph.rootId ? " root" : ""}`} key={item.id} data-maiden-id={item.id} style={{ left: item.x, top: item.y, width: layout.cardWidth, height: layout.cardHeight }}>
          {(["up", "down"] as const).map((direction) => <button key={direction} className={`manual-expand manual-expand-${direction}`} type="button" aria-label={`${node.tank}向${direction === "up" ? "上" : "下"}扩展`} onClick={(event) => { returnFocus.current = event.currentTarget; setExpansion({ anchor: item.id, direction }); setChoice(null); setChoiceQuery(""); }}>{direction === "up" ? "↑ 向上扩展" : "↓ 向下扩展"}</button>)}
          <button type="button" className="manual-node-identity" onDoubleClick={() => onOpenResearch(item.id)} title="双击查看研发配方"><ResearchPortrait node={node}/><strong>{node.tank}</strong><small>{node.person}</small></button>
        </article>;
            })}</div>
      </div></div>
    </>}
    {expansion && createPortal(<div className="manual-choice-backdrop"><section className="manual-choice-dialog" ref={panel} role="dialog" aria-modal="true" aria-label={`向${expansion.direction === "up" ? "上" : "下"}扩展`}><header><div><small>{nodes.get(expansion.anchor)?.tank}</small><h3>选择{expansion.direction === "up" ? "上级前置" : "下级研发车辆"}</h3></div><button type="button" onClick={close} aria-label="关闭扩展选择">×</button></header><input aria-label="检索扩展车辆" value={choiceQuery} onChange={(event) => setChoiceQuery(event.target.value)} placeholder="搜索车辆、人名或ID…"/><div className="manual-choice-list" role="radiogroup" aria-label="扩展车辆">{visibleChoices.map((item) => <button type="button" className={`manual-choice${choice === item.node.id ? " selected" : ""}`} key={item.node.id} role="radio" aria-checked={choice === item.node.id} disabled={item.status === "added" || item.status === "cycle"} onClick={() => setChoice(item.node.id)}><ResearchPortrait node={item.node}/><span><strong>{item.node.tank}</strong><small>{item.node.person}</small><em>{item.status === "added" ? "已添加此关系" : item.status === "cycle" ? "会形成回环，不能添加" : item.status === "connect" ? "已在画布，添加连线" : item.requirements.join(" / ")}</em></span></button>)}{!visibleChoices.length && <p>{choices.length ? "没有匹配的车辆" : "没有可展开的研发关系"}</p>}</div><footer><small>本次添加一辆及对应连线；完整条件请查看研发配方。</small><button type="button" onClick={close}>取消</button><button type="button" disabled={choice === null || !choices.some((item) => item.node.id === choice && (item.status === "new" || item.status === "connect"))} onClick={() => { if (choice === null)
        return; setHistory((steps) => { const base = visibleManualGraph(data, steps[steps.length - 1]); const next = expandManualGraph(data, base, expansion.anchor, expansion.direction, choice); return next === base ? steps : [...steps, next]; }); setNotice(""); close(); }}>确定</button></footer></section></div>, document.body)}
  </section>;
}
