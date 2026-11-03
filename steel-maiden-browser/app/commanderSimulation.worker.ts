/// <reference lib="webworker" />
import { calculateCommanderSimulation, type CommanderRequest } from "./commanderSimulation.ts";

self.onmessage = (event: MessageEvent<CommanderRequest>) => {
  try { self.postMessage({ result:calculateCommanderSimulation(event.data) }); }
  catch (error) { self.postMessage({ error:error instanceof Error ? error.message : "培养上限计算失败" }); }
};
