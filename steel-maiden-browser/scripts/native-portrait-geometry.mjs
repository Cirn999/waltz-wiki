// Native static model placement shared by base portraits and skin portraits.
// Evidence: inspect_native_portrait_layout.py (RMC / CCArmature / CCBone).
const numbers = (value) => (value.match(/-?\d+(?:\.\d+)?/gu) ?? []).map(Number);
export const roundCoordinate = (value) => Math.round(value * 10000) / 10000;

export function nativeStaticGeometry(model) {
  if (model.modelType !== 0) return { reason: model.modelType === 1 ? "live2d" : "unsupported-model-type" };
  const bone = model.xml?.bones?.[0];
  const texture = model.xml?.textures?.find((item) => item.name === bone?.bi);
  const frames = Object.values(model.plist?.frames ?? {});
  if (!bone || !texture || frames.length !== 1 || model.xml.bones.length !== 1) return { reason: "missing-or-complex-static-metadata" };
  if (Number(bone.kX) || Number(bone.kY)) return { reason: "rotated-bone" };
  const frame = frames[0];
  const [fx, fy, fw, fh] = numbers(frame.frame);
  const [sx, sy] = numbers(frame.sourceColorRect);
  const [sw, sh] = numbers(frame.sourceSize);
  const [packedWidth, packedHeight] = numbers(model.plist.metadata.size);
  // Exporters rotate the whole atlas 270 degrees, including its padding.
  const bitmapWidth = frame.rotated ? packedHeight : packedWidth;
  const bitmapHeight = frame.rotated ? packedWidth : packedHeight;
  const contentX = frame.rotated ? fy : fx;
  const contentY = frame.rotated ? packedWidth - fx - fh : fy;
  const density = Number(model.pngName.match(/__(\d+)/u)?.[1] ?? 100) / 100;
  const scale = .35 * (model.scale / 100) / density;
  // Cocos is Y-up; XML bone Y and browser coordinates are Y-down.
  // Anchor=(pX/width,1-pY/height); bone positions use atlas density.
  const left = (Number(bone.x) * density + model.offsetx * density - Number(texture.pX) / Number(texture.width) * sw + sx - contentX) * scale;
  const top = (Number(bone.y) * density - model.offsety * density - Number(texture.pY) / Number(texture.height) * sh + sy - contentY) * scale;
  const width = bitmapWidth * scale;
  const height = bitmapHeight * scale;
  if (![left, top, width, height, scale].every(Number.isFinite) || width <= 0 || height <= 0 || fw <= 0 || fh <= 0) throw new Error(`Invalid native geometry: ${model.modelId}`);
  return { left, top, width, height, scale, bitmapWidth, bitmapHeight, rotated: frame.rotated };
}

export function trimNativeGeometry(bounds, trim) {
  // Sharp reports negative offsets for removed left/top pixels.
  return { left: bounds.left - (trim.trimOffsetLeft ?? 0) * bounds.scale,
    top: bounds.top - (trim.trimOffsetTop ?? 0) * bounds.scale,
    width: trim.width * bounds.scale, height: trim.height * bounds.scale };
}
