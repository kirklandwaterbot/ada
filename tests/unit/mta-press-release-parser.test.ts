import { describe, expect, it } from "vitest";
import {
  isMtaAccessibilityRelease,
  parsePressReleaseMarkup,
} from "@/lib/mta-press-release-parser";

describe("MTA press release parsing", () => {
  it("extracts the article date, title, URL, and approved MTA image", () => {
    const [release] = parsePressReleaseMarkup(`
      <div class="view-index-press-release">
        <a href="/press-release/accessible-station" title="Elevators &amp; ADA Upgrades at Subway Station">
          <time datetime="2026-08-28T12:00:00-04:00">Aug 28</time>
          <img src="https://files.mta.info/s3fs-public/2026-08/elevator.jpg" />
        </a>
      </div>
    `);

    expect(release).toEqual({
      imageUrl: "https://files.mta.info/s3fs-public/2026-08/elevator.jpg",
      publishedAt: "2026-08-28T12:00:00-04:00",
      title: "Elevators & ADA Upgrades at Subway Station",
      url: "https://www.mta.info/press-release/accessible-station",
    });
  });

  it("drops untrusted preview image origins", () => {
    const [release] = parsePressReleaseMarkup(`
      <a href="/press-release/accessible-station" title="ADA Subway Station">
        <time datetime="2026-08-28T12:00:00-04:00">Aug 28</time>
        <img src="https://example.com/not-mta.jpg" />
      </a>
    `);

    expect(release.imageUrl).toBeNull();
  });

  it("keeps MTA accessibility releases relevant to the subway system", () => {
    expect(
      isMtaAccessibilityRelease("LIRR opens accessible elevators at station"),
    ).toBe(false);
    expect(
      isMtaAccessibilityRelease("MTA unveils accessibility upgrades at 149 St–Hostos Station"),
    ).toBe(true);
    expect(
      isMtaAccessibilityRelease("MTA opens new Access-A-Ride assessment center"),
    ).toBe(true);
    expect(
      isMtaAccessibilityRelease("MTA installs wide-aisle fare gates at subway stations"),
    ).toBe(true);
    expect(isMtaAccessibilityRelease("MTA announces weekend service changes")).toBe(
      false,
    );
  });
});
