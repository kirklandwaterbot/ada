import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildStationIndex,
  classifyUrl,
  detectOpening,
  extractRouteTokens,
  normalizeStationText,
  resolveStations,
} from "./accessibility-news/classify.mjs";
import {
  applyOpenings,
  buildNewsFile,
  enrichWithGlimpses,
  recomputeSummary,
} from "./accessibility-news/pipeline.mjs";
import {
  extractArticleLead,
  fetchArticleGlimpse,
  fetchReddit,
  headlineSimilarity,
  parseRssItems,
  parseWordPressPosts,
  searchTerms,
  parseGoogleNewsRss,
  parseMtaPressReleaseListing,
  parseRedditAtom,
  parseRedditListing,
} from "./accessibility-news/sources.mjs";

// Start every test from a known state so the suite keeps passing after the
// real auto-updater has applied these openings to the checked-in data.
const KNOWN_STATE = [
  ["Kings Hwy", "F", "Not accessible", true],
  ["Kings Hwy", "N", "Not accessible", true],
  ["137 St-City College", "1", "Partially accessible", true],
  ["Steinway St", "M/R", "Not accessible", true],
  ["Junius St", "3", "Not accessible", true],
  ["Woodhaven Blvd", "M/R", "Not accessible", true],
];
const baseData = () => {
  const data = JSON.parse(
    readFileSync(new URL("../data/accessibility-stations.json", import.meta.url), "utf8"),
  );
  for (const [station, services, status, planned] of KNOWN_STATE) {
    const target = data.stations.find(
      (candidate) => candidate.station === station && candidate.services.join("/") === services,
    );
    target.accessibilityStatus = status;
    target.plannedAda = planned;
  }
  data.summary = recomputeSummary(data);
  return data;
};
const row = (data, station, services) =>
  data.stations.find(
    (candidate) => candidate.station === station && candidate.services.join("/") === services,
  );
const recent = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();

test("normalizes station names the way headlines write them", () => {
  assert.equal(normalizeStationText("Kings Highway"), "kings hwy");
  assert.equal(normalizeStationText("149th Street–Hostos"), "149 st hostos");
  assert.equal(normalizeStationText("Rockaway Boulevard"), "rockaway blvd");
  assert.equal(normalizeStationText("Eighth Avenue"), "8 av");
  assert.equal(normalizeStationText("the eighth station"), "the eighth station");
});

test("reads route bullets without confusing English words for trains", () => {
  assert.deepEqual(extractRouteTokens("Kings Highway F Station"), ["F"]);
  assert.deepEqual(extractRouteTokens("Woodhaven Blvd JZ Station").sort(), ["J", "Z"]);
  assert.deepEqual(extractRouteTokens("Borough Hall station on the 2/3/4/5 lines").sort(), ["2", "3", "4", "5"]);
  assert.deepEqual(extractRouteTokens("Church Avenue (B/Q)").sort(), ["B", "Q"]);
  assert.deepEqual(extractRouteTokens("is a station that a new train serves"), []);
});

test("tells openings apart from announcements of future work", () => {
  assert.equal(detectOpening({ title: "Bay Ridge subway station becomes fully ADA accessible" }).isOpening, true);
  assert.equal(detectOpening({ title: "MTA Opens Three Elevators at 149th Street-Hostos Station" }).isOpening, true);
  assert.equal(
    detectOpening({
      lead: "The Metropolitan Transportation Authority (MTA) today announced the completion of accessibility upgrades at the Rockaway Blvd station, making the station fully accessible.",
      title: "MTA Announces Accessibility Upgrades at Rockaway Boulevard Subway Station",
    }).isOpening,
    true,
  );
  assert.equal(
    detectOpening({
      title: "MTA Announces Upcoming Accessibility Upgrades at 50 St 1 Train Station Funded Through Zoning for Accessibility Program",
    }).isOpening,
    false,
  );
  assert.equal(
    detectOpening({
      lead: "The MTA and Columbia University today announced a public-private partnership to make the 125 St subway station in Manhattan accessible.",
      title: "MTA and Columbia University Announce Accessibility Improvements at 125 St 1 Subway Station",
    }).isOpening,
    false,
  );
  assert.equal(detectOpening({ title: "6 NYC subway stations begin ADA upgrades funded by congestion pricing" }).isOpening, false);
  assert.equal(detectOpening({ title: "Elevator at Kings Highway closed for repairs" }).isOpening, false);
});

test("classifies proof sources by trust tier", () => {
  assert.equal(classifyUrl("https://www.mta.info/press-release/foo").tier, "official");
  assert.equal(classifyUrl("https://www.governor.ny.gov/news/foo").tier, "official");
  assert.equal(classifyUrl("https://www.amny.com/nyc-transit/foo").tier, "news");
  assert.equal(classifyUrl("https://brooklyn.news12.com/foo").tier, "news");
  assert.equal(classifyUrl("https://i.redd.it/abc.jpg").tier, "community");
  assert.equal(classifyUrl("https://randomblog.example/foo").tier, "unverified");
});

test("resolves stations using route bullets and refuses to guess", () => {
  const data = baseData();
  const index = buildStationIndex(data.stations);
  const pick = (result) => result.rows.map((i) => `${data.stations[i].station} ${data.stations[i].services.join("/")}`);

  assert.deepEqual(pick(resolveStations({ text: "Kings Highway F station is now fully accessible" }, index)), ["Kings Hwy F"]);
  // Live MTA headline style: bullets right after the name, no "station".
  assert.deepEqual(
    pick(resolveStations({ text: "MTA Adds Kings Highway F to Growing List of Accessible Subway Stations" }, index)),
    ["Kings Hwy F"],
  );
  assert.deepEqual(
    pick(resolveStations({ text: "MTA Adds Kings Highway N to Growing List of Accessible Subway Stations" }, index)),
    ["Kings Hwy N"],
  );
  // "a" after a name is an article, not the A train, unless a row has the A.
  assert.equal(resolveStations({ text: "Kings Highway a station now fully accessible" }, index).reason, "ambiguous");
  const ambiguous = resolveStations({ text: "Kings Highway station is now fully accessible" }, index);
  assert.deepEqual(ambiguous.rows, []);
  assert.equal(ambiguous.reason, "ambiguous");

  // Borough Hall's 2/3/4/5 are already accessible; never flip the R by accident.
  assert.deepEqual(resolveStations({ text: "Borough Hall station is now fully accessible" }, index).rows, []);
  assert.equal(
    resolveStations({ text: "Borough Hall station on the 2/3/4/5 lines is now fully accessible" }, index).reason,
    "already-accessible",
  );

  // A passing mention of the R elsewhere in an article must not flip it.
  assert.deepEqual(
    resolveStations({
      routeText: "Borough Hall serves the 2, 3, 4, and 5 trains. The R train stops at Court St nearby.",
      text: "Borough Hall station is now fully accessible",
    }, index).rows,
    [],
  );

  // Partial → full upgrade.
  assert.deepEqual(pick(resolveStations({ text: "137 St-City College 1 train station is now ADA accessible" }, index)), ["137 St-City College 1"]);

  // Every line group of a not-yet-accessible complex updates together.
  const hostosData = baseData();
  for (const station of hostosData.stations.filter((s) => s.station === "149 St-Hostos")) {
    station.accessibilityStatus = "Not accessible";
  }
  const hostos = resolveStations({ text: "MTA opens three elevators at 149th Street-Hostos station" }, buildStationIndex(hostosData.stations));
  assert.equal(hostos.rows.length, 2);
});

test("builds a feed and applies only openings with trustworthy proof", () => {
  const data = baseData();
  const rawItems = [
    {
      kind: "mta",
      lead: "The Metropolitan Transportation Authority (MTA) today announced the completion of three new elevators at the Kings Highway F station in Brooklyn, making the station fully accessible. Kings Highway is the fifth station completed under ADA Package 3.",
      publishedAt: recent(40),
      sourceName: "MTA",
      title: "MTA Completes Accessibility Upgrades at Kings Highway F Station",
      url: "https://www.mta.info/press-release/mta-completes-accessibility-upgrades-kings-highway-f-station",
    },
    {
      kind: "news",
      publishedAt: recent(39),
      sourceName: "amNY",
      sourceUrl: "https://www.amny.com",
      title: "Kings Highway F station gets three new elevators, now ADA accessible",
      url: "https://news.google.com/rss/articles/abc",
    },
    {
      kind: "news",
      publishedAt: recent(30),
      sourceName: "amNY",
      sourceUrl: "https://www.amny.com",
      title: "West Harlem's 137 St-City College 1 train station is now ADA accessible with two new elevators",
      url: "https://news.google.com/rss/articles/def",
    },
    {
      kind: "mta",
      lead: "The MTA today announced the opening of a modernized elevator at the W 4 St-Wash Sq station.",
      publishedAt: recent(20),
      sourceName: "MTA",
      title: "PHOTOS: MTA Announces Modernized Elevator Opens at W 4 St-Wash Sq Station",
      url: "https://www.mta.info/press-release/modernized-elevator-w-4-st",
    },
    {
      kind: "mta",
      lead: "Proposals from qualified firms are due on Sept. 14 and the MTA intends to award the design-build contract by the end of the year.",
      publishedAt: recent(15),
      sourceName: "MTA",
      title: "MTA Announces Five Brooklyn Subway Stations to Be Made Accessible, Enabled by Congestion Pricing Funding",
      url: "https://www.mta.info/press-release/five-brooklyn-stations",
    },
    {
      author: "rider1",
      body: "",
      kind: "reddit",
      linkedUrls: ["https://i.redd.it/junius.jpg"],
      media: true,
      publishedAt: recent(5),
      subreddit: "Subways",
      title: "Junius St (3) elevators are finally open!",
      url: "https://www.reddit.com/r/Subways/comments/1/junius",
    },
    {
      author: "rider2",
      body: "Official: https://www.mta.info/press-release/steinway-st-now-fully-accessible",
      kind: "reddit",
      linkedUrls: ["https://www.mta.info/press-release/steinway-st-now-fully-accessible"],
      media: false,
      publishedAt: recent(3),
      subreddit: "nyc",
      title: "Steinway St M/R station is now fully accessible",
      url: "https://www.reddit.com/r/nyc/comments/2/steinway",
    },
    {
      kind: "news",
      publishedAt: recent(2),
      sourceName: "Some Blog",
      sourceUrl: "https://someblog.example",
      title: "Woodhaven Blvd M/R station now fully accessible",
      url: "https://news.google.com/rss/articles/ghi",
    },
  ];

  const accessibleBefore = data.summary.accessible;
  const { changes, file } = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: null,
    rawItems,
    review: {},
    sources: [],
  });

  const changed = Object.fromEntries(changes.map((change) => [change.key.split("|")[0] + " " + change.key.split("|")[2], change.after]));
  assert.deepEqual(changed, {
    "137 St-City College 1": "Accessible",
    "Kings Hwy F": "Accessible",
    "Steinway St M/R": "Accessible",
  });

  const kings = row(data, "Kings Hwy", "F");
  assert.equal(kings.accessibilityStatus, "Accessible");
  assert.equal(kings.plannedAda, false);
  assert.match(kings.dateMadeAccessible, /^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  assert.equal(row(data, "Kings Hwy", "N").accessibilityStatus, "Not accessible");
  assert.equal(row(data, "Junius St", "3").accessibilityStatus, "Not accessible");
  assert.equal(row(data, "Woodhaven Blvd", "M/R").accessibilityStatus, "Not accessible");

  const override = data.sourceOverrides.find((entry) => entry.station === "Kings Hwy");
  assert.equal(override.sourceUrl, rawItems[0].url);
  assert.equal(override.source, "MTA press release");

  const kingsOpening = file.openings.find((opening) => opening.station === "Kings Hwy");
  assert.equal(kingsOpening.verification, "official");
  assert.equal(kingsOpening.evidence.length, 2);
  assert.equal(file.openings.find((opening) => opening.station === "Junius St").readyToApply, false);
  assert.equal(file.feed.find((item) => item.title.includes("Woodhaven")).status, "needs-review");
  assert.equal(file.feed.find((item) => item.title.includes("Modernized")).status, "already-accessible");
  assert.equal(file.feed.find((item) => item.title.includes("Five Brooklyn")).status, "news");
  assert.equal(file.feed.find((item) => item.title.includes("Steinway")).tier, "official");

  assert.deepEqual(data.summary, recomputeSummary(data));
  assert.equal(data.summary.accessible, accessibleBefore + 3);
});

test("re-running with the same items is idempotent and honours review rejections", () => {
  const data = baseData();
  const item = {
    kind: "news",
    publishedAt: recent(10),
    sourceName: "Gothamist",
    sourceUrl: "https://gothamist.com",
    title: "Junius St 3 station is now fully accessible",
    url: "https://news.google.com/rss/articles/junius",
  };
  const first = buildNewsFile({ accessibilityData: data, now: new Date(), previous: null, rawItems: [item], review: {}, sources: [] });
  assert.equal(first.changes.length, 1);
  const second = buildNewsFile({ accessibilityData: data, now: new Date(), previous: first.file, rawItems: [item], review: {}, sources: [] });
  assert.equal(second.changes.length, 0);
  assert.equal(second.file.openings.length, 1);

  const fresh = baseData();
  const rejected = buildNewsFile({
    accessibilityData: fresh,
    now: new Date(),
    previous: null,
    rawItems: [item],
    review: { rejectUrls: [item.url] },
    sources: [],
  });
  assert.equal(rejected.changes.length, 0);
  assert.equal(applyOpenings(fresh, []).length, 0);
});

test("parses MTA, Google News and Reddit payloads", () => {
  const listing = parseMtaPressReleaseListing(`
    <div class="view-index-press-release">
      <a href="/press-release/mta-opens-elevators" title="MTA Opens Elevators &amp; Ramps"><time datetime="2026-10-01T14:00:00Z"></time></a>
      <a href="/press-release/no-date" title="Missing date"></a>
    </div>`);
  assert.deepEqual(listing, [
    { publishedAt: "2026-10-01T14:00:00.000Z", title: "MTA Opens Elevators & Ramps", url: "https://www.mta.info/press-release/mta-opens-elevators" },
  ]);

  assert.match(
    extractArticleLead("<p>Short</p><p>The Metropolitan Transportation Authority today announced the completion of two new elevators.</p>"),
    /^The Metropolitan/,
  );

  const news = parseGoogleNewsRss(`<rss><channel><item>
    <title>Kings Highway station now accessible - amNY</title>
    <link>https://news.google.com/rss/articles/xyz</link>
    <pubDate>Wed, 14 Aug 2026 15:00:00 GMT</pubDate>
    <source url="https://www.amny.com">amNY</source>
  </item></channel></rss>`);
  assert.equal(news[0].title, "Kings Highway station now accessible");
  assert.equal(news[0].sourceName, "amNY");
  assert.equal(news[0].sourceUrl, "https://www.amny.com");

  const reddit = parseRedditListing({
    data: {
      children: [
        {
          data: {
            author: "a",
            created_utc: 1_790_000_000,
            is_self: false,
            permalink: "/r/Subways/comments/x/y/",
            post_hint: "image",
            subreddit: "Subways",
            title: "New elevator open at Junius St",
            url: "https://i.redd.it/x.jpg",
          },
        },
      ],
    },
  });
  assert.equal(reddit[0].media, true);
  assert.equal(reddit[0].url, "https://www.reddit.com/r/Subways/comments/x/y/");

  const atom = parseRedditAtom(`<feed><entry><title>Steinway St accessible</title>
    <link href="https://www.reddit.com/r/nyc/comments/z/"/><updated>2026-11-01T00:00:00+00:00</updated>
    <author><name>/u/b</name></author><category term="nyc"/>
    <content type="html">&lt;a href="https://www.mta.info/press-release/x"&gt;link&lt;/a&gt;</content></entry></feed>`);
  assert.deepEqual(atom[0].linkedUrls, ["https://www.mta.info/press-release/x"]);
  assert.equal(atom[0].subreddit, "nyc");
});

test("ignores national-outlet stories that aren't about New York", () => {
  const data = baseData();
  const item = (title) => ({
    kind: "news",
    publishedAt: recent(5),
    sourceName: "Mass Transit",
    sourceUrl: "https://www.masstransitmag.com",
    title,
    url: `https://news.google.com/rss/articles/${encodeURIComponent(title)}`,
  });
  const { changes, file } = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: null,
    rawItems: [item("Junius St station is now fully accessible"), item("MTA: Steinway St M/R station is now fully accessible")],
    review: {},
    sources: [],
  });
  assert.deepEqual(changes.map((change) => change.key.split("|")[0]), ["Steinway St"]);
  assert.equal(file.feed.find((entry) => entry.title.startsWith("Junius")).tier, "unverified");
});

test("keeps Reddit working when one subreddit fails and filters out other cities", async () => {
  const listing = (title) => ({
    data: { children: [{ data: { created_utc: Date.now() / 1000, is_self: true, permalink: `/r/x/comments/${title.length}/`, selftext: "", subreddit: "x", title } }] },
  });
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes("/r/nycrail/")) return new Response("gone", { status: 404 });
    if (target.includes("/r/Subways/")) return Response.json(listing("Toronto Main St station elevators open"));
    return Response.json(listing("Junius St elevators are open"));
  };
  const result = await fetchReddit({ env: {}, fetchImpl, redditDelayMs: 0, subreddits: ["nyc", "nycrail", "Subways"] });
  assert.deepEqual(result.items.map((item) => item.title), ["Junius St elevators are open"]);
});

test("handles MTA headlines when the article page can't be read", () => {
  const data = baseData();
  const mta = (title) => ({
    kind: "mta",
    lead: "",
    publishedAt: recent(20),
    sourceName: "MTA",
    title,
    url: `https://www.mta.info/press-release/${encodeURIComponent(title)}`,
  });
  const { changes, file } = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: null,
    rawItems: [
      mta("MTA Adds 137 St-City College 1 to Growing List of Accessible Subway Stations"),
      mta("MTA Announces Accessibility Upgrades at Steinway St M/R Subway Station"),
      mta("ICYMI: Governor Hochul Announces Groundbreaking of Bryant Park Accessibility Project"),
    ],
    review: {},
    sources: [],
  });
  // Clear headline: applied. Neutral headline: held for review. Groundbreaking: ignored.
  assert.deepEqual(changes.map((change) => change.key.split("|")[0]), ["137 St-City College"]);
  const steinway = file.feed.find((item) => item.title.includes("Steinway"));
  assert.equal(steinway.status, "needs-review");
  assert.equal(file.openings.some((opening) => opening.station === "Steinway St"), false);
  assert.equal(file.feed.find((item) => item.title.includes("Bryant Park")).opening, false);
});

// Paraphrased stand-ins for the opening paragraphs of real July–August 2026
// coverage whose headlines don't name the station (or the line).
const withoutGlimpse = (entry) => {
  const item = { ...entry };
  delete item.glimpse;
  return item;
};

const GLIMPSE_CASES = [
  {
    glimpse: "MTA leaders said the Borough Hall station on the 2/3/4/5 lines has been made fully accessible with three new elevators on Joralemon St.",
    sourceName: "BKReader",
    sourceUrl: "https://www.bkreader.com",
    title: "118-Year-Old Brooklyn Subway Station Gets an ADA Makeover",
  },
  {
    // The lines come late in the article, as in the live 6sqft story.
    glimpse: `The MTA finished a renovation of Downtown Brooklyn's Borough Hall station, adding elevators to every platform. ${"Crews also rebuilt platform edges and installed new lighting throughout the station. ".repeat(12)}The station serves the 2, 3, 4, and 5 trains.`,
    sourceName: "6sqft",
    sourceUrl: "https://www.6sqft.com",
    title: "Brooklyn’s oldest underground subway station is now accessible",
  },
  {
    glimpse: "New York's MTA has finished a $72 million project making the Kings Highway F Line subway station in southern Brooklyn fully accessible.",
    sourceName: "Progressive Railroading",
    sourceUrl: "https://www.progressiverailroading.com",
    title: "Rail News - New York MTA completes Kings Highway station accessibility upgrades",
  },
  {
    glimpse: null,
    sourceName: "Example Weekly",
    sourceUrl: "https://example.org",
    title: "Historic Queens subway station is now fully accessible",
  },
].map((entry, position) => ({
  ...entry,
  kind: "news",
  publishedAt: recent(30 + position),
  url: `https://news.google.com/rss/articles/glimpse-${position}`,
}));

test("reads the article to name the station when the headline doesn't", async () => {
  const data = baseData();
  const rawItems = GLIMPSE_CASES.map(withoutGlimpse);
  const fetched = [];
  const fetchGlimpse = async (item) => {
    fetched.push(item.title);
    const entry = GLIMPSE_CASES.find((candidate) => candidate.title === item.title);
    return entry.glimpse
      ? { articleUrl: `${entry.sourceUrl}/article`, text: entry.glimpse, via: "wordpress" }
      : null;
  };

  // The same story from a second search query is read only once.
  rawItems.push({ ...rawItems[0] });
  await enrichWithGlimpses({ accessibilityData: data, fetchGlimpse, previous: null, rawItems });
  assert.equal(fetched.length, 4);
  assert.equal(rawItems.at(-1).glimpse, "found");

  const { changes, file } = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: null,
    rawItems,
    review: {},
    sources: [],
  });
  const byTitle = (prefix) => file.feed.find((item) => item.title.startsWith(prefix));

  // Both Borough Hall stories resolve to the already-accessible 2/3/4/5,
  // never the R, and leave the review queue.
  for (const prefix of ["118-Year-Old", "Brooklyn’s oldest"]) {
    const item = byTitle(prefix);
    assert.equal(item.status, "already-accessible");
    assert.equal(item.stationsFromArticle, true);
    assert.deepEqual(
      item.stations.map((station) => station.services.join("/")).sort(),
      ["2/3", "4/5"],
    );
    assert.match(item.url, /\/article$/);
  }
  assert.equal(row(data, "Borough Hall/Court St", "R").accessibilityStatus, "Not accessible");

  // The line comes from the article: Kings Hwy F, not the N.
  assert.deepEqual(changes.map((change) => change.key), ["Kings Hwy|Culver Line|F"]);
  assert.equal(byTitle("Rail News").stationsFromArticle, true);

  // No machine-readable copy: stays in review, marked as tried.
  const unknown = byTitle("Historic Queens");
  assert.equal(unknown.status, "needs-review");
  assert.equal(unknown.glimpse, "unavailable");

  // Next run: found articles aren't re-read and keep their result; the
  // unavailable one waits a week before trying again.
  const nextRaw = GLIMPSE_CASES.map(withoutGlimpse);
  fetched.length = 0;
  await enrichWithGlimpses({ accessibilityData: data, fetchGlimpse, previous: file, rawItems: nextRaw });
  assert.deepEqual(fetched, []);
  const second = buildNewsFile({ accessibilityData: data, now: new Date(), previous: file, rawItems: nextRaw, review: {}, sources: [] });
  // Borough Hall was accessible before the tracker saw it: no opening is invented.
  assert.equal(second.file.openings.some((opening) => opening.station === "Borough Hall/Court St"), false);
  assert.equal(second.file.feed.find((item) => item.title.startsWith("118-Year-Old")).status, "already-accessible");
  assert.equal(second.changes.length, 0);
});

test("finds an article through the publisher's WordPress API or RSS feed only", async () => {
  assert.equal(headlineSimilarity("Brooklyn’s oldest underground subway station is now accessible", "Brooklyns oldest underground subway station is now accessible"), 1);
  assert.ok(headlineSimilarity("Kings Highway reopens", "Bronx bus route changes") < 0.5);

  assert.deepEqual(
    parseWordPressPosts([{ content: { rendered: "<p>Borough Hall now has elevators.</p>" }, link: "https://site/a", title: { rendered: "Old station gets elevators" } }]),
    [{ text: "Borough Hall now has elevators.", title: "Old station gets elevators", url: "https://site/a" }],
  );
  assert.equal(
    parseRssItems("<rss><item><title>Old station gets elevators</title><link>https://site/b</link><description><![CDATA[<p>Borough Hall</p>]]></description></item></rss>")[0].text,
    "Borough Hall",
  );

  const requested = [];
  const wordpress = async (url) => {
    requested.push(String(url));
    return Response.json([{ content: { rendered: "<p>Borough Hall on the 2/3/4/5 is accessible.</p>" }, link: "https://www.6sqft.com/oldest", title: { rendered: "Brooklyn&#8217;s oldest underground subway station is now accessible" } }]);
  };
  const viaWp = await fetchArticleGlimpse({ sourceUrl: "https://www.6sqft.com", title: "Brooklyn’s oldest underground subway station is now accessible" }, { fetchImpl: wordpress });
  assert.equal(viaWp.via, "wordpress");
  assert.equal(viaWp.articleUrl, "https://www.6sqft.com/oldest");
  assert.match(requested[0], /^https:\/\/www\.6sqft\.com\/wp-json\/wp\/v2\/posts\?/);

  const rssOnly = async (url) =>
    String(url).includes("/wp-json/")
      ? new Response("not found", { status: 404 })
      : new Response("<rss><item><title>118-Year-Old Brooklyn Subway Station Gets an ADA Makeover</title><link>https://www.bkreader.com/a</link><description>Borough Hall</description></item></rss>");
  const viaRss = await fetchArticleGlimpse({ sourceUrl: "https://www.bkreader.com", title: "118-Year-Old Brooklyn Subway Station Gets an ADA Makeover" }, { fetchImpl: rssOnly });
  assert.equal(viaRss.via, "rss");

  const nothing = async () => new Response("forbidden", { status: 403 });
  const blocked = await fetchArticleGlimpse({ sourceUrl: "https://example.org", title: "Anything" }, { fetchImpl: nothing });
  assert.equal(blocked.text, undefined);
  assert.equal(blocked.failures.length, 3);

  assert.equal(searchTerms("Brooklyn’s oldest underground subway station is now accessible"), "brooklyn oldest underground subway station accessible");
  assert.equal(searchTerms("Rail News - New York MTA completes Kings Highway station accessibility upgrades. For Railroad Career Professionals"), "new york mta completes kings highway");
});

test("adds later coverage of an opening as another source", () => {
  const data = baseData();
  const first = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: null,
    rawItems: [
      {
        kind: "mta",
        lead: "",
        publishedAt: recent(60),
        sourceName: "MTA",
        title: "MTA Adds Kings Highway F to Growing List of Accessible Subway Stations",
        url: "https://www.mta.info/press-release/mta-adds-kings-highway-f",
      },
    ],
    review: {},
    sources: [],
  });
  assert.equal(first.changes.length, 1);

  const later = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: first.file,
    rawItems: [
      {
        articleUrl: "https://www.progressiverailroading.com/kings",
        glimpse: "found",
        kind: "news",
        lead: "The MTA finished making the Kings Highway F Line subway station fully accessible.",
        publishedAt: recent(55),
        sourceName: "Progressive Railroading",
        sourceUrl: "https://www.progressiverailroading.com",
        title: "Rail News - New York MTA completes Kings Highway station accessibility upgrades",
        url: "https://news.google.com/rss/articles/kings",
      },
    ],
    review: {},
    sources: [],
  });
  const kings = later.file.openings.find((opening) => opening.station === "Kings Hwy");
  assert.equal(kings.evidence.length, 2);
  assert.equal(kings.verification, "official");
  assert.equal(later.changes.length, 0);
});
