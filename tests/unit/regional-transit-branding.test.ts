import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRegionalTransitBranding,
  type RegionalTransitAgency,
} from "@/lib/regional-transit-branding";

describe("regional transit popup branding", () => {
  it("uses the actual Long Island City services without an agency logo", () => {
    const branding = getRegionalTransitBranding("LIRR", "CI", "3,5,10");

    expect(branding).not.toHaveProperty("agency");
    expect(branding.lines.map((line) => line.imagePath)).toEqual([
      "/LIRROysterBay.png",
      "/LIRRMontauk.png",
      "/LIRRPortJefferson.png",
    ]);
  });

  it("does not render City Terminal Zone as a line badge", () => {
    const branding = getRegionalTransitBranding("LIRR", "CI", "3,5,10,12");

    expect(branding.lines.map((line) => line.label)).not.toContain(
      "City Terminal Zone",
    );
  });

  it("maps PATH services to their named service images", () => {
    const branding = getRegionalTransitBranding("PATH", "green,blue");

    expect(branding.lines.map((line) => line.imagePath)).toEqual([
      "/NewYorkSubwayPATHHobwtc.png",
      "/NewYorkSubwayPATHHob33.png",
    ]);
  });

  it("maps every supported non-NYCTA agency to a line badge", () => {
    const agencies = [
      ["MNR", "HU"],
      ["NJ Transit", "10"],
      ["JFK AirTrain", "JAMAICA"],
      ["EWR AirTrain", "AIRTRAIN"],
      ["CTrail", "HART"],
    ] as const;

    for (const [agency, line] of agencies) {
      const branding = getRegionalTransitBranding(agency, line);
      expect(branding.lines.length).toBeGreaterThan(0);
    }
  });

  it("uses station-specific HBLR and Newark Light Rail service logos", () => {
    expect(
      getRegionalTransitBranding(
        "NJ Transit",
        "4",
        "HBLR-HT,HBLR-WST,HBLR-8H",
      ).lines.map((line) => line.imagePath),
    ).toEqual([
      "/NJTLRHobokenTonnelle.png",
      "/NJTLRWestSideTonnelle.png",
      "/NJTLR8thStHoboken.png",
    ]);
    expect(
      getRegionalTransitBranding(
        "NJ Transit",
        "13",
        "NLR-NCS,NLR-BSE",
      ).lines.map((line) => line.imagePath),
    ).toEqual(["/NJTLRNewark.png", "/NJTLRNewarkBroad.png"]);
  });

  it("uses separate Main and Bergen County line logos", () => {
    expect(
      getRegionalTransitBranding("NJ Transit", "5-main,5-bergen").lines.map(
        (line) => line.imagePath,
      ),
    ).toEqual(["/NJTMainLine.png", "/NJTBergenCounty.png"]);
    expect(
      getRegionalTransitBranding("NJ Transit", "5-main").lines.map(
        (line) => line.imagePath,
      ),
    ).toEqual(["/NJTMainLine.png"]);
  });

  it("has an existing line image for every regional station", () => {
    const snapshots = [
      "mta-regional-rail-accessibility.json",
      "path-accessibility.json",
      "ewr-airtrain-accessibility.json",
      "jfk-airtrain-accessibility.json",
      "nj-transit-accessibility.json",
      "ctrail-accessibility.json",
    ].flatMap((fileName) => {
      const snapshot = JSON.parse(
        readFileSync(path.join(process.cwd(), "data", fileName), "utf8"),
      ) as {
        stations: Array<{
          agency: RegionalTransitAgency;
          branchId: string;
          name: string;
          serviceRouteIds?: string[];
        }>;
      };
      return snapshot.stations;
    });

    for (const station of snapshots) {
      const branding = getRegionalTransitBranding(
        station.agency,
        station.branchId,
        station.serviceRouteIds?.join(","),
      );
      const description = `${station.agency} ${station.name}`;

      expect(branding.lines.length, description).toBeGreaterThan(0);
      for (const badge of branding.lines) {
        expect(
          existsSync(
            path.join(process.cwd(), "public", badge.imagePath.replace(/^\//, "")),
          ),
          `${description}: ${badge.imagePath}`,
        ).toBe(true);
      }
    }
  });
});
