// The offline archive deliberately stores root-relative art/data URLs in both
// code and JSON. Adapt only exported files, never the source data or game text.
export function normalizeBasePath(value) {
  if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value)) {
    throw new Error("Pages base path must be a non-empty URL path, e.g. /waltz-wiki");
  }
  return value.replace(/\/$/, "");
}

// Match a local URL at a string / CSS url() boundary. In particular, do not
// rewrite https://.../art/, ../art/, existing prefixes, or arbitrary slashes.
const localAsset = /(["'`(])\/(art\/|data\/|_next\/|favicon\.svg(?=["'`)\s?#]))/g;

export function rebaseAssets(text, basePath) {
  return text.replace(localAsset, (_, boundary, resource) => `${boundary}${basePath}/${resource}`);
}

export const exportTextFile = /\.(?:html|rsc|js|css|json|svg)$/i;
