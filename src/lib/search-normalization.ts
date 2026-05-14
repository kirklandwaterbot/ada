const ROAD_SUFFIX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bavenue\b/g, "av"],
  [/\bave\b/g, "av"],
  [/\bstreet\b/g, "st"],
  [/\bstreets\b/g, "st"],
  [/\bsts\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bboulevard\b/g, "blvd"],
  [/\bparkway\b/g, "pkwy"],
  [/\bplace\b/g, "pl"],
  [/\bsquare\b/g, "sq"],
  [/\bplaza\b/g, "plz"],
  [/\bcourt\b/g, "ct"],
  [/\bdrive\b/g, "dr"],
  [/\bhighway\b/g, "hwy"],
  [/\blane\b/g, "ln"],
  [/\bterrace\b/g, "ter"],
  [/\bcircle\b/g, "cir"],
];

const NYC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bfirst\b/g, "1"],
  [/\bsecond\b/g, "2"],
  [/\bthird\b/g, "3"],
  [/\bfourth\b/g, "4"],
  [/\bfifth\b/g, "5"],
  [/\bsixth\b/g, "6"],
  [/\bseventh\b/g, "7"],
  [/\beighth\b/g, "8"],
  [/\bninth\b/g, "9"],
  [/\btenth\b/g, "10"],
  [/\beleventh\b/g, "11"],
  [/\btwelfth\b/g, "12"],
  [/\bthirteenth\b/g, "13"],
  [/\bfourteenth\b/g, "14"],
  [/\bfifteenth\b/g, "15"],
  [/\bsixteenth\b/g, "16"],
  [/\bseventeenth\b/g, "17"],
  [/\beighteenth\b/g, "18"],
  [/\bnineteenth\b/g, "19"],
  [/\btwentieth\b/g, "20"],
  [/\bheights\b/g, "hts"],
  [/\bfort\b/g, "ft"],
  [/\bmount\b/g, "mt"],
  [/\bsaint\b/g, "st"],
  [/\bcenter\b/g, "ctr"],
  [/\bcentre\b/g, "ctr"],
  [/\bpoint\b/g, "pt"],
  [/\broute\b/g, "rte"],
  [/\bport authority bus terminal\b/g, "pabt"],
  [/\bnew york university\b/g, "nyu"],
  [/\bnew york\b/g, "ny"],
  [/\bwashington\b/g, "wash"],
  [/\bbrooklyn\b/g, "bklyn"],
  [/\bbroadway\b/g, "bway"],
  [/\bb'?way\b/g, "bway"],
  [/\beast\b/g, "e"],
  [/\bwest\b/g, "w"],
  [/\bnorth\b/g, "n"],
  [/\bsouth\b/g, "s"],
  [/\band\b/g, " "],
];

export function normalizeSearchText(value?: string) {
  let normalized = (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()+]/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bbeach(?=\s+\d)/g, "b");

  for (const [pattern, replacement] of NYC_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of ROAD_SUFFIX_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/[^a-z0-9]+/g, "").trim();
}

export function matchesNormalizedSearch(
  values: Array<string | undefined>,
  query: string,
) {
  const rawQuery = query.trim().toLowerCase();

  if (!rawQuery) {
    return true;
  }

  const normalizedQuery = normalizeSearchText(rawQuery);
  const rawHaystack = values.filter(Boolean).join(" ").toLowerCase();
  const normalizedHaystack = normalizeSearchText(rawHaystack);

  return (
    rawHaystack.includes(rawQuery) ||
    (!!normalizedQuery && normalizedHaystack.includes(normalizedQuery))
  );
}
