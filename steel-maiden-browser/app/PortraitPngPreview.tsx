"use client";
/* eslint-disable @next/next/no-img-element -- native img enables right-click PNG saving */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./portrait-png-preview.css";

/** Convert the current exported portrait at its natural size, preserving alpha. */
async function portraitPng(source: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context || !canvas.width || !canvas.height) throw new Error("立绘无法读取");
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => {
    if (result?.type === "image/png") resolve(result);
    else reject(new Error("PNG 生成失败"));
  }, "image/png"));
  return { blob, width: canvas.width, height: canvas.height };
}

export default function PortraitPngPreview({ source, title, onClose }: {
  source: string; title: string; onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [png, setPng] = useState<{ url: string; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  useEffect(() => {
    let active = true;
    let url: string | undefined;
    portraitPng(source).then(({ blob, width, height }) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPng({ url, width, height });
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source, retry]);

  if (typeof document === "undefined") return null;
  return createPortal(<dialog ref={dialogRef} className="portrait-png-dialog" aria-label={`${title} PNG 大图`}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      // Escape must close this viewer only, not the underlying maiden detail.
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    }}
    onClick={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="portrait-png-panel">
      <header><div><strong>{title}</strong><small>右键图片可保存 PNG{png && ` · ${png.width} × ${png.height}`}</small></div><button type="button" onClick={onClose} aria-label="关闭立绘大图">×</button></header>
      <div className="portrait-png-canvas">
        {png ? <img src={png.url} alt={title} /> : failed ? <div className="portrait-png-status" role="alert">大图加载失败<button type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>重试</button></div> : <p className="portrait-png-status" role="status">正在生成 PNG 大图…</p>}
      </div>
    </section>
  </dialog>, document.body);
}
