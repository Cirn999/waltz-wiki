"use client";
/* eslint-disable @next/next/no-img-element -- native story backgrounds, UI atlas and character art */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { StoryCatalog, StoryContent, StoryFrame, StoryMap } from "./storyTypes";
import StoryChatLine from "./StoryChatLine";
import { clampStoryIndex, storyMapTitle } from "./storyTypes";
import "./stages.css";
import "./stories.css";

let catalogRequest:Promise<StoryCatalog>|undefined;
const contentRequests=new Map<number,Promise<StoryContent>>();
function loadCatalog() {
  return catalogRequest ??= fetch("/data/story-catalog.json").then(async r=>{
    if(!r.ok) throw new Error(`剧情目录加载失败（${r.status}）`);
    const data=await r.json() as StoryCatalog;
    if(data.schemaVersion!==1 || !Array.isArray(data.maps) || !data.characters) throw new Error("剧情目录格式不正确");
    return data;
  }).catch((e:unknown)=>{catalogRequest=undefined;throw e;});
}
function loadStory(id:number) {
  let request=contentRequests.get(id);
  if(!request) {
    request=fetch(`/data/stories/${id}.json`).then(async r=>{
      if(!r.ok) throw new Error(`剧情内容加载失败（${r.status}）`);
      const data=await r.json() as StoryContent;
      if(data.schemaVersion!==1 || data.id!==id || !Array.isArray(data.frames) || !Array.isArray(data.sections)) throw new Error("剧情内容格式不正确");
      return data;
    }).catch((e:unknown)=>{contentRequests.delete(id);throw e;});
    contentRequests.set(id,request);
  }
  return request;
}

function StoryReader({map,catalog,onClose}:{map:StoryMap;catalog:StoryCatalog;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const scene=useRef<HTMLDivElement>(null);
  const chat=useRef<HTMLDivElement>(null);
  const wheelAt=useRef(0);
  const [content,setContent]=useState<StoryContent|null>(null);
  const [error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  const [mode,setMode]=useState<"game"|"chat">(()=>{
    try {return localStorage.getItem("mw.story.mode")==="chat" ? "chat" : "game";} catch {return "game";}
  });
  const [index,setIndex]=useState(0);
  const [hidden,setHidden]=useState(false);
  const [end,setEnd]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const frame=content?.frames[index];
  const count=content?.frames.length ?? 0;
  const section=frame ? content?.sections[frame.section] : undefined;
  const move=useCallback((delta:number)=>{
    setHidden(false);
    setEnd(delta>0 && index>=count-1);
    setIndex(clampStoryIndex(index+delta,count));
  },[count,index]);
  useEffect(()=>{
    const element=dialog.current;
    const previousFocus=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;
    element?.showModal(); document.body.style.overflow="hidden";
    const onFullscreen=()=>setFullscreen(document.fullscreenElement===element);
    document.addEventListener("fullscreenchange",onFullscreen);
    return ()=>{document.removeEventListener("fullscreenchange",onFullscreen);element?.close();document.body.style.overflow=previousOverflow;previousFocus?.focus();};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    loadStory(map.id).then(data=>{if(!cancelled)setContent(data);}).catch((e:unknown)=>{if(!cancelled)setError(e instanceof Error?e.message:"剧情加载失败");});
    return ()=>{cancelled=true;};
  },[map.id,attempt]);
  useEffect(()=>{
    if(mode==="game") scene.current?.focus({preventScroll:true});
    else if(content) chat.current?.querySelector(`[data-frame-index="${index}"]`)?.scrollIntoView({block:"center"});
    // Restore the corresponding reading position only on mode switch/loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode,content]);
  useEffect(()=>{
    const target=scene.current;
    if(!target || mode!=="game") return;
    const wheel=(e:WheelEvent)=>{
      if(e.ctrlKey || Math.abs(e.deltaY)<Math.abs(e.deltaX)) return;
      e.preventDefault();
      if(!e.deltaY || performance.now()-wheelAt.current<200) return;
      wheelAt.current=performance.now();move(e.deltaY>0?1:-1);
    };
    target.addEventListener("wheel",wheel,{passive:false});
    return ()=>target.removeEventListener("wheel",wheel);
  },[mode,move,content]);
  useEffect(()=>{
    // Preload only neighboring frames, not the entire story archive.
    if(!content) return;
    const urls=new Set<string>();
    for(const f of content.frames.slice(Math.max(0,index-1),index+3)) {
      urls.add(f.background);
      for(const id of [f.left,f.right]) if(id!==null && catalog.characters[id]?.image) urls.add(catalog.characters[id].image);
    }
    for(const src of urls) if(src) {const image=new Image();image.src=src;}
  },[index,content,catalog]);
  function changeMode(next:"game"|"chat") {setMode(next);try{localStorage.setItem("mw.story.mode",next);}catch{/* Optional. */}}
  function chooseLine(next:number) {setIndex(clampStoryIndex(next,count));setHidden(false);setEnd(false);scene.current?.focus({preventScroll:true});}
  async function toggleFullscreen() {
    try {if(document.fullscreenElement)await document.exitFullscreen();else await dialog.current?.requestFullscreen();}
    catch {/* The dialog is already sized to the available viewport on unsupported browsers. */}
  }
  function figure(side:"left"|"right",f:StoryFrame) {
    const id=f[side];const c=id===null?undefined:catalog.characters[id];
    if(!c?.image) return null;
    return <div key={`${side}-${c.modelId}`} className={`story-figure ${side}${f.side===side ? " is-speaking" : ""}`} data-head={id}>
      <img src={c.image} alt={c.name} draggable={false}/>
    </div>;
  }
  return <dialog ref={dialog} className="story-reader" aria-labelledby="story-reader-title" onCancel={e=>{e.preventDefault();onClose();}}
    onKeyDown={e=>{
      if(mode!=="game" || !count || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      const target=e.target as HTMLElement;
      if(target.closest("input,select,textarea,[contenteditable=true]")) return;
      if(e.key.toLowerCase()==="h") {e.preventDefault();setHidden(v=>!v);}
      else if((e.key==="Enter" || e.key===" ") && !target.closest("button")) {e.preventDefault();move(1);}
      else if(e.key==="ArrowRight") {e.preventDefault();move(1);}
      else if(e.key==="ArrowLeft") {e.preventDefault();move(-1);}
    }}>
    <header className="story-reader-header"><div><small>STORY ARCHIVE / {map.group}</small><h2 id="story-reader-title">{storyMapTitle(map)}</h2></div>
      <div className="story-mode" aria-label="剧情阅读模式"><button type="button" aria-pressed={mode==="game"} onClick={()=>changeMode("game")}>游戏演出</button><button type="button" aria-pressed={mode==="chat"} onClick={()=>changeMode("chat")}>对话记录</button></div>
      <button type="button" className="story-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen?"退出全屏":"全屏阅读"}>{fullscreen?"还原":"全屏"}</button>
      <button type="button" className="story-reader-close" aria-label="关闭剧情" onClick={onClose}>×</button>
    </header>
    {error ? <div className="story-loading" role="alert"><p>{error}</p><button onClick={()=>{setError("");setAttempt(v=>v+1);}}>重新加载</button></div> : !content ? <div className="story-loading" role="status">正在展开剧情…</div> : !count ? <div className="story-summary"><span>剧情梗概</span><h3>此关卡仅配置了剧情摘要</h3>{content.summaries.map((text,i)=><p key={i}>{text}</p>)}<small>客户端未配置可播放的逐句对话。</small></div> : <>
      {mode==="game" ? <div className="story-game-area"><div className="story-scene" ref={scene} tabIndex={0} role="group" aria-label="剧情画面：点击或回车下一句，滚轮向上回退，H 隐藏对话框" data-index={index} data-hidden={hidden}
        onClick={e=>{if(e.button===0){scene.current?.focus({preventScroll:true});if(hidden)setHidden(false);else move(1);}}}>
        <img className="story-background" key={frame!.background} src={frame!.background} alt="剧情背景" draggable={false}/>
        <div className={`story-cast${frame!.shake ? " is-shaking" : ""}`} key={frame!.shake ? frame!.id : "cast"}>{figure("left",frame!)}{figure("right",frame!)}</div>
        {frame!.item && <img className="story-gain-item" src={frame!.item} alt="剧情道具" />}
        <div className={`story-dialogue ${frame!.side ?? "narration"}${frame!.text.length>100?" is-long":""}${frame!.dialogue.includes("dhjm-009")?" is-red":""}`} aria-hidden={hidden} style={{"--dialogue-image":`url("${frame!.dialogue}")`} as CSSProperties}>
          {frame!.speaker && <strong className="story-speaker">{frame!.player ? "指挥官" : frame!.speaker.split("·")[0]}</strong>}
          <p key={frame!.id} className={frame!.text.length>150?"is-long":""}>{frame!.text}</p><span className="story-next-mark" aria-hidden="true">▾</span>
        </div>
        {end && !hidden && <span className="story-end" role="status">本关剧情已读完 · 可回退重读或切换关卡</span>}
      </div></div> : <div className="story-chat" ref={chat} aria-label="完整剧情对话记录">
        {content.sections.map((part,si)=><section className="story-chat-section" key={part.id}><h3><span>{String(si+1).padStart(2,"0")}</span>{part.name}</h3>
          {content.frames.slice(part.start,part.start+part.count).map((f,fi)=>{
            const c=f.head===null?undefined:catalog.characters[f.head];const at=part.start+fi;
            return <StoryChatLine key={f.id} frame={f} character={c} index={at} current={at===index} />;
          })}</section>)}<p className="story-chat-end">— 本关剧情完 —</p>
      </div>}
      <footer className="story-reader-footer">{mode==="game" ? <>
        <label>剧情段落<select aria-label="选择剧情段落" value={frame!.section} onChange={e=>chooseLine(content.sections[Number(e.target.value)].start)}>{content.sections.map((s,i)=><option value={i} key={s.id}>{s.name}</option>)}</select></label>
        <span className="story-key-hints">点击 / Enter 下一句 · 滚轮上回退、下前进 · H 隐藏</span>
        <div className="story-pager"><button type="button" disabled={index===0} onClick={()=>move(-1)} aria-label="上一句">←</button><span aria-live="polite">{index+1} / {count}</span><button type="button" disabled={index===count-1} onClick={()=>move(1)} aria-label="下一句">→</button><button type="button" aria-pressed={hidden} onClick={()=>setHidden(v=>!v)}>{hidden?"显示":"隐藏"}台词</button></div>
      </> : <><span>{content.sections.length} 段剧情 · {count} 条对话与旁白</span><span>全部文本已展开 · 可直接滚动阅读</span></>}</footer>
      {mode==="game" && section && <span className="story-reader-sr" aria-live="off">{section.name}</span>}
    </>}
  </dialog>;
}

export default function StoryArchive() {
  const [catalog,setCatalog]=useState<StoryCatalog|null>(null);
  const [error,setError]=useState("");const [attempt,setAttempt]=useState(0);
  const [categoryId,setCategoryId]=useState("");const [group,setGroup]=useState("");
  const [volume,setVolume]=useState(0);const [query,setQuery]=useState("");const [limit,setLimit]=useState(48);
  const [selected,setSelected]=useState<StoryMap|null>(null);
  useEffect(()=>{let cancelled=false;loadCatalog().then(d=>{if(!cancelled)setCatalog(d);}).catch((e:unknown)=>{if(!cancelled)setError(e instanceof Error?e.message:"剧情加载失败");});return()=>{cancelled=true;};},[attempt]);
  const maps=useMemo(()=>catalog?.maps.filter(m=>m.category===categoryId) ?? [],[catalog,categoryId]);
  const groups=useMemo(()=>[...new Set(maps.map(m=>m.group))],[maps]);
  const volumes=useMemo(()=>[...new Set(maps.filter(m=>!group || m.group===group).map(m=>m.volume).filter((v):v is number=>!!v))].sort((a,b)=>a-b),[maps,group]);
  const filtered=useMemo(()=>maps.filter(m=>(!group || m.group===group)&&(!volume || m.volume===volume)&&(!query.trim() || `${m.name} ${m.code} ${m.preview}`.toLowerCase().includes(query.trim().toLowerCase()))),[maps,group,volume,query]);
  function chooseCategory(id:string) {setCategoryId(id);setGroup("");setVolume(0);setQuery("");setLimit(48);}
  if(error) return <section className="stage-archive stage-empty" role="alert"><h2>剧情加载失败</h2><p>{error}</p><button onClick={()=>{setError("");setAttempt(v=>v+1);}}>重新加载</button></section>;
  if(!catalog) return <section className="stage-archive stage-empty" role="status">正在整理剧情目录…</section>;
  const category=catalog.categories.find(c=>c.id===categoryId);
  return <section className="stage-archive story-archive" aria-label="剧情档案">
    <div className="stage-archive-heading"><div><p className="stage-kicker">STORY ARCHIVE</p><h1>剧情一览{category && <span> / {category.name}</span>}</h1><p>{category ? "选择关卡，重温每一场相逢。支持游戏演出与完整对话记录。" : "翻开战场背后的故事。原版背景与人物，随时重温。"}</p></div>{categoryId ? <button className="stage-back" onClick={()=>chooseCategory("")}>← 返回剧情分类</button> : <span className="stage-total">{catalog.maps.filter(m=>!m.summaryOnly).length} 个剧情入口 · 无声阅读</span>}</div>
    {!categoryId ? <div className="story-category-grid">{catalog.categories.map((c,i)=><button type="button" key={c.id} className="story-category-card" onClick={()=>chooseCategory(c.id)} aria-label={`浏览${c.name}剧情`}><img src={c.image} alt=""/><span className="story-category-caption"><small>STORY {String(i+1).padStart(2,"0")}</small><strong>{c.name}</strong><em>{c.description}</em><span>{c.mapCount} 个入口 <b>→</b></span></span></button>)}</div> : <>
      <div className="stage-filters">{groups.length>1 && <label>剧情分类<select aria-label="剧情分类" value={group} onChange={e=>{setGroup(e.target.value);setVolume(0);setLimit(48);}}><option value="">全部</option>{groups.map(g=><option key={g}>{g}</option>)}</select></label>}<input aria-label="搜索剧情关卡" type="search" value={query} onChange={e=>{setQuery(e.target.value);setLimit(48);}} placeholder="搜索关卡名称、编号或剧情摘要…"/></div>
      {volumes.length>0 && <nav className="stage-volumes" aria-label="剧情卷数"><button aria-pressed={!volume} onClick={()=>{setVolume(0);setLimit(48);}}>全部</button>{volumes.map(v=><button key={v} aria-pressed={volume===v} onClick={()=>{setVolume(v);setLimit(48);}}>第 {v} 卷</button>)}</nav>}
      <div className="stage-list-summary"><span>{filtered.length} 个关卡 / 片段</span><small>仅收录客户端有剧情文本的关卡；摘要与演出分别标注。</small></div>
      {categoryId==="appendix" && <p className="story-appendix-note">独立片段没有明确的关卡关联，保留原始脚本编号，不推测其发生顺序。</p>}
      <div className="stage-map-grid">{filtered.slice(0,limit).map(m=><button type="button" key={m.id} className="stage-map-card story-map-card" onClick={()=>setSelected(m)} aria-label={`阅读剧情 ${storyMapTitle(m)}`}><span className="stage-map-art" data-kind={m.imageKind}>{m.image && <img loading="lazy" src={m.image} alt=""/>}<span className="stage-map-code">{m.volume?`第 ${m.volume} 卷 · ${m.code}`:m.group}</span><span className="stage-map-node-count">{m.summaryOnly?"剧情摘要":`${m.sectionCount} 段剧情`}</span></span><span className="stage-map-caption"><strong>{storyMapTitle(m)}</strong><span>{m.summaryOnly?"无逐句对话":`${m.frameCount} 条对话与旁白`}<b>阅读 →</b></span></span><span className="story-map-preview">{m.preview}</span></button>)}</div>
      {!filtered.length && <div className="stage-empty"><p>没有找到匹配的剧情。</p><button onClick={()=>{setQuery("");setVolume(0);setGroup("");}}>清除筛选</button></div>}
      {limit<filtered.length && <button className="stage-more" onClick={()=>setLimit(v=>v+48)}>继续显示 ↓</button>}
    </>}
    {selected && <StoryReader key={selected.id} map={selected} catalog={catalog} onClose={()=>setSelected(null)}/>}
  </section>;
}
