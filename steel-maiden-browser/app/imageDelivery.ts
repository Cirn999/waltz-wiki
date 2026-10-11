"use client";

import { useSyncExternalStore } from "react";

declare global {
  interface Window {
    SteelMaidenAndroid?: {
      saveImage(dataUrl: string, fileName: string): boolean;
    };
  }
}

export type ImageDeliveryTarget = "gallery" | "clipboard";

export function hasAndroidGalleryBridge(): boolean {
  return typeof window !== "undefined"
    && typeof window.SteelMaidenAndroid?.saveImage === "function";
}

export function useAndroidGalleryBridge(): boolean {
  return useSyncExternalStore(
    () => () => {},
    hasAndroidGalleryBridge,
    () => false,
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("无法读取生成的图片"));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取生成的图片"));
    reader.readAsDataURL(blob);
  });
}

function imageFileName(fileStem: string): string {
  const safeStem = fileStem.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "steel-maiden";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `${safeStem}-${stamp}.png`;
}

export async function deliverPng(blobOrPromise: Blob | Promise<Blob>, fileStem: string): Promise<ImageDeliveryTarget> {
  if (hasAndroidGalleryBridge()) {
    const blob = await blobOrPromise;
    const accepted = window.SteelMaidenAndroid!.saveImage(await blobToDataUrl(blob), imageFileName(fileStem));
    if (!accepted) throw new Error("系统相册未接受图片");
    return "gallery";
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前浏览器不支持图片剪贴板，请使用 HTTPS 或本地服务");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blobOrPromise })]);
  return "clipboard";
}
