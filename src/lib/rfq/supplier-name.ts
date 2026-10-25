// Presentation only: preserve the extracted quote for all business calculations.
const markerPattern = /\b(?:fictitious|fictional|fict[ií]ci[oa]s?)\b/giu;
const suffixPattern = /^(INC|SA|LTDA|GMBH|LLC)(\.?)$/i;

export function normalizeSupplierName(name: string | null | undefined, sourceText = "") {
  const isFictitious = Boolean(`${name ?? ""}\n${sourceText}`.match(markerPattern));
  if (!name) return { name: null, isFictitious };

  const cleaned = name
    .replace(/\([^()]*\b(?:fictitious|fictional|fict[ií]ci[oa]s?)\b[^()]*\)|\[[^\[\]]*\b(?:fictitious|fictional|fict[ií]ci[oa]s?)\b[^\[\]]*\]/giu, "")
    .replace(markerPattern, "")
    .replace(/\s+/g, " ")
    .trim();
  const allCaps = cleaned === cleaned.toLocaleUpperCase() && cleaned !== cleaned.toLocaleLowerCase();
  const normalized = cleaned.split(" ").map((word) => {
    const suffix = word.match(suffixPattern);
    if (suffix) return word.toUpperCase();
    return allCaps
      ? word.toLocaleLowerCase().replace(/(^|[-’'])\p{L}/gu, (letter) => letter.toLocaleUpperCase())
      : word;
  }).join(" ");
  return { name: normalized || null, isFictitious };
}

const legalSuffix = /\b(inc|llc|sa|ltda|gmbh)\b\.?/gi;
/** Loose supplier identity: normalized, case-insensitive, ignoring legal suffixes and punctuation; containment counts as a match. */
export function sameSupplier(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const strip = (s: string) => (normalizeSupplierName(s).name ?? s)
    .toLowerCase()
    .replace(legalSuffix, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const x = strip(a), y = strip(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}