import { portraitSources, type PortraitMaiden } from "./TablePortrait";
const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
    if (!images.has(url))
        images.set(url, new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            const timer = window.setTimeout(() => { images.delete(url); reject(new Error("头像素材载入超时，请重试")); }, 12000);
            image.onload = () => { clearTimeout(timer); resolve(image); };
            image.onerror = () => { clearTimeout(timer); images.delete(url); reject(new Error("头像素材载入失败，请重试")); };
            image.src = url;
        }));
    return images.get(url)!;
}
export async function squarePortraitCanvases(maidens: PortraitMaiden[]): Promise<Map<number, HTMLCanvasElement>> {
    await document.fonts.ready;
    return new Map(await Promise.all(maidens.map(async (maiden): Promise<[
        number,
        HTMLCanvasElement
    ]> => {
        const urls = portraitSources(maiden);
        const parts = new Map(await Promise.all(Object.entries(urls).filter(([, url]) => url).map(async ([key, url]) => [key, await loadImage(url)] as const)));
        const canvas = document.createElement("canvas");
        canvas.width = 246;
        canvas.height = 246;
        const context = canvas.getContext("2d");
        if (!context)
            throw new Error("无法生成头像图片");
        context.scale(3, 3);
        const draw = (key: string, x: number, y: number, w: number, h: number) => { const image = parts.get(key); if (image)
            context.drawImage(image, x, y, w, h); };
        const size = 82;
        draw("frame", 0, 0, size, size);
        draw("head", size * .05, size * .05, size * .9, size * .9);
        const bx = size * .06422, bw = size * .87156, bh = size * .20588, by = size * (1 - .03922) - bh;
        draw("bottomMask", bx, by, bw, bh);
        const vehicleClass = parts.get("vehicleClass");
        if (vehicleClass) {
            const h = bh * .71429, w = h * vehicleClass.naturalWidth / vehicleClass.naturalHeight;
            context.drawImage(vehicleClass, bx + bw * .12632 - w / 2, by + (bh - h) / 2, w, h);
        }
        const rarity = parts.get("rarity");
        if (rarity) {
            const w = size * .175;
            context.drawImage(rarity, size * .058, size * .053, w, w * rarity.naturalHeight / rarity.naturalWidth);
        }
        context.font = "900 13px Arial, sans-serif";
        context.textAlign = "right";
        context.textBaseline = "middle";
        context.lineJoin = "round";
        context.lineWidth = 2;
        context.strokeStyle = "#111";
        context.fillStyle = "#fff";
        context.strokeText(maiden.magicCostGroup, bx + bw * .985, by + bh / 2 + .5);
        context.fillText(maiden.magicCostGroup, bx + bw * .985, by + bh / 2 + .5);
        return [maiden.id, canvas];
    })));
}
