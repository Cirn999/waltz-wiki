import type { StageCatalog } from "./stageTypes";

// The stage browser and terrain handbook share one validated data request.
let catalogRequest: Promise<StageCatalog> | undefined;
export function loadStageCatalog(): Promise<StageCatalog> {
  if (!catalogRequest) catalogRequest = fetch("/data/stage-catalog.json").then(async (response) => {
    if (!response.ok) throw new Error(`关卡数据加载失败（${response.status}）`);
    const data = await response.json() as StageCatalog;
    if (data.schemaVersion !== 2 || !Array.isArray(data.maps) || !data.nodes || !data.terrains || !data.income) throw new Error("关卡数据格式不完整，请重新加载。");
    return data;
  }).catch((error: unknown) => { catalogRequest = undefined; throw error; });
  return catalogRequest;
}
