import { exportChartSize } from "./attributeChartMath";

export async function attributeChartPng(svg: SVGSVGElement): Promise<Blob> {
  await document.fonts.ready;
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const cache = new Map<string, Promise<string>>();
  const inlineImage = (url: string) => {
    if (!cache.has(url)) cache.set(url, (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("头像加载失败，请重试");
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("头像转换失败"));
        reader.readAsDataURL(blob);
      });
    })());
    return cache.get(url)!;
  };
  await Promise.all([...copy.querySelectorAll("image")].map(async (image) => {
    const url = image.getAttribute("href");
    if (url) image.setAttribute("href", await inlineImage(url));
  }));
  const width = Number(copy.getAttribute("width")), height = Number(copy.getAttribute("height"));
  const size = exportChartSize(width, height);
  copy.setAttribute("width", String(size.width)); copy.setAttribute("height", String(size.height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建截图画布");
    context.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图表转为图片失败")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}
