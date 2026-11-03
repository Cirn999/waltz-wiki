"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { TablePortraitImage, type PortraitMaiden } from "./TablePortrait";
import "./research-portraits.css";

const PortraitContext = createContext<ReadonlyMap<number, PortraitMaiden>>(new Map());
export function ResearchPortraitProvider({ maidens, children }: { maidens: PortraitMaiden[]; children: ReactNode }) {
  const portraits = useMemo(() => new Map(maidens.map((maiden) => [maiden.id, maiden])), [maidens]);
  return <PortraitContext.Provider value={portraits}>{children}</PortraitContext.Provider>;
}
export function useResearchPortraits() { return useContext(PortraitContext); }
export default function ResearchPortrait({ node }: { node: { id: number; tank: string } }) {
  const maiden = useResearchPortraits().get(node.id);
  return <span className="research-head research-square-head">{maiden ? <TablePortraitImage maiden={maiden} /> : <b>{node.tank.slice(0, 2)}</b>}</span>;
}
