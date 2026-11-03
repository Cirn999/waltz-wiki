"use client";
import { useEffect, useMemo, useState } from "react";
import { loadNativeLoadoutRules } from "./nativeLoadout";
import { starPromotions } from "./starPromotions";
import { commanderMagicPaths, parseCommanderLevel, type CommanderCard, type CommanderResult } from "./commanderSimulation";
import type { SimMagicData, SimTechData } from "./loadoutMath";
import commanderWorkerUrl from "./commanderSimulation.worker.ts?worker&url";

export function useCommanderSimulation({ input, tacticTrend, enabled, maidens, levels, technology, magic }: {
  input: string; tacticTrend: number; enabled: boolean;
  maidens: { id: number; magicSelectors: { ordnance: number; tactics: number } }[] | undefined;
  levels: number[] | undefined; technology: SimTechData | null; magic: SimMagicData | undefined;
}) {
  const [attempt, setAttempt] = useState(0);
  const parsed = useMemo(() => {
    try { return { level:parseCommanderLevel(input),error:"" }; }
    catch (error) { return { level:null,error:error instanceof Error ? error.message : "指挥官等级无效" }; }
  },[input]);
  const cards = useMemo<CommanderCard[]>(() => (maidens??[]).map((maiden) => ({ id:maiden.id, magicSelectors:maiden.magicSelectors,
    promotions:starPromotions(maiden.id).map(({stars,level,commanderLevel}) => ({stars,level,commanderLevel})) })),[maidens]);
  const request = useMemo(() => enabled && parsed.level !== null && technology && magic && levels
    ? { commanderLevel:parsed.level,tacticTrend,cards,levels,technology,magic,attempt } : null,
    [enabled,parsed.level,tacticTrend,cards,levels,technology,magic,attempt]);
  const [outcome, setOutcome] = useState<{ request:typeof request; result:CommanderResult | null; error:string } | null>(null);
  useEffect(() => {
    if (!request) return;
    let active = true, worker:Worker | null = null;
    const fail = (message:string) => { if (active) setOutcome({request,result:null,error:message}); };
    const timer = window.setTimeout(() => {
      loadNativeLoadoutRules().then((rules) => {
        if (!active) return;
        try {
          worker = new Worker(commanderWorkerUrl,{type:"module"});
          worker.onmessage = (event:MessageEvent<{result?:CommanderResult;error?:string}>) => {
            if (!active) return;
            if (event.data.result) setOutcome({request,result:event.data.result,error:""});
            else fail(event.data.error??"培养上限计算失败");
          };
          worker.onerror = (event) => { event.preventDefault(); fail("培养上限计算失败，请重试"); };
          worker.postMessage({commanderLevel:request.commanderLevel,tacticTrend:request.tacticTrend,cards:request.cards,
            levels:request.levels,technology:request.technology,magicPaths:commanderMagicPaths(request.magic),rules});
        } catch (error) { fail(error instanceof Error ? error.message : "无法启动培养上限计算"); }
      }).catch((error:unknown) => fail(error instanceof Error ? error.message : "计算数据加载失败"));
    },200);
    return () => { active=false; window.clearTimeout(timer); worker?.terminate(); };
  },[request]);
  const current = outcome?.request === request ? outcome : null;
  const active = input.trim() !== "";
  const dataError = enabled && active && parsed.level !== null && (!technology || !magic || !levels?.length || !cards.length)
    ? "缺少培养上限计算数据，请刷新页面后重试" : "";
  return { active,commanderLevel:parsed.level,result:active ? current?.result??null : null,
    pending:enabled && active && !parsed.error && !dataError && !current,
    error:active ? parsed.error || dataError || current?.error || "" : "", retry:() => setAttempt((value) => value+1) };
}
