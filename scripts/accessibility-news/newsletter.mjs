// "This Week in MTA Construction" — MTA Construction & Development's weekly
// newsletter, read from its public archive page. Each issue is split into
// its sections; sections about elevators, escalators or accessibility become
// feed items, and a section saying a station is now accessible counts as an
// official MTA source. Issues are read once and cached by URL.

import { isAccessibilitySubject } from "./classify.mjs";
import { decodeHtml, fetchText, stripTags } from "./sources.mjs";

export const NEWSLETTER_ARCHIVE_URL =
  "https://cloud.info.mta.org/construction-development-updates-archive";
export const NEWSLETTER_NAME = "This Week in MTA Construction";

/** Archive page → [{ date (YYYY-MM-DD), title, url }], newest first. */
export function parseNewsletterArchive(html) {
  const issues = [];
  const source = String(html);
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of source.matchAll(anchorPattern)) {
    const url = decodeHtml(match[1]).trim();
    if (!/^https?:\/\/view\.info\.mta\.org\//i.test(url)) continue;
    const title = stripTags(match[2]);
    // The date sits just before the link: "11/17/2026 – <a …>".
    const before = stripTags(source.slice(Math.max(0, match.index - 240), match.index));
    const dateMatch = [...before.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].at(-1);
    if (!dateMatch || !title) continue;
    const [, month, day, year] = dateMatch;
    issues.push({
      date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      title,
      url,
    });
  }
  const seen = new Set();
  return issues
    .filter((issue) => !seen.has(issue.url) && seen.add(issue.url))
    .sort((left, right) => right.date.localeCompare(left.date));
}

const BOILERPLATE =
  /^(?:view (?:this|as|in) (?:a )?(?:web ?page|browser)|unsubscribe|manage (?:your )?preferences|privacy policy|sign up|subscribe|follow us|share this|forward to a friend|©|copyright|this email was sent|you are receiving|metropolitan transportation authority$|2 broadway)/i;

/**
 * Split an issue's HTML into sections. Email layouts vary, so headings are
 * found two ways: real <h1>–<h4> tags, and short standalone lines followed
 * by a paragraph (bold table-cell headings in many newsletter templates).
 */
export function parseNewsletterSections(html) {
  const marked = String(html)
    .replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h[1-4]\b[^>]*>/gi, "\n§H§")
    .replace(/<\/h[1-4]>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|td|th|tr|li|table|section|article)>/gi, "\n");

  const lines = marked
    .split("\n")
    .map((line) => {
      const heading = line.includes("§H§");
      return { heading, text: stripTags(line.replace("§H§", "")) };
    })
    .filter((line) => line.text && !BOILERPLATE.test(line.text));

  const isImplicitHeading = (line, next) =>
    !line.heading &&
    line.text.length >= 4 &&
    line.text.length <= 110 &&
    !/[.,;:]$/.test(line.text) &&
    next &&
    !next.heading &&
    next.text.length >= 120;

  const sections = [];
  let current = null;
  lines.forEach((line, position) => {
    const next = lines[position + 1];
    if (line.heading || isImplicitHeading(line, next)) {
      if (current && current.text.trim()) sections.push(current);
      current = { heading: line.text, text: "" };
      return;
    }
    if (!current) current = { heading: "", text: "" };
    current.text = `${current.text} ${line.text}`.trim();
  });
  if (current && current.text.trim()) sections.push(current);

  return sections
    .map((section) => ({ heading: section.heading, text: section.text.slice(0, 2_500) }))
    .filter((section) => section.heading || section.text.length > 80);
}

/** Turn an issue's sections into raw items (accessibility-related sections only). */
export function newsletterItems(issue, sections) {
  return sections
    .map((section, position) => ({ position, section }))
    .filter(({ section }) => isAccessibilitySubject(`${section.heading} ${section.text}`))
    .map(({ position, section }) => {
      const firstSentence = section.text.split(/(?<=[.!?])\s+/)[0] ?? "";
      const heading =
        section.heading ||
        (firstSentence.length <= 140 ? firstSentence : `${firstSentence.slice(0, 137)}…`);
      return {
        issueTitle: issue.title,
        kind: "newsletter",
        lead: section.text,
        publishedAt: `${issue.date}T15:00:00.000Z`,
        sourceName: `${NEWSLETTER_NAME}, ${issue.title.replace(/^This Week in MTA Construction:\s*/i, "")}`,
        sourceUrl: issue.url,
        title: heading,
        url: `${issue.url}${issue.url.includes("#") ? "-" : "#"}section-${position + 1}`,
      };
    });
}

const ISSUE_FETCH_LIMIT = 25;

/**
 * Read new issues from the archive. `known` is the list of issues already
 * read on earlier runs ({ url, … }); those aren't fetched again.
 * Returns { items, issues (all processed, for caching), log }.
 */
export async function fetchConstructionNewsletter({ fetchImpl, known = [], lookbackDays = 150, now = Date.now() } = {}) {
  const archive = parseNewsletterArchive(await fetchText(NEWSLETTER_ARCHIVE_URL, {}, fetchImpl));
  if (archive.length === 0) throw new Error("No issues found on the newsletter archive page.");
  const cutoff = new Date(now - lookbackDays * 864e5).toISOString().slice(0, 10);
  const knownUrls = new Set(known.map((issue) => issue.url));
  const items = [];
  const log = [];
  const processed = known.filter((issue) => issue.date >= cutoff);

  let fetched = 0;
  for (const issue of archive) {
    if (issue.date < cutoff || knownUrls.has(issue.url)) continue;
    if (fetched >= ISSUE_FETCH_LIMIT) break;
    fetched += 1;
    try {
      const sections = parseNewsletterSections(await fetchText(issue.url, {}, fetchImpl));
      const issueItems = newsletterItems(issue, sections);
      items.push(...issueItems);
      processed.push({ ...issue, accessibilitySections: issueItems.length, readAt: new Date(now).toISOString(), sections: sections.length });
      log.push({ headings: issueItems.map((item) => item.title), issue, sections: sections.length });
    } catch (error) {
      // Not cached, so the next run tries again.
      log.push({ error: error.message, issue });
    }
  }

  processed.sort((left, right) => right.date.localeCompare(left.date));
  return { archiveCount: archive.length, issues: processed, items, log };
}
