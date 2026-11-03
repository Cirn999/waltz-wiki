import type { PortraitMaiden } from "./TablePortrait";
import { squarePortraitCanvases } from "./portraitCanvas";
import { layoutManualGraph, manualEdgeCurves, type ManualGraph, type ManualResearchNode } from "./researchManualGraph";
export async function manualResearchPng(graph: ManualGraph, nodes: ReadonlyMap<number, ManualResearchNode>, portraits: ReadonlyMap<number, PortraitMaiden>): Promise<Blob> {
    const layout = layoutManualGraph(graph), titleHeight = 76;
    const width = layout.width, height = layout.height + titleHeight;
    const scale = Math.min(2, 12000 / width, 12000 / height, Math.sqrt(36000000 / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx)
        throw new Error("无法创建分享图片");
    const artwork = await squarePortraitCanvases(graph.ids.map((id) => portraits.get(id)).filter((row): row is PortraitMaiden => !!row));
    ctx.scale(scale, scale);
    ctx.fillStyle = "#e3e8df";
    ctx.fillRect(0, 0, width, height);
    ctx.font = "800 22px 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = "#183429";
    ctx.fillText(`${nodes.get(graph.rootId!)?.tank ?? "钢舞姬"} · 手动研发路线`, 28, 33);
    ctx.font = "12px 'Microsoft YaHei', sans-serif";
    ctx.fillStyle = "#627463";
    ctx.fillText(`${graph.ids.length} 位钢舞姬 · ${graph.edges.length} 条已选关系 · 完整研发条件请查看研发配方`, 28, 58);
    ctx.translate(0, titleHeight);
    ctx.strokeStyle = "#799445";
    ctx.fillStyle = "#799445";
    ctx.lineWidth = 2.5;
    for (const edge of layout.edges) {
        ctx.beginPath();
        ctx.moveTo(edge.x1, edge.y1);
        for (const curve of manualEdgeCurves(edge)) ctx.bezierCurveTo(curve.cx1, curve.cy1, curve.cx2, curve.cy2, curve.x2, curve.y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(edge.x2, edge.y2);
        ctx.lineTo(edge.x2 - 5, edge.y2 - 9);
        ctx.lineTo(edge.x2 + 5, edge.y2 - 9);
        ctx.closePath();
        ctx.fill();
    }
    for (const item of layout.nodes) {
        const node = nodes.get(item.id)!;
        ctx.fillStyle = "#f8faf4";
        ctx.strokeStyle = item.id === graph.rootId ? "#86a82c" : "#b9c7b4";
        ctx.lineWidth = item.id === graph.rootId ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(item.x, item.y, layout.cardWidth, layout.cardHeight, 14);
        ctx.fill();
        ctx.stroke();
        const image = artwork.get(item.id);
        if (image)
            ctx.drawImage(image, item.x + (layout.cardWidth - 96) / 2, item.y + 32, 96, 96);
        ctx.fillStyle = "#203b2c";
        ctx.font = "800 13px 'Microsoft YaHei', sans-serif";
        ctx.textAlign = "center";
        let line = "", row = 0;
        for (const char of node.tank) {
            if (ctx.measureText(line + char).width > layout.cardWidth - 20 && row === 0) {
                ctx.fillText(line, item.x + layout.cardWidth / 2, item.y + 151);
                line = "";
                row++;
            }
            line += char;
        }
        while (ctx.measureText(line).width > layout.cardWidth - 20)
            line = line.slice(0, -2) + "…";
        ctx.fillText(line, item.x + layout.cardWidth / 2, item.y + 151 + row * 17);
        ctx.font = "11px 'Microsoft YaHei', sans-serif";
        ctx.fillStyle = "#6b7a6a";
        ctx.fillText(node.person, item.x + layout.cardWidth / 2, item.y + 191, layout.cardWidth - 16);
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("无法生成PNG")), "image/png"));
}
