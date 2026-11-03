"use client";
/* eslint-disable @next/next/no-img-element -- existing client tactic sprites */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SimMagicData } from "./loadoutMath";
import "./commander-simulation.css";

export default function CommanderSimulationControls({ input,onInput,tacticTrend,tactics,onTactic }: {
  input:string; onInput:(input:string)=>void; tacticTrend:number; tactics:SimMagicData["tactics"]; onTactic:(trend:number)=>void;
}) {
  const [open,setOpen]=useState(false);
  const dialog=useRef<HTMLElement>(null);
  const selected=tactics.find((tactic)=>tactic.trendId===tacticTrend);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    dialog.current?.focus();
    const close=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setOpen(false);}
      if(event.key==="Tab"){
        const buttons=[...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])];
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener("keydown",close);
    return()=>{window.removeEventListener("keydown",close);document.body.style.overflow=overflow;previous?.focus({preventScroll:true});};
  },[open]);
  return <div className="commander-controls">
    <label className={`commander-level-input${input.trim()?" active":""}`}><span>指挥官等级</span><input type="number" inputMode="numeric" min={1} max={32767} step={1} value={input} placeholder="未启用" aria-label="指挥官等级" onChange={(event)=>onInput(event.target.value)}/>{input&&<button type="button" aria-label="清空指挥官等级，恢复基础属性" onClick={()=>onInput("")}>×</button>}</label>
    <button type="button" className="commander-tactic-trigger" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-label={`切换模拟战术，当前${selected?.name??"泛用战法定制"}`}>
      {selected?.image&&<img src={selected.image} alt=""/>}<span>{selected?.name??"泛用战法定制"}</span><i aria-hidden="true">▾</i>
    </button>
    {open&&createPortal(<div className="commander-tactic-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}><section className="commander-tactic-dialog" role="dialog" aria-modal="true" aria-label="选择上限模拟战术" ref={dialog} tabIndex={-1}>
      <header><div><h2>选择战术</h2><p>对属性表中的所有钢舞姬生效，魔改等级按各车允许的最高等级计算。</p></div><button type="button" aria-label="关闭战术选择" onClick={()=>setOpen(false)}>×</button></header>
      <div className="commander-tactic-options">{tactics.map((tactic)=><button type="button" key={tactic.trendId} aria-pressed={tacticTrend===tactic.trendId} onClick={()=>{onTactic(tactic.trendId);setOpen(false);}}>{tactic.image&&<img src={tactic.image} alt=""/>}<span>{tactic.name}</span>{tacticTrend===tactic.trendId&&<b>已选</b>}</button>)}</div>
    </section></div>,document.body)}
  </div>;
}
