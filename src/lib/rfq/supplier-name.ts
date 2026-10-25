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