import type { RegionalTransitAgency } from "@/lib/regional-transit-branding";

export type RegionalStationService = {
  agency: RegionalTransitAgency;
  branchId: string;
  branchName: string;
  serviceRouteIds: string[];
};

type RegionalStationBase = {
  accessMethods?: string[];
  accessibilityStatus: string;
  agency: RegionalTransitAgency;
  branchId: string;
  branchName: string;
  elevators?: RegionalEquipmentBase[];
  escalators?: RegionalEquipmentBase[];
  latitude: number;
  longitude: number;
  name: string;
  serviceRouteIds?: string[];
  stationCode: string;
};

type RegionalEquipmentBase = {
  location: string;
  unitId: string;
};

export type RegionalStationWithServices<T extends RegionalStationBase> = T & {
  services: RegionalStationService[];
};

const SHARED_REGIONAL_STATIONS = [
  {
    agencies: ["MNR", "CTrail"],
    aliases: ["new haven", "new haven union"],
    displayName: "New Haven Union Station",
    key: "new-haven-union",
  },
  {
    agencies: ["MNR", "CTrail"],
    aliases: ["new haven state street"],
    displayName: "New Haven State Street",
    key: "new-haven-state-street",
  },
  { agencies: ["MNR", "CTrail"], aliases: ["west haven"], displayName: "West Haven", key: "west-haven" },
  { agencies: ["MNR", "CTrail"], aliases: ["milford"], displayName: "Milford", key: "milford" },
  { agencies: ["MNR", "CTrail"], aliases: ["stratford"], displayName: "Stratford", key: "stratford" },
  { agencies: ["MNR", "CTrail"], aliases: ["bridgeport"], displayName: "Bridgeport", key: "bridgeport" },
  { agencies: ["MNR", "CTrail"], aliases: ["stamford"], displayName: "Stamford", key: "stamford" },
  {
    agencies: ["PATH", "NJ Transit"],
    aliases: ["newark", "newark penn"],
    displayName: "Newark Penn Station",
    key: "newark-penn",
  },
  {
    agencies: ["PATH", "NJ Transit"],
    aliases: ["hoboken", "hoboken terminal"],
    displayName: "Hoboken",
    key: "hoboken-terminal",
  },
  {
    agencies: ["LIRR", "NJ Transit"],
    aliases: ["penn", "new york penn"],
    displayName: "New York Penn Station",
    key: "new-york-penn",
  },
  {
    agencies: ["LIRR", "JFK AirTrain"],
    aliases: ["jamaica"],
    displayName: "Jamaica",
    key: "jamaica",
  },
] as const;

const SHARED_STATION_BY_ALIAS = new Map<
  string,
  (typeof SHARED_REGIONAL_STATIONS)[number]
>(
  SHARED_REGIONAL_STATIONS.flatMap((station) =>
    station.aliases.map((alias) => [alias, station] as const),
  ),
);

export function mergeRegionalTransitStations<T extends RegionalStationBase>(
  stations: T[],
): Array<RegionalStationWithServices<T>> {
  const stationsByKey = new Map<string, RegionalStationWithServices<T>>();

  for (const station of stations) {
    const sharedStation = getSharedStation(station);
    const key = sharedStation
      ? `shared:${sharedStation.key}`
      : `${station.agency}:${station.stationCode}`;
    const service = toService(station);
    const current = stationsByKey.get(key);

    if (!current) {
      stationsByKey.set(key, {
        ...station,
        name: sharedStation?.displayName || station.name,
        services: [service],
      });
      continue;
    }

    const currentIsPrimary = sourcePriority(current.agency) >= sourcePriority(station.agency);
    const primary = currentIsPrimary ? current : station;
    const stationCodes = currentIsPrimary
      ? [current.stationCode, station.stationCode]
      : [station.stationCode, current.stationCode];
    const services = dedupeServices([...current.services, service]);

    stationsByKey.set(key, {
      ...primary,
      accessMethods: [
        ...new Set([
          ...(current.accessMethods || []),
          ...(station.accessMethods || []),
        ]),
      ],
      elevators: mergeEquipment(current.elevators, station.elevators),
      escalators: mergeEquipment(current.escalators, station.escalators),
      name: sharedStation?.displayName || primary.name,
      services,
      stationCode: [...new Set(stationCodes)].join("+"),
    } as RegionalStationWithServices<T>);
  }

  return [...stationsByKey.values()];
}

function mergeEquipment(
  current: RegionalEquipmentBase[] | undefined,
  incoming: RegionalEquipmentBase[] | undefined,
) {
  if (!current && !incoming) return undefined;

  return [...(current || []), ...(incoming || [])].filter(
    (equipment, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.unitId === equipment.unitId &&
          candidate.location === equipment.location,
      ) === index,
  );
}

export function getRegionalStationServices<T extends RegionalStationBase>(
  station: T | RegionalStationWithServices<T>,
) {
  return "services" in station ? station.services : [toService(station)];
}

function getSharedStation(station: RegionalStationBase) {
  const sharedStation =
    SHARED_STATION_BY_ALIAS.get(normalizeStationName(station.name)) || null;
  const allowedAgencies = sharedStation?.agencies as
    | readonly RegionalTransitAgency[]
    | undefined;
  return allowedAgencies?.includes(station.agency)
    ? sharedStation
    : null;
}

function normalizeStationName(value: string) {
  return value
    .toLowerCase()
    .replace(/\bst\b/g, "street")
    .replace(/\bstation\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourcePriority(agency: RegionalTransitAgency) {
  if (agency === "NJ Transit") return 3;
  if (agency === "MNR") return 2;
  if (agency === "LIRR" || agency === "PATH") return 1;
  return 0;
}

function toService(station: RegionalStationBase): RegionalStationService {
  return {
    agency: station.agency,
    branchId: station.branchId,
    branchName: station.branchName,
    serviceRouteIds: station.serviceRouteIds || [],
  };
}

function dedupeServices(services: RegionalStationService[]) {
  return services.filter(
    (service, index) =>
      services.findIndex(
        (candidate) =>
          candidate.agency === service.agency &&
          candidate.branchId === service.branchId &&
          candidate.serviceRouteIds.join(",") === service.serviceRouteIds.join(","),
      ) === index,
  );
}
