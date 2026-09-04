const MTA_ORIGIN = "https://www.mta.info";

export type MtaPressRelease = {
  imageUrl: string | null;
  publishedAt: string;
  title: string;
  url: string;
};

export function parsePressReleaseMarkup(markup: string) {
  const releases: MtaPressRelease[] = [];
  const anchorPattern =
    /<a\b([^>]*\bhref="\/press-release\/[^"]+"[^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of markup.matchAll(anchorPattern)) {
    const attributes = match[1];
    const content = match[2];
    const href = readAttribute(attributes, "href");
    const title = decodeHtml(readAttribute(attributes, "title"));
    const publishedAt =
      content.match(/<time\b[^>]*\bdatetime="([^"]+)"/i)?.[1] ?? "";
    const imageUrl = normalizeMtaPressReleaseImageUrl(
      decodeHtml(content.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] ?? ""),
    );

    if (!href || !title || !publishedAt || Number.isNaN(Date.parse(publishedAt))) {
      continue;
    }

    releases.push({
      imageUrl,
      publishedAt,
      title,
      url: new URL(href, MTA_ORIGIN).toString(),
    });
  }

  return releases;
}

export function isSubwayAccessibilityRelease(title: string) {
  const normalizedTitle = title.toLowerCase();
  const hasAccessibilitySubject =
    /\b(accessib(?:le|ility)|ada|elevators?)\b/.test(normalizedTitle);
  const hasStationSubject =
    /\b(subway|stations?|elevators?)\b/.test(normalizedTitle);
  const isCommuterRailOnly =
    /\b(long island rail road|lirr|metro-north)\b/.test(normalizedTitle) &&
    !/\bsubway\b/.test(normalizedTitle);

  return hasAccessibilitySubject && hasStationSubject && !isCommuterRailOnly;
}

function normalizeMtaPressReleaseImageUrl(value: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, MTA_ORIGIN);
    const isPressReleasePhoto =
      url.protocol === "https:" &&
      url.hostname === "files.mta.info" &&
      url.pathname.startsWith("/s3fs-public/");
    const isMtaArticleFallback =
      url.protocol === "https:" &&
      url.hostname === "www.mta.info" &&
      url.pathname.startsWith("/modules/custom/mta_article/images/");

    return isPressReleasePhoto || isMtaArticleFallback ? url.toString() : null;
  } catch {
    return null;
  }
}

function readAttribute(attributes: string, name: string) {
  return attributes.match(new RegExp(`\\b${name}="([^"]*)"`, "i"))?.[1] ?? "";
}

function decodeHtml(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) =>
      namedEntities[name.toLowerCase()] ?? entity,
    )
    .replace(/\s+/g, " ")
    .trim();
}
