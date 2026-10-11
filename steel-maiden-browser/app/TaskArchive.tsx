"use client";
/* eslint-disable @next/next/no-img-element -- original client reward sprites */
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameTask, TaskCatalog, TaskCondition } from "./taskTypes";
import { taskHiddenReason, taskRewardLabel } from "./taskAvailability";
import "./tasks.css";

let request: Promise<TaskCatalog> | undefined;
function loadTasks() {
  if (!request) request = fetch("/data/task-catalog.json").then(async (response) => {
    if (!response.ok) throw new Error(`任务数据加载失败（${response.status}）`);
    const data = await response.json() as TaskCatalog;
    if (data.schemaVersion !== 1 || !Array.isArray(data.tasks) || data.categories?.length !== 5) throw new Error("任务数据不完整，请重试。");
    return data;
  }).catch((error: unknown) => { request = undefined; throw error; });
  return request;
}

const PAGE_SIZE = 30;
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
function Conditions({ rows }: { rows: TaskCondition[] }) {
  const render = (row: TaskCondition) => <li key={row.key} className={row.unresolved ? "task-condition-unknown" : ""}>
    {row.text}
  </li>;
  if (!rows.length) return <span className="task-muted">无额外前置要求</span>;
  return <><ul className="task-conditions">{rows.slice(0, 3).map(render)}</ul>{rows.length > 3 && <details className="task-more"><summary>展开其余 {rows.length - 3} 项要求</summary><ul className="task-conditions">{rows.slice(3).map(render)}</ul></details>}</>;
}

function TaskTable({ data }: { data: TaskCatalog }) {
  const [category, setCategory] = useState(0);
  const [query, setQuery] = useState("");
  const [reward, setReward] = useState("");
  const [status, setStatus] = useState("all");
  const [showHidden, setShowHidden] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const categories = useMemo(() => new Map(data.categories.map((c) => [c.id, c.name])), [data]);
  const availableTasks = useMemo(() => data.tasks.filter((task) => !taskHiddenReason(task, now)), [data, now]);
  const tasks = showHidden ? data.tasks : availableTasks;
  const categoryCounts = useMemo(() => data.categories.map((c) => ({ ...c, count: tasks.filter((t) => t.category === c.id).length })), [data, tasks]);
  const rewardNames = useMemo(() => [...new Set(tasks.flatMap((t) => t.rewards.map((r) => r.name)))].sort((a, b) => a.localeCompare(b, "zh-CN")), [tasks]);
  const indexed = useMemo(() => tasks.map((task) => ({ task, search: normalize([
    task.id, categories.get(task.category), task.name, task.description,
    ...task.requirements.map((c) => c.text), ...task.prerequisites.map((c) => c.text),
    ...task.rewards.map((r) => `${taskRewardLabel(r)} ${r.amount} ${r.kind}`),
  ].join(" ")) })), [tasks, categories]);
  const filtered = useMemo(() => {
    const terms = normalize(query).split(" ").filter(Boolean);
    return indexed.filter(({ task, search }) => (!category || task.category === category)
      && (!reward || task.rewards.some((r) => r.name === reward))
      && (status === "all"
        || (status === "timed" && task.timed) || (status === "prerequisite" && task.prerequisites.length > 0))
      && terms.every((term) => search.includes(term))).map(({ task }) => task);
  }, [indexed, category, query, reward, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  function reset() { setCategory(0); setQuery(""); setReward(""); setStatus("all"); setShowHidden(false); setPage(1); }
  function changePage(next: number) { setPage(next); tableRef.current?.scrollIntoView({ block: "start", behavior: "instant" }); }
  function taskRequirements(task: GameTask) {
    // The same visibility gate may also appear in the claim recipe. Show it once,
    // in the prerequisite column; no prerequisite is dropped from the catalog.
    const pre = new Set(task.prerequisites.flatMap((c) => c.key.split("|")));
    return task.requirements.filter((c) => !c.key.split("|").every((key) => pre.has(key)));
  }
  return <section className="task-archive" aria-label="任务手册">
    <header className="task-heading"><div><p className="eyebrow">MISSION MANUAL</p><h1>任务</h1><p>查要求、找奖励、追溯前置任务。收录客户端配置，实际开放以游戏内为准。</p></div><button type="button" className="task-reset" onClick={reset}>重置筛选</button></header>
    <div className="task-toolbar">
      <div className="task-category-tabs" role="group" aria-label="任务分类">
        {[{ id: 0, name: "全部", count: tasks.length }, ...categoryCounts].map((c) => <button type="button" key={c.id} aria-pressed={category === c.id} onClick={() => { setCategory(c.id); setPage(1); }}><span>{c.name}</span><small>{c.count}</small></button>)}
      </div>
      <div className="task-filter-row">
        <label className="task-search"><span aria-hidden="true">⌕</span><input ref={searchRef} type="search" aria-label="搜索任务" placeholder="搜索任务、要求、奖励或编号…（空格分隔多个关键词）" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />{query && <button type="button" aria-label="清除任务搜索" onClick={() => { setQuery(""); setPage(1); searchRef.current?.focus(); }}>×</button>}</label>
        <label>奖励<select aria-label="筛选任务奖励" value={reward} onChange={(e) => { setReward(e.target.value); setPage(1); }}><option value="">全部奖励</option>{rewardNames.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>条件<select aria-label="筛选任务条件" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="all">全部条件</option><option value="prerequisite">有前置要求</option><option value="timed">有时间 / 活动限制</option></select></label>
      </div>
      <label className="task-hidden-toggle"><input type="checkbox" checked={showHidden} onChange={(e) => { setShowHidden(e.target.checked); setReward(""); setPage(1); }} />显示已隐藏任务<small>保留 {data.tasks.length - availableTasks.length} 项历史、停用或尚未开放配置</small></label>
    </div>
    <div className="task-results-bar"><span role="status" aria-live="polite">找到 <b>{filtered.length}</b> 项任务</span><span>所有要求需同时满足 · 长条件可展开查看</span></div>
    <div className="task-table-scroll" ref={tableRef} tabIndex={0} role="region" aria-label="任务要求与奖励表格">
      <table className="task-table"><colgroup><col className="task-name-col" /><col className="task-requirement-col" /><col className="task-reward-col" /><col className="task-prerequisite-col" /></colgroup><thead><tr><th scope="col">任务</th><th scope="col">完成要求</th><th scope="col">奖励</th><th scope="col">解锁 / 前置要求</th></tr></thead>
        <tbody>{visible.map((task) => <tr key={task.id} data-task-id={task.id} data-disabled={task.disabled || undefined}>
          <th scope="row"><span className="task-category-label">{categories.get(task.category)}</span><strong>{task.name}</strong><small>#{task.id}</small>{taskHiddenReason(task, now) && <span className="task-warning">默认隐藏：{taskHiddenReason(task, now)}</span>}{task.timed && <span className="task-time-label">时间 / 活动限定</span>}</th>
          <td>{taskRequirements(task).length ? <Conditions rows={taskRequirements(task)} /> : <p className="task-description">{task.description}</p>}<details className="task-game-description"><summary>游戏原文说明</summary><p>{task.description}</p></details></td>
          <td><div className="task-rewards">{task.rewards.map((r, i) => <span className="task-reward" key={`${r.key}:${i}`} title={`${taskRewardLabel(r)} × ${r.amount.toLocaleString()}`}>{r.image && <img src={r.image} alt="" loading="lazy" />}<span>{r.name}{r.equipmentLevel && <> <em className="task-equipment-level">S{r.equipmentLevel}</em></>}<b>×{r.amount.toLocaleString()}</b></span></span>)}</div>{!task.rewards.length && <span className="task-muted">无物资奖励（仅记录任务进度）</span>}</td>
          <td><Conditions rows={task.prerequisites} /></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length && <div className="task-empty"><strong>没有找到符合条件的任务</strong><p>尝试缩短关键词，或重置筛选条件。</p><button type="button" onClick={reset}>重置筛选</button></div>}
    </div>
    <footer className="task-footer"><span>隐藏不删除，可勾选“显示已隐藏任务”查看全部配置。账号条件与实时活动以游戏内为准，时间均为北京时间。</span><nav aria-label="任务分页"><button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>上一页</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => changePage(currentPage + 1)}>下一页</button></nav></footer>
  </section>;
}

export default function TaskArchive() {
  const [data, setData] = useState<TaskCatalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadTasks().then((value) => { if (!cancelled) setData(value); }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "任务加载失败"); });
    return () => { cancelled = true; };
  }, [attempt]);
  if (error) return <section className="task-archive task-empty" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt((v) => v + 1); }}>重试加载任务</button></section>;
  if (!data) return <section className="task-archive task-empty" role="status">正在加载任务手册…</section>;
  return <TaskTable data={data} />;
}
