"use client";

import { useEffect, useState } from "react";
import { loadMaidenSkins, type MaidenSkin } from "./maidenSkinData";
import PortraitPngPreview from "./PortraitPngPreview";

function GalleryImage({ image, alt, onOpen }: { image: string; alt: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return !image || failed ? <div className="portrait-gallery-placeholder">暂无可用立绘</div>
    // Client-extracted local art, kept as an img for the existing share capture.
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={image} alt={alt} draggable={false} onError={() => setFailed(true)} onDoubleClick={onOpen}
      role="button" tabIndex={0} aria-label={`查看${alt} PNG 大图`} title="双击查看 PNG 大图"
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onOpen(); } }} />;
}

export default function MaidenPortraitGallery({ maiden }: {
  maiden: { id: number; tank: string; image: string; modelId: number; artist?: string };
}) {
  const [skins, setSkins] = useState<MaidenSkin[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<{ image: string; title: string } | null>(null);
  useEffect(() => {
    let active = true;
    loadMaidenSkins().then((data) => {
      if (active) { setSkins(data.rows[String(maiden.id)] ?? []); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [maiden.id, retry]);
  const portraits = [{ id: 0, name: "默认立绘", image: maiden.image, painter: maiden.artist ?? "", modelId: maiden.modelId }, ...skins];
  const portrait = portraits[selected] ?? portraits[0];
  const multiple = portraits.length > 1;
  const move = (step: number) => setSelected((index) => (index + step + portraits.length) % portraits.length);

  return <><section className="detail-section portrait-gallery" aria-label="立绘展示" aria-roledescription={multiple ? "轮播" : undefined}>
    <header className="portrait-gallery-heading"><h3>立绘展示</h3><span>{multiple && `${portraits.length} 套立绘 · `}双击查看 PNG 大图</span></header>
    <div className="portrait-gallery-stage" tabIndex={multiple ? 0 : undefined} aria-label={multiple ? "使用左右方向键切换立绘" : undefined} onKeyDown={(event) => {
      if (!multiple) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
    }}>
      <GalleryImage key={portrait.image} image={portrait.image} alt={`${maiden.tank} · ${portrait.name}`} onOpen={() => setPreview({ image: portrait.image, title: `${maiden.tank} · ${portrait.name}` })} />
      {multiple && <>
        <button type="button" className="portrait-gallery-arrow portrait-gallery-prev share-export-hide" aria-label="上一套立绘" onClick={() => move(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></button>
        <button type="button" className="portrait-gallery-arrow portrait-gallery-next share-export-hide" aria-label="下一套立绘" onClick={() => move(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 5 7 7-7 7" /></svg></button>
      </>}
    </div>
    <div className="portrait-gallery-caption" aria-live="polite">
      <div><strong>{portrait.name}</strong>{portrait.painter && <small>画师 · {portrait.painter}</small>}</div>
      {multiple && <span>{selected + 1} / {portraits.length}</span>}
    </div>
    {error && <div className="portrait-gallery-error share-export-hide" role="status">皮肤资料加载失败，暂时显示默认立绘。<button type="button" onClick={() => setRetry((n) => n + 1)}>重试</button></div>}
  </section>{preview && <PortraitPngPreview key={preview.image} source={preview.image} title={preview.title} onClose={() => setPreview(null)} />}</>;
}
