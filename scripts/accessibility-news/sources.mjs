// Network fetchers and parsers for the accessibility news auto-updater.
// Every source is independent: a blocked or broken source is reported in the
// run metadata but never stops the others.

import { fetchWithRetry } from "../fetch-with-retry.mjs";
import { classifyUrl, hasNycSignal, isAccessibilitySubject } from "./classify.mjs";

const MTA_ORIGIN = "https://www.mta.info";
const USER_AGENT =
  "AccessNYC-news-sync/2.0 (+https://nyc-ada.vercel.app; accessibility station tracker)";

export const GOOGLE_NEWS_QUERIES = [
  'MTA subway station "fully accessible"',
  'NYC subway station "ADA accessible"',
  'MTA "new elevators" subway station',
  '"Staten Island Railway" accessible station',
];

// NYC-only communities: posts here are assumed to be about New York.
export const NYC_SUBREDDITS = ["nyc", "newyorkcity", "AskNYC", "nycrail"];
// Worldwide transit communities: posts must clearly be about New York.
export const GENERAL_SUBREDDITS = ["Subways"];
export const REDDIT_SUBREDDITS = [...NYC_SUBREDDITS, ...GENERAL_SUBREDDITS];
const REDDIT_QUERY =
  '(elevator OR elevators OR accessible OR "ADA") (station OR subway OR train)';

// ---------------------------------------------------------------- parsing --

export function decodeHtml(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"', rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity);
}

export function stripTags(html) {
  return decodeHtml(
    String(html ?? "")
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse the Drupal views markup that powers mta.info/press-release. */
export function parseMtaPressReleaseListing(markup) {
  const releases = [];
  const anchorPattern = /<a\b([^>]*\bhref="\/press-release\/[^"]+"[^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of String(markup).matchAll(anchorPattern)) {
    const attributes = match[1];
    const href = attributes.match(/\bhref="([^"]*)"/i)?.[1] ?? "";
    const title = stripTags(attributes.match(/\btitle="([^"]*)"/i)?.[1] ?? "");
    const publishedAt = match[2].match(/<time\b[^>]*\bdatetime="([^"]+)"/i)?.[1] ?? "";
    if (!href || !title || Number.isNaN(Date.parse(publishedAt))) continue;
    releases.push({
      publishedAt: new Date(publishedAt).toISOString(),
      title,
      url: new URL(href, MTA_ORIGIN).toString(),
    });
  }

  return releases;
}

/** Extract the opening paragraphs of an mta.info article page. */
export function extractArticleLead(html, maxParagraphs = 4) {
  const paragraphs = [...String(html).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((text) => text.length > 60 && !/^(?:photo|credit|see |watch )/i.test(text));
  return paragraphs.slice(0, maxParagraphs).join(" ");
}

/** Parse a Google News RSS search feed. */
export function parseGoogleNewsRss(xml) {
  const items = [];
  for (const match of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const read = (tag) => decodeHtml(block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? "").trim();
    const sourceMatch = block.match(/<source\b[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
    const sourceName = decodeHtml(sourceMatch?.[2] ?? "").trim();
    const sourceUrl = decodeHtml(sourceMatch?.[1] ?? "");
    let title = stripTags(read("title"));
    if (sourceName && title.endsWith(` - ${sourceName}`)) {
      title = title.slice(0, -(sourceName.length + 3)).trim();
    }
    const link = read("link");
    const publishedAt = Date.parse(read("pubDate"));
    if (!title || !link || Number.isNaN(publishedAt)) continue;
    items.push({
      kind: "news",
      publishedAt: new Date(publishedAt).toISOString(),
      sourceName: sourceName || classifyUrl(sourceUrl).domain,
      sourceUrl,
      title,
      url: link,
    });
  }
  return items;
}

/** Parse Reddit listing JSON (public or OAuth). */
export function parseRedditListing(json) {
  const children = json?.data?.children ?? [];
  return children
    .map((child) => child?.data)
    .filter(Boolean)
    .map((post) => {
      const linkedUrl = post.url_overridden_by_dest ?? (post.is_self ? null : post.url) ?? null;
      const bodyUrls = extractUrls(decodeHtml(post.selftext ?? ""));
      const media =
        Boolean(post.is_gallery) ||
        post.post_hint === "image" ||
        post.post_hint === "hosted:video" ||
        (linkedUrl ? classifyUrl(linkedUrl).tier === "community" : false);
      return {
        author: post.author ?? "",
        body: decodeHtml(post.selftext ?? "").slice(0, 2_000),
        kind: "reddit",
        linkedUrls: [linkedUrl, ...bodyUrls].filter(Boolean),
        media,
        publishedAt: new Date((post.created_utc ?? 0) * 1_000).toISOString(),
        score: post.score ?? 0,
        subreddit: post.subreddit ?? "",
        title: decodeHtml(post.title ?? ""),
        url: `https://www.reddit.com${post.permalink ?? ""}`,
      };
    })
    .filter((post) => post.title && post.url.length > "https://www.reddit.com".length);
}

/** Parse a Reddit Atom feed (fallback when JSON is blocked). */
export function parseRedditAtom(xml) {
  const posts = [];
  for (const match of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/gi)) {
    const block = match[1];
    const title = stripTags(block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const url = decodeHtml(block.match(/<link\b[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const updated = Date.parse(block.match(/<(?:published|updated)>([^<]+)</i)?.[1] ?? "");
    const content = decodeHtml(block.match(/<content\b[^>]*>([\s\S]*?)<\/content>/i)?.[1] ?? "");
    const author = stripTags(block.match(/<name>([\s\S]*?)<\/name>/i)?.[1] ?? "").replace(/^\/?u\//, "");
    const subreddit = block.match(/<category\b[^>]*term="([^"]+)"/i)?.[1] ?? "";
    if (!title || !url || Number.isNaN(updated)) continue;
    const links = extractUrls(content).filter((link) => !/reddit\.com\/(?:r|u|user)\//.test(link));
    posts.push({
      author,
      body: stripTags(content).slice(0, 2_000),
      kind: "reddit",
      linkedUrls: links,
      media: links.some((link) => classifyUrl(link).tier === "community"),
      publishedAt: new Date(updated).toISOString(),
      score: 0,
      subreddit,
      title,
      url,
    });
  }
  return posts;
}

export function extractUrls(text) {
  return [...new Set(String(text ?? "").match(/https?:\/\/[^\s)\]"'<>]+/g) ?? [])].map((url) =>
    url.replace(/[.,;:!?]+$/, ""),
  );
}

// --------------------------------------------------------------- fetching --

async function getText(url, options = {}, fetchImpl) {
  const response = await fetchWithRetry(
    url,
    {
      ...options,
      headers: { "User-Agent": USER_AGENT, ...(options.headers ?? {}) },
    },
    { baseDelayMs: 750, fetchImpl, logger: quietLogger, maxAttempts: 2, timeoutMs: 20_000 },
  );
  return response.text();
}

const quietLogger = { log() {}, warn(message) { console.warn(`  ${message}`); }, error: console.error };

export async function fetchMtaReleases({ fetchImpl, lookbackMs, now = Date.now(), pages = 12 }) {
  const listings = [];
  for (let page = 0; page < pages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      view_display_id: "block_1",
      view_name: "index_press_release",
      view_path: "press-release",
    });
    const body = await getText(
      `${MTA_ORIGIN}/views/ajax?${params}`,
      { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } },
      fetchImpl,
    );
    const commands = JSON.parse(body);
    const markup = commands.find(
      (command) => command?.command === "insert" && typeof command.data === "string" && command.data.includes("press-release"),
    )?.data;
    const pageReleases = markup ? parseMtaPressReleaseListing(markup) : [];
    listings.push(...pageReleases);
    // Stop paging once a whole page is older than the lookback window.
    if (pageReleases.length === 0 || pageReleases.every((release) => now - Date.parse(release.publishedAt) > lookbackMs)) {
      break;
    }
  }

  const relevant = listings.filter(
    (release) =>
      now - Date.parse(release.publishedAt) <= lookbackMs &&
      isAccessibilitySubject(release.title) &&
      !/\b(long island rail road|lirr|metro-north)\b/i.test(release.title),
  );

  const items = [];
  for (const release of relevant) {
    let lead = "";
    try {
      // Some article pages refuse automated requests. The tracker identifies
      // itself honestly and falls back to the headline when that happens.
      lead = extractArticleLead(await getText(release.url, {}, fetchImpl));
    } catch (error) {
      console.warn(`  Could not read ${release.url}: ${error.message}`);
    }
    items.push({ ...release, kind: "mta", lead, sourceName: "MTA", sourceUrl: MTA_ORIGIN });
  }
  return { items, scanned: listings.length };
}

export async function fetchGoogleNews({ fetchImpl, queries = GOOGLE_NEWS_QUERIES, windowDays = 45 }) {
  const items = [];
  for (const query of queries) {
    const params = new URLSearchParams({
      ceid: "US:en",
      gl: "US",
      hl: "en-US",
      q: `${query} when:${windowDays}d`,
    });
    const xml = await getText(`https://news.google.com/rss/search?${params}`, {}, fetchImpl);
    items.push(...parseGoogleNewsRss(xml));
  }
  return { items, scanned: items.length };
}

export async function fetchReddit({ env = process.env, fetchImpl, redditDelayMs = 2_500, subreddits = REDDIT_SUBREDDITS }) {
  const query = new URLSearchParams({
    limit: "50",
    q: REDDIT_QUERY,
    raw_json: "1",
    restrict_sr: "1",
    sort: "new",
    t: "month",
  });

  let token = null;
  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) {
    const credentials = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString("base64");
    const tokenBody = await getText(
      "https://www.reddit.com/api/v1/access_token",
      {
        body: "grant_type=client_credentials",
        headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      },
      fetchImpl,
    );
    token = JSON.parse(tokenBody).access_token;
  }

  // One request per subreddit so a renamed, private, or banned community
  // can't take the whole source down.
  const items = [];
  const modes = new Set();
  let failures = 0;
  for (const [position, subreddit] of subreddits.entries()) {
    // Reddit rate-limits anonymous clients hard; space requests out.
    if (position > 0 && !token) await new Promise((resolve) => setTimeout(resolve, redditDelayMs));
    try {
      const result = await fetchSubreddit(subreddit, query, token, fetchImpl);
      modes.add(result.mode);
      const nycOnly = NYC_SUBREDDITS.includes(subreddit);
      items.push(
        ...result.items.filter((post) => nycOnly || hasNycSignal(`${post.title} ${post.body}`)),
      );
    } catch (error) {
      failures += 1;
      console.warn(`  r/${subreddit} unavailable: ${error.message}`);
    }
  }
  if (failures === subreddits.length) {
    throw new Error("Every subreddit request failed.");
  }
  return { items, mode: [...modes].join("+"), scanned: items.length };
}

async function fetchSubreddit(subreddit, query, token, fetchImpl) {
  const path = `/r/${subreddit}/search`;
  if (token) {
    const json = await getText(
      `https://oauth.reddit.com${path}?${query}`,
      { headers: { Authorization: `Bearer ${token}` } },
      fetchImpl,
    );
    return { items: parseRedditListing(JSON.parse(json)), mode: "oauth" };
  }
  try {
    const json = await getText(`https://www.reddit.com${path}.json?${query}`, {}, fetchImpl);
    return { items: parseRedditListing(JSON.parse(json)), mode: "public-json" };
  } catch {
    const xml = await getText(`https://www.reddit.com${path}.rss?${query}`, {}, fetchImpl);
    return { items: parseRedditAtom(xml), mode: "rss" };
  }
}

// ---------------------------------------------------------- article glimpse --
//
// Headlines like "118-Year-Old Brooklyn Subway Station Gets an ADA Makeover"
// don't name the station. To find it, read the article's opening through the
// channels publishers offer for automated readers: the public WordPress REST
// API most NYC outlets run on, then the site's RSS feed. Sites that offer
// neither are left alone and the item stays in review.

export function normalizeHeadline(value) {
  return stripTags(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function headlineSimilarity(left, right) {
  const a = normalizeHeadline(left);
  const b = normalizeHeadline(right);
  if (!a || !b) return 0;
  if (a === b || a.includes(b) || b.includes(a)) return 1;
  const leftWords = new Set(a.split(" "));
  const rightWords = new Set(b.split(" "));
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return shared / Math.max(leftWords.size, rightWords.size);
}

function bestMatch(candidates, title) {
  return candidates
    .map((candidate) => ({ ...candidate, score: headlineSimilarity(candidate.title, title) }))
    .filter((candidate) => candidate.score >= 0.75)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function parseWordPressPosts(json) {
  if (!Array.isArray(json)) return [];
  return json
    .map((post) => ({
      text: stripTags(post?.content?.rendered || post?.excerpt?.rendered || ""),
      title: stripTags(post?.title?.rendered ?? ""),
      url: post?.link ?? "",
    }))
    .filter((post) => post.title && post.url);
}

export function parseRssItems(xml) {
  const items = [];
  for (const match of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const read = (tag) =>
      decodeHtml(block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? "");
    const title = stripTags(read("title"));
    const url = stripTags(read("link"));
    const text = stripTags(read("content:encoded") || read("description"));
    if (title && url) items.push({ text, title, url });
  }
  return items;
}

/**
 * Returns { articleUrl, text, via } for the article behind a headline, or
 * null when the publisher offers no machine-readable copy.
 */
export async function fetchArticleGlimpse({ sourceUrl, title }, { fetchImpl } = {}) {
  let origin;
  try {
    origin = new URL(sourceUrl).origin;
  } catch {
    return null;
  }

  // WordPress search ANDs every word with LIKE, so use plain distinctive words:
  // drop possessives ("Brooklyn’s" → "Brooklyn"), short words, and site
  // boilerplate that isn't part of the headline itself.
  const terms = searchTerms(title);
  const attempts = [
    {
      parse: (body) => parseWordPressPosts(JSON.parse(body)),
      url: `${origin}/wp-json/wp/v2/posts?${new URLSearchParams({ _fields: "link,title,excerpt,content", per_page: "5", search: terms })}`,
      via: "wordpress",
    },
    { parse: parseRssItems, url: `${origin}/feed/`, via: "rss" },
    { parse: parseRssItems, url: `${origin}/rss`, via: "rss" },
  ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      const body = await getText(attempt.url, {}, fetchImpl);
      const candidates = attempt.parse(body);
      const match = bestMatch(candidates, title);
      if (match?.text) {
        return { articleUrl: match.url, text: match.text.slice(0, 2_000), via: attempt.via };
      }
      failures.push(`${attempt.via}: ${candidates.length} item(s), none matched`);
    } catch (error) {
      // Not offered by this publisher (404/403/not JSON); try the next channel.
      const status = String(error?.message ?? error).match(/HTTP \d{3}[^.]*/)?.[0];
      failures.push(`${attempt.via}: ${status ?? "unreadable"}`);
    }
  }
  return { failures };
}

const HEADLINE_BOILERPLATE = /^(?:rail news|exclusive|photos|icymi|video|watch|update)\s*[-:|]\s*|\.?\s*for railroad career professionals$/gi;

export function searchTerms(title) {
  const cleaned = stripTags(title)
    .replace(HEADLINE_BOILERPLATE, "")
    .replace(/['’‘]s\b/gi, "")
    .replace(/['’‘]/g, "");
  const stop = new Set(["the", "and", "for", "with", "its", "now", "gets", "after", "into", "from", "this", "that"]);
  return normalizeHeadline(cleaned)
    .split(" ")
    .filter((word) => word.length > 2 && !stop.has(word))
    .slice(0, 6)
    .join(" ");
}
