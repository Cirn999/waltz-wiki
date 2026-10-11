"use client";

import { useEffect, useId, useRef, useState } from "react";
import { loadMaidenQuotes, quoteCategories, type MaidenQuotes, type QuoteCategory } from "./maidenQuotes";
import StoryChatLine from "./StoryChatLine";
import "./maiden-quotes.css";

export default function MaidenQuotesSection({ cardId }: { cardId: number }) {
  // Reset tabs, open story state and in-flight requests when switching characters.
  return <QuotesContent key={cardId} cardId={cardId} />;
}

function QuotesContent({ cardId }: { cardId: number }) {
  const uid = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState<QuoteCategory>("recruit");
  const [data, setData] = useState<MaidenQuotes | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadMaidenQuotes(cardId, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [cardId, attempt]);
  const groups = data?.groups[active] ?? [];
  const story = active === "recruit" ? data?.recruitmentStory : null;
  const heading = quoteCategories.find(category => category.id === active)!.label;

  return <section className="detail-section maiden-quotes" aria-labelledby={uid + "-heading"} data-card-id={cardId}>
    <header className="maiden-quotes-heading">
      <h3 id={uid + "-heading"}>台词</h3>
      <small>收录客户端文本 · 入队剧情可展开阅读</small>
    </header>
    <div className="maiden-quotes-tabs" role="tablist" aria-label="台词分类">
      {quoteCategories.map((category, index) => {
        const count = data?.groups[category.id].reduce((sum, group) => sum + group.lines.length, 0) ?? 0;
        return <button key={category.id} type="button" role="tab"
          id={uid + "-" + category.id} aria-controls={uid + "-panel"}
          aria-selected={active === category.id} tabIndex={active === category.id ? 0 : -1}
          ref={element => { tabs.current[index] = element; }}
          onClick={() => setActive(category.id)}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % 4
              : event.key === "ArrowLeft" ? (index + 3) % 4
              : event.key === "Home" ? 0 : event.key === "End" ? 3 : null;
            if (next === null) return;
            event.preventDefault();
            setActive(quoteCategories[next].id);
            tabs.current[next]?.focus();
          }}>
          {category.label}
          {data && <span>{count}{category.id === "recruit" && data.recruitmentStory ? " + 剧情" : ""}</span>}
        </button>;
      })}
    </div>
    <div className="maiden-quotes-panel" id={uid + "-panel"} role="tabpanel"
      aria-labelledby={uid + "-" + active} tabIndex={0} aria-busy={!data && !failed}>
      {!data && !failed && <p className="maiden-quotes-empty" role="status">正在读取台词…</p>}
      {failed && <div className="maiden-quotes-empty" role="alert">台词暂时加载失败。
        <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重新加载</button>
      </div>}
      {data && groups.length === 0 && !story && <p className="maiden-quotes-empty">客户端暂无收录{heading}。</p>}
      <div className={"maiden-quotes-groups" + (active === "battle" ? " is-battle" : "")}>
        {groups.map(group => <div className="maiden-quote-group" key={group.tag} data-quote-tag={group.tag}>
          {(active === "battle" || active === "touch") && <h4>{group.label}</h4>}
          <ol>{group.lines.map((line, index) => <li key={line.id}>
            <span className="maiden-quote-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <p>{line.text}</p>
          </li>)}</ol>
        </div>)}
      </div>
      {story && <details className="maiden-recruitment-story" key={story.scriptId}>
        <summary><strong>入队剧情</strong><span>{story.lines.length} 段对话与旁白 · 点击展开 / 收起</span></summary>
        <div className="story-chat" aria-label="入队剧情对话记录">
          <div className="story-chat-section">{story.lines.map((line, index) =>
            <StoryChatLine key={line.id} frame={line} index={index}
              character={line.head === null ? undefined : story.characters[line.head]} />
          )}</div>
          <p className="story-chat-end">— 入队剧情完 —</p>
        </div>
      </details>}
    </div>
  </section>;
}
