import nativeFraming from "../public/data/card-framing.json" with { type: "json" };
import skinFraming from "../public/data/skin-card-framing.json" with { type: "json" };

/** Native model coordinates mapped to one card-only viewport. Long guns can
 * leave the viewport without shrinking people; compact Q art can use containment.
 * This does not change original images, detail art or square portraits.
 */
export type CardArtFraming = { x: number; height: number; bottom: number };
export const defaultCardArtFraming: Readonly<CardArtFraming> = { x: 50, height: 98, bottom: -1 };
type NativeBounds = { left: number; top: number; width: number; height: number; source: string; modelId: number };
const boundsById: Readonly<Record<string, NativeBounds>> = nativeFraming.rows;
const skinBoundsByModel: Readonly<Record<string, Omit<NativeBounds, "modelId">>> = skinFraming.rows;
const reviewedSkinPlacements: Readonly<Record<string, CardArtFraming>> = skinFraming.reviewed;
const compactSkinModels: Readonly<Record<string, string>> = skinFraming.fitModels;
// Atlas art window: full card 2:3, inset 2.6%/3.65%/4.25%.
export const nativeCardViewport = { height: 560, width: 560 * .927 / (1.5 * .9315), originX: .47, originY: 200 };

// Epsilon's classic Q-version needs the same full-width, centered presentation
// as its compact "Alien Snack" skin, rather than the small native detail scale.
// The compact CSS also compensates for classic's extra transparent bottom margin.
export function cardArtUsesContain(id: number): boolean {
  return id === 7002;
}

export function cardArtFraming(id: number): CardArtFraming {
  const bounds = boundsById[id];
  if (!bounds) return { ...defaultCardArtFraming };
  return framingFromNativeBounds(bounds);
}

export function cardSkinFraming(modelId: number): CardArtFraming | null {
  if (compactSkinModels[modelId]) return null;
  if (reviewedSkinPlacements[modelId]) {
    const { x, height, bottom } = reviewedSkinPlacements[modelId];
    return { x, height, bottom };
  }
  const bounds = skinBoundsByModel[modelId];
  return bounds ? framingFromNativeBounds(bounds) : null;
}

export function framingFromNativeBounds(bounds: Pick<NativeBounds, "left" | "top" | "width" | "height">): CardArtFraming {
  const view = nativeCardViewport;
  return {
    x: view.originX * 100 + (bounds.left + bounds.width / 2) / view.width * 100,
    height: bounds.height / view.height * 100,
    bottom: (1 - (view.originY + bounds.top + bounds.height) / view.height) * 100,
  };
}
