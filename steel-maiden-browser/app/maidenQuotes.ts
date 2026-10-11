import type { StoryCharacter } from "./storyTypes";
import type { StoryChatFrame } from "./StoryChatLine";

export const quoteCategories = [
  { id: "recruit", label: "入队台词" },
  { id: "honor", label: "授勋台词" },
  { id: "touch", label: "主界面触摸台词" },
  { id: "battle", label: "战斗台词" },
] as const;

export type QuoteCategory = (typeof quoteCategories)[number]["id"];
export type QuoteLine = { id: string; text: string };
export type QuoteGroup = { tag: number; label: string; lines: QuoteLine[] };
export type RecruitmentLine = StoryChatFrame;
export type MaidenQuotes = {
  schemaVersion: 2;
  cardId: number;
  modelId: number;
  groups: Record<QuoteCategory, QuoteGroup[]>;
  recruitmentStory: { scriptId: number; lines: RecruitmentLine[]; characters: Record<string, StoryCharacter> } | null;
};

const cache = new Map<number, MaidenQuotes>();

export function isMaidenQuotes(value: unknown, cardId: number): value is MaidenQuotes {
  if (!value || typeof value !== "object") return false;
  const data = value as MaidenQuotes;
  const lineValid = (line: QuoteLine) => line && typeof line.id === "string" && typeof line.text === "string";
  return data.schemaVersion === 2 && data.cardId === cardId && Number.isInteger(data.modelId)
    && !!data.groups && quoteCategories.every(({ id }) =>
      Array.isArray(data.groups[id]) && data.groups[id].every(group =>
        !!group && typeof group.label === "string" && Number.isInteger(group.tag)
        && Array.isArray(group.lines) && group.lines.every(lineValid)))
    && (data.recruitmentStory === null || (!!data.recruitmentStory
      && Number.isInteger(data.recruitmentStory.scriptId)
      && !!data.recruitmentStory.characters
      && Array.isArray(data.recruitmentStory.lines)
      && data.recruitmentStory.lines.every(line => lineValid(line)
        && typeof line.speaker === "string" && ["dialogue", "narration", "notice"].includes(line.kind)
        && (line.kind !== "dialogue" || (line.head !== null && Number.isInteger(line.head)
          && ["left", "right"].includes(line.side ?? "")
          && !!data.recruitmentStory!.characters[line.head])))));
}

export async function loadMaidenQuotes(cardId: number, signal: AbortSignal): Promise<MaidenQuotes> {
  const existing = cache.get(cardId);
  if (existing) return existing;
  const response = await fetch("/data/maiden-quotes/" + cardId + ".json", { signal });
  if (!response.ok) throw new Error("台词数据加载失败");
  const data: unknown = await response.json();
  if (!isMaidenQuotes(data, cardId)) throw new Error("台词数据格式不正确");
  // Small per-character payloads; do not retain the entire archive in memory.
  if (cache.size >= 48) cache.delete(cache.keys().next().value!);
  cache.set(cardId, data);
  return data;
}
