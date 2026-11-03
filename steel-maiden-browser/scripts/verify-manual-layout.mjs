import assert from "node:assert/strict";
import { layoutManualGraph, manualEdgeCurves, manualEdgePath } from "../app/manualResearchLayout.ts";

const makeGraph=(ids,pairs)=>({rootId:ids[0],ids,edges:pairs.map(([source,target])=>({source,target,recipeIds:[]}))});
const parents=[6515,6479,6444,6642],children=[7511,9641,6533,9895];
const pairs=[...parents.map((id)=>[6495,id]),[6515,7511],[6444,9641],[6444,6533],[6515,9895]];
const screenshot=makeGraph([6495,...parents,...children],pairs);
const sample=(curve,t)=>({x:(1-t)**3*curve.x1+3*(1-t)**2*t*curve.cx1+3*(1-t)*t*t*curve.cx2+t**3*curve.x2,y:(1-t)**3*curve.y1+3*(1-t)**2*t*curve.cy1+3*(1-t)*t*t*curve.cy2+t**3*curve.y2});
const assertGeometry=(graph)=>{
  const layout=layoutManualGraph(graph);
  assert.deepEqual(new Set(layout.nodes.map((n)=>n.id)),new Set(graph.ids));
  for(const a of layout.nodes){
    assert.ok(a.x>=0&&a.y>=0&&a.x+layout.cardWidth<=layout.width&&a.y+layout.cardHeight<=layout.height);
    for(const b of layout.nodes)if(a.id!==b.id)assert.ok(a.x+layout.cardWidth<=b.x||b.x+layout.cardWidth<=a.x||a.y+layout.cardHeight<=b.y||b.y+layout.cardHeight<=a.y,"cards must not overlap");
  }
  for(const edge of layout.edges){
    assert.ok(edge.y2>edge.y1);
    assert.ok(manualEdgePath(edge).startsWith(`M${edge.x1},${edge.y1}`));
    for(const curve of manualEdgeCurves(edge))for(let i=1;i<20;i++){
      const point=sample(curve,i/20);
      for(const node of layout.nodes)assert.ok(!(point.x>node.x+.1&&point.x<node.x+layout.cardWidth-.1&&point.y>node.y+.1&&point.y<node.y+layout.cardHeight-.1),"route must not pass through a card");
    }
  }
  return layout;
};
const layout=assertGeometry(screenshot);
assert.equal(layout.crossings,0,"the reported T-60 branches must have no crossings");
const row=layout.nodes.filter((n)=>children.includes(n.id)).sort((a,b)=>a.x-b.x).map((n)=>n.id);
assert.equal(Math.abs(row.indexOf(7511)-row.indexOf(9895)),1,"BM-24T and MOWAG belong together");
assert.equal(Math.abs(row.indexOf(9641)-row.indexOf(6533)),1,"T-50's two children belong together");
const permutations=(xs)=>xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>i!==j)).map((rest)=>[x,...rest])):[[]];
let orderings=0;
for(const ps of permutations(parents))for(const cs of permutations(children)){
  assert.equal(layoutManualGraph(makeGraph([6495,...ps,...cs],pairs)).crossings,0,"click order must not introduce branch crossings");orderings++;
}
const long=assertGeometry(makeGraph([1,2,3,4,5],[[1,2],[2,3],[3,4],[1,4],[4,5]]));
assert.equal(long.crossings,0);assert.ok(long.edges.find((e)=>e.source===1&&e.target===4).points.length>2,"long links use reserved intermediate slots");
assert.equal(assertGeometry(makeGraph([1,2,3,4],[[1,2],[1,3],[2,4],[3,4],[1,4]])).crossings,0,"shared merge target remains a single node");
assert.equal(layoutManualGraph(makeGraph([1],[])).nodes.length,1);
assert.equal(layoutManualGraph({rootId:null,ids:[],edges:[]}).nodes.length,0);
assert.deepEqual(layoutManualGraph(screenshot),layoutManualGraph(screenshot),"layout must be deterministic");
console.log(JSON.stringify({screenshotCrossings:layout.crossings,siblingOrder:row,clickOrderPermutations:orderings,longEdgesAvoidCards:true,sharedMerge:true,nodesDoNotOverlap:true}));
