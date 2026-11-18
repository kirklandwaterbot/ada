// Pure helpers that decide whether a headline/article describes a station
// becoming accessible, which source tier it comes from, and which subway
// station row(s) it refers to. Kept free of I/O so it can be unit tested.

export const OFFICIAL_DOMAINS = [
  "mta.info",
  "new.mta.info",
  "governor.ny.gov",
  "nyc.gov",
];

export const NEWS_DOMAINS = [
  "6sqft.com",
  "abc7ny.com",
  "amny.com",
  "apnews.com",
  "bkreader.com",
  "bronx.news12.com",
  "brooklyn.news12.com",
  "brooklyneagle.com",
  "brooklynpaper.com",
  "bxtimes.com",
  "cbsnews.com",
  "citylimits.org",
  "fox5ny.com",
  "gothamist.com",
  "masstransitmag.com",
  "metro-magazine.com",
  "news12.com",
  "nbcnewyork.com",
  "norwoodnews.org",
  "ny1.com",
  "nydailynews.com",
  "nypost.com",
  "nytimes.com",
  "patch.com",
  "pix11.com",
  "progressiverailroading.com",
  "qns.com",
  "railwayage.com",
  "silive.com",
  "streetsblog.org",
  "nyc.streetsblog.org",
  "thecity.nyc",
  "timesledger.com",
  "westsiderag.com",
  "wnyc.org",
];

// Outlets that cover every city: their stories only count when they are
// clearly about New York.
export const NATIONAL_NEWS_DOMAINS = [
  "apnews.com",
  "cbsnews.com",
  "masstransitmag.com",
  "metro-magazine.com",
  "progressiverailroading.com",
  "railwayage.com",
];

const NYC_SIGNAL =
  /\b(mta|nyc|new york|nyct|brooklyn|queens|bronx|manhattan|staten island|harlem|subway riders in new york)\b/i;

export function hasNycSignal(text) {
  return NYC_SIGNAL.test(String(text ?? ""));
}

export const COMMUNITY_MEDIA_DOMAINS = [
  "i.redd.it",
  "v.redd.it",
  "preview.redd.it",
  "i.imgur.com",
  "imgur.com",
];

const ROUTE_CHAR = "[1-7A-GJLMNQRWZ]";

/** Map a URL to the trust tier used when deciding whether to apply an opening. */
export function classifyUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { domain: "", tier: "unverified" };
  }

  if (matchesDomain(hostname, OFFICIAL_DOMAINS)) {
    return { domain: hostname, tier: "official" };
  }
  if (matchesDomain(hostname, NEWS_DOMAINS)) {
    return { domain: hostname, tier: "news" };
  }
  if (matchesDomain(hostname, COMMUNITY_MEDIA_DOMAINS)) {
    return { domain: hostname, tier: "community" };
  }
  return { domain: hostname, tier: "unverified" };
}

function matchesDomain(hostname, domains) {
  return domains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

const SUBJECT_PATTERN =
  /\b(accessib(?:le|ility)|ada\b|elevators?|escalators?|wheelchair|ramps?|step[- ]free)/i;

const STRONG_OPENING_PATTERNS = [
  /\bnow (?:fully |completely )?(?:ada[- ])?(?:accessible|compliant)\b/,
  /\bbecom(?:es|e|ing) (?:fully |completely )?(?:ada[- ])?(?:accessible|compliant)\b/,
  /\b(?:has been|was|been|is) made (?:fully |completely )?(?:ada[- ])?accessible\b/,
  /\bmaking (?:the |it |this )?(?:[\w'’.-]+ ){0,6}(?:station )?(?:fully|completely) (?:ada[- ])?accessible\b/,
  /\bopening of (?:the )?(?:new,? )?(?:fully )?accessible\b/,
  /\bfully accessible for the first time\b/,
  /\bnewly (?:ada[- ])?accessible\b/,
  /\blatest (?:station )?to (?:become|be made) (?:fully )?(?:ada[- ])?(?:accessible|compliant)\b/,
  /\bopen(?:s|ed|ing)? (?:[\w-]+ ){0,3}(?:new )?elevators?\b/,
  /\b(?:new )?elevators? (?:are |is )?(?:now |finally |officially )?(?:open|opened|in service|up and running|debut)\b/,
  /\bplaced into service\b/,
  /\bput (?:in|into) service\b/,
  /\bcomplet(?:es|ed|ing|ion of)\b.{0,90}\b(?:accessib\w*|elevators?|ada)\b/,
  /\bfinish(?:es|ed)\b.{0,60}\b(?:ada|accessib\w*|elevators?)\b/,
  /\bunveil(?:s|ed)?\b.{0,50}\b(?:accessib\w*|elevators?)\b/,
  /\bada makeover\b/,
  /\badds?\b.{0,80}\blist of (?:fully )?accessible\b/,
  /\bjoins?\b.{0,60}\blist of (?:fully )?accessible\b/,
];

// Neutral MTA headlines ("MTA Announces Accessibility Upgrades at X") are
// usually openings, but sometimes partnerships for future work. Without the
// article text they are flagged for review rather than applied.
const TENTATIVE_TITLE_PATTERN =
  /\b(?:unveils?|announces?|celebrates?|delivers?)\b.{0,60}\baccessib\w*\b.{0,40}\b(?:at|for)\b/;

const FUTURE_PATTERNS = [
  /\bupcoming\b/,
  /\bto be made\b/,
  /\bwill (?:be|make|become|get|receive|add|install|open)\b/,
  /\bplans? to\b/,
  /\bproposals?\b/,
  /\brequest for proposals\b/,
  /\brfp\b/,
  /\bcontracts?\b/,
  /\bawards?\b/,
  /\bbreaks? ground\b/,
  /\bgroundbreaking\b/,
  /\bbegins? (?:construction|work|ada)\b/,
  /\bconstruction (?:begins|starts|is underway|underway)\b/,
  /\bto (?:finally )?get (?:new )?elevators\b/,
  /\bpartnership to make\b/,
  /\bset to (?:become|get|receive)\b/,
  /\bexpected to (?:open|be completed)\b/,
  /\b(?:closed|closure|closing|out of service|outages?|shut ?down)\b/,
];

const PARTIAL_PATTERN =
  /\b(uptown|downtown|manhattan-bound|brooklyn-bound|queens-bound|bronx-bound|coney island-bound|northbound|southbound)\b.{0,40}\b(platform|side|only|direction)\b/;
const FULL_PATTERN =
  /\b(fully|completely)\b|\bboth (?:directions|platforms|sides)\b|\ball (?:of its )?platforms\b|\b(?:northbound|uptown)\b.{0,90}\b(?:southbound|downtown)\b|\b(?:southbound|downtown)\b.{0,90}\b(?:northbound|uptown)\b/;

export function isAccessibilitySubject(text) {
  return SUBJECT_PATTERN.test(text ?? "");
}

function lower(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[‐-―]/g, "-")
    .toLowerCase();
}

export function splitSentences(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘'(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Score a headline plus optional lead paragraphs. Titles carry the most
 * weight; the lead is only used to break ties for neutral MTA titles such as
 * "MTA Announces Accessibility Upgrades at Rockaway Boulevard Subway Station".
 */
export function detectOpening({ title, lead = "" }) {
  const normalizedTitle = lower(title);
  const titleFuture = FUTURE_PATTERNS.some((pattern) => pattern.test(normalizedTitle));
  const titleStrong = STRONG_OPENING_PATTERNS.some((pattern) =>
    pattern.test(normalizedTitle),
  );

  let score = 0;
  if (titleStrong) score += 3;
  if (titleFuture) score -= 5;

  const leadSentences = splitSentences(lead).slice(0, 3).map(lower);
  let leadStrong = false;
  for (const sentence of leadSentences) {
    const strong = STRONG_OPENING_PATTERNS.some((pattern) => pattern.test(sentence));
    const future = FUTURE_PATTERNS.some((pattern) => pattern.test(sentence));
    if (strong) {
      leadStrong = true;
      score += 2;
      break;
    }
    if (future) score -= 1;
  }

  const combined = `${normalizedTitle} ${leadSentences.join(" ")}`;
  const partial = PARTIAL_PATTERN.test(combined) && !FULL_PATTERN.test(combined);

  const isOpening = score >= 2 && !titleFuture;
  return {
    future: titleFuture,
    isOpening,
    tentative:
      !isOpening && !titleFuture && !lead.trim() && TENTATIVE_TITLE_PATTERN.test(normalizedTitle),
    leadStrong,
    partial,
    score,
    subject: isAccessibilitySubject(`${title} ${lead}`),
    titleStrong,
  };
}

/** Pull subway route bullets ("F station", "(B/Q)", "2/3/4/5 lines", "JZ Station"). */
export function extractRouteTokens(text) {
  const tokens = new Set();
  const source = String(text ?? "");
  const suffixPattern = new RegExp(
    `(?<![A-Za-z0-9])((?:SIR|${ROUTE_CHAR}{1,4})(?:\\s*(?:,\\s*and|,\\s*&|/|,|&|and)\\s*(?:SIR|${ROUTE_CHAR}))*)\\s+(?:trains?|lines?|stations?|subway|stops?|platforms?)\\b`,
    "gi",
  );
  const parenthesizedPattern = new RegExp(
    `\\(((?:SIR|${ROUTE_CHAR})(?:\\s*(?:,\\s*and|,\\s*&|/|,|&|and)\\s*(?:SIR|${ROUTE_CHAR}))*)\\)`,
    "g",
  );

  for (const pattern of [suffixPattern, parenthesizedPattern]) {
    for (const match of source.matchAll(pattern)) {
      const group = match[1];
      // Case-sensitive guard: route letters are always written in capitals.
      if (/[a-z]/.test(group.replace(/\band\b/g, ""))) continue;
      for (const part of group.split(/\s*(?:,\s*and|,\s*&|\/|,|&|and)\s*/)) {
        if (part === "SIR") {
          tokens.add("SIR");
          continue;
        }
        for (const char of part) {
          if (new RegExp(ROUTE_CHAR).test(char)) tokens.add(char);
        }
      }
    }
  }

  return [...tokens];
}

const ORDINAL_WORDS = {
  first: "1",
  second: "2",
  third: "3",
  fourth: "4",
  fifth: "5",
  sixth: "6",
  seventh: "7",
  eighth: "8",
  ninth: "9",
  tenth: "10",
};

const WORD_REPLACEMENTS = [
  [/\b(?:avenue|ave)\b/g, "av"],
  [/\bstreets?\b/g, "st"],
  [/\broad\b/g, "rd"],
  [/\bboulevard\b/g, "blvd"],
  [/\bparkway\b/g, "pkwy"],
  [/\bhighway\b/g, "hwy"],
  [/\bsquare\b/g, "sq"],
  [/\bplace\b/g, "pl"],
  [/\bheights\b/g, "hts"],
  [/\bcent(?:er|re)\b/g, "ctr"],
  [/\bjunction\b/g, "jct"],
  [/\bfort\b/g, "ft"],
  [/\bmount\b/g, "mt"],
  [/\beast\b/g, "e"],
  [/\bwest\b/g, "w"],
  [/\bwashington\b/g, "wash"],
];

/** Normalize a station name or free text into space-separated comparable tokens. */
export function normalizeStationText(value) {
  let text = lower(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, "$1");

  text = text.replace(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(avenue|ave|av|street|st)\b/g,
    (_, ordinal, suffix) => `${ORDINAL_WORDS[ordinal]} ${suffix}`,
  );

  for (const [pattern, replacement] of WORD_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/[^a-z0-9]+/g, " ").trim();
}

const GENERIC_COMPONENTS = new Set([
  "center",
  "ctr",
  "college",
  "museum",
  "park",
  "plaza",
  "station",
  "terminal",
  "university",
]);

/**
 * Build a lookup of name variants for every subway station row. Complex names
 * ("Borough Hall/Court St", "149 St-Hostos") also index their distinctive
 * components, so "Hostos station" still resolves.
 */
export function buildStationIndex(stations) {
  const fullNames = new Set(stations.map((station) => normalizeStationText(station.station)));
  const variants = new Map();

  stations.forEach((station, index) => {
    const full = normalizeStationText(station.station);
    addVariant(variants, full, index);

    const components = station.station
      .split(/\s*[-/–—]\s*/)
      .map(normalizeStationText)
      .filter(Boolean);
    if (components.length < 2) return;

    for (const component of components) {
      if (component === full || fullNames.has(component)) continue;
      if (GENERIC_COMPONENTS.has(component)) continue;
      if (/^(?:[ew] )?\d+ (?:st|av|rd|blvd|pkwy|dr|pl)$/.test(component)) continue;
      const words = component.split(" ");
      if (words.length < 2 && component.length < 6) continue;
      addVariant(variants, component, index);
    }
  });

  return {
    stations,
    variants: [...variants.entries()]
      .map(([variant, indexes]) => ({ indexes: [...indexes], variant }))
      .sort((left, right) => right.variant.length - left.variant.length),
  };
}

function addVariant(variants, variant, index) {
  if (!variant) return;
  const indexes = variants.get(variant) ?? new Set();
  indexes.add(index);
  variants.set(variant, indexes);
}

/** Find station name mentions, dropping shorter matches nested inside longer ones. */
export function findStationMentions(text, index) {
  const haystack = ` ${normalizeStationText(text)} `;
  const spans = [];

  for (const { indexes, variant } of index.variants) {
    const needle = ` ${variant} `;
    let from = 0;
    while (from < haystack.length) {
      const position = haystack.indexOf(needle, from);
      if (position === -1) break;
      spans.push({
        end: position + needle.length - 1,
        indexes,
        start: position + 1,
        variant,
      });
      from = position + 1;
    }
  }

  return spans.filter(
    (span) =>
      !spans.some(
        (other) =>
          other !== span &&
          other.variant.length > span.variant.length &&
          other.start <= span.start &&
          other.end >= span.end,
      ),
  );
}

/**
 * Resolve the station rows an opening refers to.
 *
 * Returns { rows, reason } where rows are indexes into index.stations that are
 * not yet fully accessible (or partially accessible when the opening is full).
 * When the text cannot be pinned to one station, rows is empty and reason
 * explains why so the item can be surfaced for review instead.
 */
// A story is "about" a line's opening if it ran from a week before to six
// weeks after the date that line became accessible.
const OPENING_COVERAGE_DAYS = { after: 45, before: 7 };

function coveredOpening(row, publishedAt) {
  if (!publishedAt || !row.dateMadeAccessible) return false;
  const opened = Date.parse(`${row.dateMadeAccessible} 12:00 UTC`);
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(opened) || !Number.isFinite(published)) return false;
  const days = (published - opened) / 864e5;
  return days >= -OPENING_COVERAGE_DAYS.before && days <= OPENING_COVERAGE_DAYS.after;
}

export function resolveStations({ text, routeText = text, partial = false, publishedAt }, index) {
  const mentions = findStationMentions(text, index);
  if (mentions.length === 0) return { reason: "no-station", rows: [], mentions: [] };

  const routeTokens = extractRouteTokens(routeText);
  const groups = new Map();
  const trailingRoutes = new Map();
  // MTA headlines put the bullets straight after the name: "Kings Highway F",
  // "72 St 123", "Prospect Park BQS", "Woodhaven Blvd JZ". Read them from the
  // original text, where route letters are capitals; "Kings Hwy and" is not
  // the A, N and D.
  const bulletsAfterWord = new Map();
  for (const match of String(text ?? "").matchAll(/([A-Za-z0-9'’-]+)[ \t]+(SIR|[1-7A-GJLMNQRWZ]{1,4})(?![A-Za-z0-9])/g)) {
    const word = normalizeStationText(match[1]).split(" ").at(-1);
    if (!word) continue;
    const tokens = bulletsAfterWord.get(word) ?? new Set();
    if (match[2] === "SIR") tokens.add("SIR");
    else for (const char of match[2]) tokens.add(char);
    bulletsAfterWord.set(word, tokens);
  }
  for (const mention of mentions) {
    groups.set(mention.variant, mention.indexes);
    const tokens = bulletsAfterWord.get(mention.variant.split(" ").at(-1));
    if (tokens) trailingRoutes.set(mention.variant, tokens);
  }

  const resolved = new Set();
  const alreadyAccessible = new Set();
  const reasons = [];

  for (const [variant, indexes] of groups) {
    const rows = indexes.map((rowIndex) => ({ row: index.stations[rowIndex], rowIndex }));
    const matchesTokens = (tokens) =>
      rows.filter(({ row }) => row.services.some((service) => tokens.includes(String(service))));
    // Bullets written right after this name win; otherwise use any bullets in the text.
    const trailing = [...(trailingRoutes.get(variant) ?? [])];
    const trailingMatched = trailing.length ? matchesTokens(trailing) : [];
    const routeMatched = trailingMatched.length
      ? trailingMatched
      : routeTokens.length
        ? matchesTokens(routeTokens)
        : [];

    let candidates;
    if (routeMatched.length > 0) {
      // Line names picked up anywhere in an article can include a passing
      // mention ("…a short walk from the R"). If they point at both
      // accessible and inaccessible platforms of the same station, don't guess.
      const mixed =
        trailingMatched.length === 0 &&
        new Set(routeMatched.map(({ row }) => row.accessibilityStatus === "Accessible")).size > 1;
      if (mixed) {
        reasons.push(`ambiguous:${variant}`);
        continue;
      }
      candidates = routeMatched;
    } else {
      // No usable route bullets: only proceed when the name is unambiguous.
      const notAccessible = rows.filter(({ row }) => row.accessibilityStatus !== "Accessible");
      if (notAccessible.length === 0) {
        reasons.push(`already-accessible:${variant}`);
        for (const { rowIndex } of rows) alreadyAccessible.add(rowIndex);
        continue;
      }
      if (notAccessible.length < rows.length) {
        // e.g. "Borough Hall" where 2/3/4/5 are accessible but the R is not.
        // If the story ran right when one of the accessible lines opened, it
        // is coverage of that opening ("Borough Hall … now fully accessible",
        // July 22, 2026 = the 4/5). Otherwise don't guess.
        const justOpened = rows.filter(
          ({ row }) => row.accessibilityStatus === "Accessible" && coveredOpening(row, publishedAt),
        );
        if (justOpened.length > 0) {
          reasons.push(`already-accessible:${variant}`);
          for (const { rowIndex } of justOpened) alreadyAccessible.add(rowIndex);
          continue;
        }
        reasons.push(`ambiguous:${variant}`);
        continue;
      }
      const sameComplex = rows.every(
        ({ row }) =>
          row.borough === rows[0].row.borough &&
          row.neighborhood === rows[0].row.neighborhood &&
          normalizeStationText(row.station) === normalizeStationText(rows[0].row.station),
      );
      const planned = rows.filter(({ row }) => row.plannedAda);
      if (rows.length === 1 || sameComplex) {
        candidates = rows;
      } else if (planned.length === 1) {
        candidates = planned;
      } else {
        reasons.push(`ambiguous:${variant}`);
        continue;
      }
    }

    const eligible = candidates.filter(({ row }) =>
      partial
        ? row.accessibilityStatus === "Not accessible"
        : row.accessibilityStatus !== "Accessible",
    );
    if (eligible.length === 0) {
      reasons.push(`already-accessible:${variant}`);
      for (const { rowIndex } of candidates) alreadyAccessible.add(rowIndex);
      continue;
    }
    for (const { rowIndex } of eligible) resolved.add(rowIndex);
  }

  return {
    alreadyAccessibleRows: [...alreadyAccessible].filter((rowIndex) => !resolved.has(rowIndex)),
    mentions: [...groups.keys()],
    reason: resolved.size > 0 ? "matched" : (reasons[0]?.split(":")[0] ?? "no-station"),
    rows: [...resolved],
  };
}
