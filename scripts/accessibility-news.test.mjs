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
import { capitalItems, stationsFromDescription } from "./accessibility-news/capital.mjs";
import { equipmentItems, platformCoverage } from "./accessibility-news/equipment.mjs";
import {
  fetchConstructionNewsletter,
  newsletterItems,
  parseNewsletterArchive,
  parseNewsletterSections,
} from "./accessibility-news/newsletter.mjs";
import {
  applyOpenings,
  buildNewsFile,
  enrichWithGlimpses,
  itemId,
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
  // English words made of route letters aren't bullets.
  const andCase = resolveStations({ text: "Kings Hwy and Steinway St get elevators" }, index);
  assert.equal(pick(andCase).some((name) => name.startsWith("Kings Hwy")), false);
  assert.deepEqual(pick(andCase), ["Steinway St M/R"]);
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

  // Same story, no line in the headline and no article available: matched to
  // the F because it ran days after the F opened.
  const titleOnly = buildNewsFile({
    accessibilityData: data,
    now: new Date(),
    previous: later.file,
    rawItems: [
      {
        kind: "news",
        publishedAt: recent(55),
        sourceName: "Railway Age",
        sourceUrl: "https://www.railwayage.com",
        title: "New York MTA completes Kings Highway station accessibility upgrades",
        url: "https://news.google.com/rss/articles/kings-title-only",
      },
    ],
    review: {},
    sources: [],
  });
  assert.equal(titleOnly.file.feed.find((item) => item.id === itemId("https://news.google.com/rss/articles/kings-title-only")).status, "already-accessible");
  assert.equal(titleOnly.file.openings.find((opening) => opening.station === "Kings Hwy").evidence.length, 3);
  assert.equal(row(data, "Kings Hwy", "N").accessibilityStatus, "Not accessible");
  assert.equal(kings.verification, "official");
  assert.equal(later.changes.length, 0);
});

test("a headline naming a station is matched to the line that just opened there", () => {
  const data = baseData();
  const index = buildStationIndex(data.stations);
  const headline = "Exclusive: Brooklyn’s Borough Hall subway station is now fully ADA accessible";

  // Ran the day the 4/5 side opened (July 22, 2026): it's about the 4/5.
  const onTime = resolveStations({ publishedAt: "2026-07-22T16:00:00Z", text: headline }, index);
  assert.equal(onTime.reason, "already-accessible");
  assert.deepEqual(onTime.alreadyAccessibleRows.map((i) => data.stations[i].services.join("/")), ["4/5"]);
  assert.deepEqual(onTime.rows, []);

  // No line opened around that date: still not guessed, and never the R.
  const offDate = resolveStations({ publishedAt: "2026-03-01T16:00:00Z", text: headline }, index);
  assert.equal(offDate.reason, "ambiguous");
  assert.deepEqual(offDate.rows, []);

  const { file } = buildNewsFile({
    accessibilityData: data,
    now: new Date("2026-11-18T00:00:00Z"),
    previous: null,
    rawItems: [
      {
        kind: "news",
        publishedAt: "2026-07-22T16:00:00Z",
        sourceName: "Brooklyn Eagle",
        sourceUrl: "https://brooklyneagle.com",
        title: headline,
        url: "https://news.google.com/rss/articles/eagle",
      },
    ],
    review: {},
    sources: [],
  });
  const item = file.feed[0];
  assert.equal(item.status, "already-accessible");
  assert.deepEqual(item.stations.map((station) => station.services.join("/")), ["4/5"]);
  assert.equal(item.stationsFromArticle, false);
  assert.equal(row(data, "Borough Hall/Court St", "R").accessibilityStatus, "Not accessible");
});

const asset = (code, stationCode, description, overrides = {}) => ({
  ada_compliant: "YES",
  elevator_direction_serviced: "Both",
  elevator_or_escalator: "Elevator",
  elevator_platform_access: "+",
  equipment_code: code,
  latest_installation_date: "2026-08-14T00:00:00.000",
  notes: "",
  service_status_code: "IFIS",
  station_description: `${description} - Station`,
  station_name: stationCode,
  ...overrides,
});

test("MTA equipment data opens stations before the press release", () => {
  const data = baseData();
  const now = Date.parse("2026-11-18T12:00:00Z");
  const assets = [
    // Kings Hwy F: street→mezzanine, then mezzanine→each platform (Aug 14).
    asset("EL795", "KINGSHWY-6AV-F", "Kings Hwy", { elevator_platform_access: "-" }),
    asset("EL796", "KINGSHWY-6AV-F", "Kings Hwy", { elevator_direction_serviced: "Northbound" }),
    asset("EL797", "KINGSHWY-6AV-F", "Kings Hwy", { elevator_direction_serviced: "Southbound" }),
    // 137 St: uptown elevator from May, downtown one completes it on Oct 8.
    asset("EL519", "137ST-CITYCOLLEGE-BWY7-1", "137 St-City College", { elevator_direction_serviced: "Northbound", latest_installation_date: "2026-05-01T00:00:00.000" }),
    asset("EL520", "137ST-CITYCOLLEGE-BWY7-1", "137 St-City College", { elevator_direction_serviced: "Southbound", latest_installation_date: "2026-10-08T00:00:00.000" }),
    // Junius St: only one direction so far → partially accessible.
    asset("EL900", "JUNIUSST-NLV-3", "Junius St", { elevator_direction_serviced: "Northbound", latest_installation_date: "2026-11-01T00:00:00.000" }),
    // Replacement at an already-accessible station, and a new escalator.
    asset("EL239", "72ST-BWY7-1/2/3", "72 St", { latest_installation_date: "2026-09-29T00:00:00.000" }),
    asset("ES313", "SMITH-9STS-6AV-F/G", "Smith-9 Sts", { ada_compliant: null, elevator_or_escalator: "Escalator", latest_installation_date: "2026-11-16T00:00:00.000" }),
    // Not in service yet, and placeholder dates, are ignored.
    asset("EL901", "STEINWAYST-QBL-M/R", "Steinway St", { latest_installation_date: "2026-11-10T00:00:00.000", service_status_code: "INOS" }),
    asset("EL902", "WOODHAVENBLVD-QBL-M/R", "Woodhaven Blvd", { latest_installation_date: "1900-01-02T00:00:00.000" }),
  ];

  const items = equipmentItems(assets, data, { now });
  const { changes, file } = buildNewsFile({ accessibilityData: data, now: new Date(now), previous: null, rawItems: items, review: {}, sources: [] });

  assert.deepEqual(
    Object.fromEntries(changes.map((change) => [change.key.split("|")[0], `${change.after} ${change.date}`])),
    {
      "137 St-City College": "Accessible October 8, 2026",
      "Junius St": "Partially accessible November 1, 2026",
      "Kings Hwy": "Accessible August 14, 2026",
    },
  );
  assert.equal(row(data, "Kings Hwy", "N").accessibilityStatus, "Not accessible");
  assert.equal(row(data, "Steinway St", "M/R").accessibilityStatus, "Not accessible");
  assert.equal(row(data, "Woodhaven Blvd", "M/R").accessibilityStatus, "Not accessible");
  assert.equal(data.sourceOverrides.find((entry) => entry.station === "Kings Hwy").source, "MTA elevator & escalator data");

  const title = (prefix) => file.feed.find((item) => item.title.startsWith(prefix));
  assert.equal(title("3 elevators entered service at Kings Hwy (F)").status, "verified");
  assert.equal(title("1 elevator entered service at 72 St").status, "already-accessible");
  assert.equal(title("1 escalator entered service").status, "news");
  assert.equal(file.feed.some((item) => item.title.includes("Steinway") || item.title.includes("Woodhaven")), false);
  assert.equal(file.openings.find((opening) => opening.station === "Kings Hwy").verification, "official");
});

test("an earlier in-service date moves an opening the tracker already applied", () => {
  const data = baseData();
  const release = {
    kind: "mta",
    lead: "",
    publishedAt: "2026-08-19T18:00:00Z",
    sourceName: "MTA",
    title: "MTA Adds Kings Highway F to Growing List of Accessible Subway Stations",
    url: "https://www.mta.info/press-release/mta-adds-kings-highway-f",
  };
  const now = new Date("2026-11-18T12:00:00Z");
  const first = buildNewsFile({ accessibilityData: data, now, previous: null, rawItems: [release], review: {}, sources: [] });
  assert.equal(row(data, "Kings Hwy", "F").dateMadeAccessible, "August 19, 2026");

  const assets = ["EL795", "EL796", "EL797"].map((code, position) =>
    asset(code, "KINGSHWY-6AV-F", "Kings Hwy", {
      elevator_direction_serviced: ["Both", "Northbound", "Southbound"][position],
      elevator_platform_access: position === 0 ? "-" : "+",
    }),
  );
  const second = buildNewsFile({
    accessibilityData: data,
    now,
    previous: first.file,
    rawItems: [release, ...equipmentItems(assets, data, { now: now.getTime() })],
    review: {},
    sources: [],
  });
  assert.equal(row(data, "Kings Hwy", "F").dateMadeAccessible, "August 14, 2026");
  const kings = second.file.openings.find((opening) => opening.station === "Kings Hwy");
  assert.equal(kings.primarySource.kind, "mta");
  assert.deepEqual(kings.evidence.map((evidence) => evidence.kind).sort(), ["equipment", "mta"]);
});

test("reads platform coverage from elevator directions", () => {
  const e = (direction, platform = "+", status = "IFIS") => ({
    ada_compliant: "YES",
    elevator_direction_serviced: direction,
    elevator_platform_access: platform,
    service_status_code: status,
  });
  assert.equal(platformCoverage([e("Both")]), "both");
  assert.equal(platformCoverage([e("Northbound"), e("Southbound")]), "both");
  assert.equal(platformCoverage([e("Northbound"), e("Southbound", "+", "RNOS")]), "one");
  assert.equal(platformCoverage([e("Both", "-")]), "none");
});

const ARCHIVE_HTML = `<html><body><table><tr><td><img src="logo.png"></td></tr></table>
<h2>This Week in MTA Construction newsletter archive</h2>
<ul>
<li>11/17/2026 &ndash; <a href="https://view.info.mta.org/?qs=slam">This Week in MTA Construction: Slam Dunk</a></li>
<li>11/10/2026 &ndash; <a href="https://view.info.mta.org/?qs=dig">This Week in MTA Construction: Dig Deep</a></li>
<li>06/16/2026 &ndash; <a href="https://view.info.mta.org/?vawpToken=OLD.1">This Week in MTA Construction: Overdue Victories</a></li>
<li><a href="https://cloud.info.mta.org/construction-development-updates">Sign up</a></li>
</ul></body></html>`;

// Email-style issue: real headings for some sections, bold table cells for others.
const ISSUE_HTML = `<html><head><style>p{}</style></head><body>
<table><tr><td><a href="#">View as webpage</a></td></tr>
<tr><td><h1>This Week in MTA Construction: Slam Dunk</h1></td></tr>
<tr><td><p>Welcome back! Here is what our crews delivered this week across the system and what is coming next.</p></td></tr>
<tr><td><h2>Woodhaven Blvd is now fully accessible</h2></td></tr>
<tr><td><p>Riders at Woodhaven Blvd on the M and R lines can now use three new elevators from the street to the mezzanine and to both platforms, completing the station's accessibility upgrade.</p></td></tr>
<tr><td><strong>Escalator work wraps at Lexington Av-63 St</strong></td></tr>
<tr><td><p>We returned the last of ten replaced escalators to service at Lexington Av-63 St on the F and Q, finishing a multi-year replacement program at one of the deepest stations in the system.</p></td></tr>
<tr><td><h2>Second Avenue Subway tunneling</h2></td></tr>
<tr><td><p>The tunnel boring machine advanced another 400 feet under Second Avenue this week as crews continued mining toward 116 Street.</p></td></tr>
<tr><td><p>You are receiving this email because you subscribed. Unsubscribe</p></td></tr>
</table></body></html>`;

test("reads the This Week in MTA Construction archive and issue sections", () => {
  const archive = parseNewsletterArchive(ARCHIVE_HTML);
  assert.deepEqual(
    archive.map((issue) => `${issue.date} ${issue.title}`),
    [
      "2026-11-17 This Week in MTA Construction: Slam Dunk",
      "2026-11-10 This Week in MTA Construction: Dig Deep",
      "2026-06-16 This Week in MTA Construction: Overdue Victories",
    ],
  );

  const sections = parseNewsletterSections(ISSUE_HTML);
  const headings = sections.map((section) => section.heading);
  assert.ok(headings.includes("Woodhaven Blvd is now fully accessible"));
  assert.ok(headings.includes("Escalator work wraps at Lexington Av-63 St"));
  assert.ok(headings.includes("Second Avenue Subway tunneling"));
  assert.equal(sections.some((section) => /unsubscribe|view as webpage/i.test(`${section.heading} ${section.text}`)), false);

  const items = newsletterItems(archive[0], sections);
  // Only the accessibility/elevator/escalator sections become items.
  assert.deepEqual(items.map((item) => item.title), [
    "Woodhaven Blvd is now fully accessible",
    "Escalator work wraps at Lexington Av-63 St",
  ]);
  assert.equal(items[0].sourceName, "This Week in MTA Construction, Slam Dunk");
  assert.equal(items[0].publishedAt.slice(0, 10), "2026-11-17");
});

test("a newsletter section reporting an opening counts as an official MTA source", () => {
  const data = baseData();
  const [issue] = parseNewsletterArchive(ARCHIVE_HTML);
  const items = newsletterItems(issue, parseNewsletterSections(ISSUE_HTML));
  const { changes, file } = buildNewsFile({
    accessibilityData: data,
    now: new Date("2026-11-18T12:00:00Z"),
    previous: null,
    rawItems: items,
    review: {},
    sources: [],
  });
  assert.deepEqual(changes.map((change) => change.key), ["Woodhaven Blvd|Queens Blvd Line|M/R"]);
  const woodhaven = file.openings.find((opening) => opening.station === "Woodhaven Blvd");
  assert.equal(woodhaven.verification, "official");
  assert.equal(woodhaven.evidence[0].kind, "newsletter");
  assert.equal(file.feed.find((item) => item.title.startsWith("Escalator work")).status, "news");
});

test("only new newsletter issues are fetched, and failed ones are retried", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes("construction-development-updates-archive")) return new Response(ARCHIVE_HTML);
    if (String(url).includes("qs=dig")) return new Response("down", { status: 503 });
    return new Response(ISSUE_HTML);
  };
  const result = await fetchConstructionNewsletter({
    fetchImpl,
    known: [{ date: "2026-06-16", title: "Overdue Victories", url: "https://view.info.mta.org/?vawpToken=OLD.1" }],
    lookbackDays: 200,
    now: Date.parse("2026-11-18T12:00:00Z"),
  });
  // Old issue already read; Slam Dunk read; Dig Deep failed and isn't cached.
  assert.equal(requested.some((url) => url.includes("OLD.1")), false);
  assert.deepEqual(result.issues.map((issue) => issue.url).sort(), [
    "https://view.info.mta.org/?qs=slam",
    "https://view.info.mta.org/?vawpToken=OLD.1",
  ]);
  assert.equal(result.items.length, 2);
  assert.ok(result.log.some((entry) => entry.error));
});

test("tracks capital dashboard milestones, phase changes and completion dates", () => {
  const data = baseData();
  const project = {
    description:
      "This project will replace 17 elevators at 8 stations, including Pacific Street (3 elevators) and DeKalb Avenue (3 elevators) on the 4 Avenue Line, Church Avenue (1 elevator) on the Nostrand Line, and Stillwell Avenue (2 elevators) at the Coney Island Terminal.",
    estimatedCompletionDate: "2026-12-31",
    externalId: "12345",
    key: "modern:12345",
    phase: "Complete",
    phases: [
      {
        milestones: [
          { date: "2026-09-01", description: "", title: "Construction complete" },
          { date: "2024-01-01", description: "Contract awarded", title: "Contract Award" },
        ],
        name: "Construction",
      },
    ],
    title: "Replace 17 Elevators At 8 Stations",
  };
  const capital = { projects: [project] };
  const now = Date.parse("2026-11-18T12:00:00Z");

  assert.deepEqual(stationsFromDescription(project.description, data).sort(), [
    "Church Av|Nostrand Av Line|2/5",
    "DeKalb Av|4 Av Line, Brighton Line|B/Q/R",
  ]);

  const first = capitalItems(capital, { accessibilityData: data, adaStatuses: { stations: [] }, now });
  assert.deepEqual(first.items.map((item) => item.title), ["Replace 17 Elevators At 8 Stations: Construction complete"]);
  assert.equal(first.items[0].url.startsWith("https://capitaldashboard.mta.info/?projectId=12345"), true);

  // Next run: the phase and estimated completion changed.
  const previousSnapshot = { "modern:12345": { estimatedCompletionDate: "2026-09-30", phase: "Construction", title: project.title } };
  const second = capitalItems(capital, { accessibilityData: data, adaStatuses: { stations: [] }, now, previousSnapshot });
  assert.deepEqual(second.items.slice(1).map((item) => item.title), [
    "Replace 17 Elevators At 8 Stations: now complete",
    "Replace 17 Elevators At 8 Stations: completion pushed back to Dec 31, 2026",
  ]);

  const { file } = buildNewsFile({
    accessibilityData: data,
    extras: { capitalSnapshot: second.snapshot },
    now: new Date(now),
    previous: null,
    rawItems: second.items,
    review: {},
    sources: [],
  });
  assert.equal(file.feed.length, 3);
  assert.ok(file.feed.every((item) => item.tier === "official" && item.status === "news"));
  assert.deepEqual(
    [...new Set(file.feed[0].stations.map((station) => station.station))].sort(),
    ["Church Av", "DeKalb Av"],
  );
  assert.equal(file.capitalSnapshot["modern:12345"].phase, "Complete");
});

test("a capital milestone worded like an opening never changes a station by itself", () => {
  const data = baseData();
  const now = Date.parse("2026-11-18T12:00:00Z");
  const project = {
    description: "",
    estimatedCompletionDate: "2026-12-31",
    externalId: "999",
    key: "modern:999",
    phase: "Construction",
    phases: [{ milestones: [{ date: "2026-10-01", description: "Junius St station is now fully accessible.", title: "Progress Update" }], name: "Construction" }],
    title: "NYCT ADA Station Improvements: Junius St",
  };
  const { items } = capitalItems({ projects: [project] }, { accessibilityData: data, adaStatuses: { stations: [] }, now });
  const { changes, file } = buildNewsFile({ accessibilityData: data, now: new Date(now), previous: null, rawItems: items, review: {}, sources: [] });
  assert.equal(changes.length, 0);
  assert.equal(file.openings.length, 0);
  assert.equal(file.feed[0].status, "news");
  assert.deepEqual(file.feed[0].stations.map((station) => station.station), ["Junius St"]);
});

test("newsletter paragraphs wrapped in the HTML source stay whole", () => {
  // Like the real issues: source lines wrap mid-sentence, sections use
  // short bold "Station ADA" headings, and there's a recurring bonus section.
  const html = `<table><tr><td><strong>Kings Hwy ADA</strong></td></tr>
<tr><td><p>The upgrades here are big. Kings Hwy is now home to three new
elevators, and the F station is now fully
accessible for riders heading to Manhattan and Coney Island alike, with new
signage and tactile edges too.</p></td></tr>
<tr><td><strong>Bonus round</strong></td></tr>
<tr><td><p>Bonus: we also replaced an elevator machine room at a station in the Bronx this week, adding
a new controller and cab interior for riders.</p></td></tr></table>`;
  const sections = parseNewsletterSections(html);
  assert.deepEqual(sections.map((section) => section.heading), ["Kings Hwy ADA", "Bonus round"]);
  assert.match(sections[0].text, /three new elevators, and the F station is now fully accessible/);

  const items = newsletterItems({ date: "2026-08-25", title: "This Week in MTA Construction: Dark, Damp, and Essential", url: "https://view.info.mta.org/?qs=dark" }, sections);
  assert.deepEqual(items.map((item) => item.title), ["Kings Hwy ADA"]);

  const data = baseData();
  const { changes } = buildNewsFile({ accessibilityData: data, now: new Date("2026-11-18T12:00:00Z"), previous: null, rawItems: items, review: {}, sources: [] });
  assert.deepEqual(changes.map((change) => change.key), ["Kings Hwy|Culver Line|F"]);
});

test("a newsletter section about a station that just opened is added as a source", () => {
  const data = baseData();
  const now = new Date("2026-11-18T12:00:00Z");
  const release = {
    kind: "mta",
    lead: "",
    publishedAt: "2026-08-19T18:00:00Z",
    sourceName: "MTA",
    title: "MTA Adds Kings Highway F to Growing List of Accessible Subway Stations",
    url: "https://www.mta.info/press-release/mta-adds-kings-highway-f",
  };
  const first = buildNewsFile({ accessibilityData: data, now, previous: null, rawItems: [release], review: {}, sources: [] });

  // Written the newsletter's way: no "now accessible" wording, no line given.
  const section = {
    kind: "newsletter",
    lead: "The upgrades here are big. Kings Hwy is now home to three new elevators that riders have been using since August, plus rebuilt stairs and platform edges.",
    publishedAt: "2026-08-25T15:00:00.000Z",
    sourceName: "This Week in MTA Construction, Dark, Damp, and Essential",
    sourceUrl: "https://view.info.mta.org/?qs=dark",
    title: "Kings Hwy ADA",
    url: "https://view.info.mta.org/?qs=dark#section-2",
  };
  const progress = {
    ...section,
    lead: "Crews are framing the new elevator shafts at Steinway St, where work continues on the Queens-bound side.",
    publishedAt: "2026-11-10T15:00:00.000Z",
    title: "Steinway St ADA",
    url: "https://view.info.mta.org/?qs=dig#section-3",
  };
  const second = buildNewsFile({ accessibilityData: data, now, previous: first.file, rawItems: [release, section, progress], review: {}, sources: [] });

  const kings = second.file.openings.find((opening) => opening.station === "Kings Hwy");
  assert.deepEqual(kings.evidence.map((evidence) => evidence.kind).sort(), ["mta", "newsletter"]);
  assert.equal(second.changes.length, 0);
  // A section naming both a just-opened station and one under construction
  // still counts for the opened one.
  const mixed = buildNewsFile({
    accessibilityData: data,
    now,
    previous: second.file,
    rawItems: [
      {
        ...section,
        lead: "Riders at Kings Hwy have three new elevators, and next up is Steinway St, where crews are framing elevator shafts.",
        title: "Kings Hwy and Steinway St ADA",
        url: "https://view.info.mta.org/?qs=dark#section-4",
      },
    ],
    review: {},
    sources: [],
  });
  assert.equal(mixed.file.openings.find((opening) => opening.station === "Kings Hwy").evidence.length, 3);
  assert.equal(mixed.changes.length, 0);

  // A progress update names its station but changes nothing.
  const steinway = second.file.feed.find((item) => item.title === "Steinway St ADA");
  assert.equal(steinway.status, "news");
  assert.deepEqual(steinway.stations.map((station) => station.station), ["Steinway St"]);
  assert.equal(row(data, "Steinway St", "M/R").accessibilityStatus, "Not accessible");
  assert.equal(second.file.openings.some((opening) => opening.station === "Steinway St"), false);
});
