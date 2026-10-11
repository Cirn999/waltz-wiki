// Keep the URL root as a string literal: the Pages export rebases it together
// with JSON and fetch URLs. A hard-coded /^\/art\// regex would not be rebased.
const artRoot = "/art/";

export function isArchiveArtPath(value: unknown, folder: string, filenamePattern: RegExp): value is string {
  if (typeof value !== "string") return false;
  const prefix = `${artRoot}${folder}/`;
  if (!value.startsWith(prefix)) return false;
  const filename = value.slice(prefix.length);
  return !/[\\/?#%]/.test(filename) && filenamePattern.test(filename);
}
