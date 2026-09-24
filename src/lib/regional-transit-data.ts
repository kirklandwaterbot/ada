import ctrailAccessibility from "../../data/ctrail-accessibility.json";
import ewrAirTrainAccessibility from "../../data/ewr-airtrain-accessibility.json";
import jfkAirTrainAccessibility from "../../data/jfk-airtrain-accessibility.json";
import regionalRailAccessibility from "../../data/mta-regional-rail-accessibility.json";
import njTransitAccessibility from "../../data/nj-transit-accessibility.json";
import pathAccessibility from "../../data/path-accessibility.json";
import type { RegionalTransitAgency } from "@/lib/regional-transit-branding";
import {
  getRegionalStationServices,
  mergeRegionalTransitStations,
  type RegionalStationService,
} from "@/lib/regional-station-merge";

export type RegionalAccessibilityStatus =
  | "Accessible"
  | "Not accessible"
  | "Partially accessible"
  | "Unknown";

export type RegionalEquipmentStatus =
  | "long_term_outage"
  | "operational"
  | "outage"
  | "unknown";

export type RegionalEquipmentUnit = {
  agency: RegionalTransitAgency;
  lastUpdated: string | null;
  location: string;
  note?: string | null;
  status: RegionalEquipmentStatus;
  type: "Elevator" | "Escalator";
  unitId: string;
};

export type RegionalStationSource = {
  accessMethods?: string[];
  accessibilityStatus: RegionalAccessibilityStatus;
  agency: RegionalTransitAgency;
  branchColor: string;
  branchId: string;
  branchName: string;
  elevators: RegionalEquipmentUnit[];
  escalators: RegionalEquipmentUnit[];
  latitude: number;
  longitude: number;
  name: string;
  serviceAlert?: string;
  serviceRouteIds?: string[];
  stationCode: string;
  stationDetailUrl: string | null;
};

export type RegionalStation = RegionalStationSource & {
  services: RegionalStationService[];
};

export type RegionalEquipmentRecord = RegionalEquipmentUnit & {
  branchNames: string[];
  id: string;
  stationCode: string;
  stationName: string;
  stationSlug: string;
  stationDetailUrl: string | null;
};

export type RegionalSystemSummary = {
  accessibleStations: number;
  agency: RegionalTransitAgency;
  equipment: number;
  label: string;
  sourceUrl: string | null;
  stations: number;
};

const AGENCY_LABELS: Record<RegionalTransitAgency, string> = {
  CTrail: "CTrail",
  "EWR AirTrain": "AirTrain Newark",
  "JFK AirTrain": "AirTrain JFK",
  LIRR: "Long Island Rail Road",
  MNR: "Metro-North Railroad",
  "NJ Transit": "NJ Transit",
  PATH: "PATH",
};

const rawRegionalStations = [
  ...regionalRailAccessibility.stations,
  ...pathAccessibility.stations,
  ...ewrAirTrainAccessibility.stations,
  ...jfkAirTrainAccessibility.stations,
  ...njTransitAccessibility.stations,
  ...ctrailAccessibility.stations,
] as unknown as Array<
  Omit<RegionalStationSource, "elevators" | "escalators"> & {
    elevators: Array<Omit<RegionalEquipmentUnit, "agency" | "type">>;
    escalators: Array<Omit<RegionalEquipmentUnit, "agency" | "type">>;
  }
>;

export const regionalStationSources: RegionalStationSource[] =
  rawRegionalStations.map((station) => ({
    ...station,
    elevators: station.elevators.map((equipment) => ({
      ...equipment,
      agency: station.agency,
      type: "Elevator" as const,
    })),
    escalators: station.escalators.map((equipment) => ({
      ...equipment,
      agency: station.agency,
      type: "Escalator" as const,
    })),
  }));

export const regionalStations = mergeRegionalTransitStations(
  regionalStationSources,
) as RegionalStation[];

export const regionalEquipmentRecords: RegionalEquipmentRecord[] =
  regionalStationSources.flatMap((station) => {
    const branchNames = getRegionalStationServices(station).map(
      (service) => service.branchName,
    );
    const sourceStationCodes = new Set(station.stationCode.split("+"));
    const mergedStation = regionalStations.find(
      (candidate) =>
        candidate.stationCode
          .split("+")
          .some((stationCode) => sourceStationCodes.has(stationCode)) &&
        getRegionalStationServices(candidate).some(
          (service) => service.agency === station.agency,
        ),
    );
    const stationSlug = mergedStation
      ? getRegionalStationSlug(mergedStation)
      : getRegionalStationSlugFromSource(station);

    return [...station.elevators, ...station.escalators].map((equipment) => ({
      ...equipment,
      branchNames,
      id: [
        station.agency,
        station.stationCode,
        equipment.type,
        equipment.unitId,
      ].join(":"),
      stationCode: station.stationCode,
      stationDetailUrl: station.stationDetailUrl,
      stationName: station.name,
      stationSlug,
    }));
  });

export const regionalSystemSummaries: RegionalSystemSummary[] = Object.keys(
  AGENCY_LABELS,
)
  .map((agency) => {
    const typedAgency = agency as RegionalTransitAgency;
    const stations = regionalStationSources.filter(
      (station) => station.agency === typedAgency,
    );

    return {
      accessibleStations: stations.filter(
        (station) => station.accessibilityStatus === "Accessible",
      ).length,
      agency: typedAgency,
      equipment: stations.reduce(
        (count, station) =>
          count + station.elevators.length + station.escalators.length,
        0,
      ),
      label: AGENCY_LABELS[typedAgency],
      sourceUrl:
        stations.find((station) => station.stationDetailUrl)?.stationDetailUrl ||
        null,
      stations: stations.length,
    };
  })
  .sort((left, right) => left.label.localeCompare(right.label));

const regionalStationBySlug = new Map(
  regionalStations.map((station) => [getRegionalStationSlug(station), station]),
);

export function getRegionalStationSlug(station: RegionalStation) {
  return getRegionalStationSlugFromSource(station);
}

export function getRegionalStationBySlug(slug: string) {
  return regionalStationBySlug.get(slug.toLowerCase()) || null;
}

export function getRegionalStationFocusKey(station: RegionalStation) {
  return `${station.agency}:${station.stationCode}`;
}

export function getRegionalAgencyLabel(agency: RegionalTransitAgency) {
  return AGENCY_LABELS[agency];
}

export function getRegionalEquipmentCounts(
  records: RegionalEquipmentRecord[] = regionalEquipmentRecords,
) {
  return records.reduce(
    (counts, equipment) => {
      counts.total += 1;
      if (equipment.type === "Elevator") counts.elevators += 1;
      if (equipment.type === "Escalator") counts.escalators += 1;
      counts[equipment.status] += 1;
      return counts;
    },
    {
      elevators: 0,
      escalators: 0,
      long_term_outage: 0,
      operational: 0,
      outage: 0,
      total: 0,
      unknown: 0,
    },
  );
}

function getRegionalStationSlugFromSource(
  station: Pick<RegionalStationSource, "agency" | "name" | "stationCode">,
) {
  return ["regional", station.agency, station.name, station.stationCode]
    .map(slugify)
    .filter(Boolean)
    .join("-");
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
