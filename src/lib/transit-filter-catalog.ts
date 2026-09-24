import { getSubwayRouteIconPath } from "@/lib/asset-display";
import {
  getRegionalTransitBranding,
  type RegionalTransitAgency,
} from "@/lib/regional-transit-branding";
import type { RegionalStationService } from "@/lib/regional-station-merge";

export type TransitRouteFilter = {
  color: string;
  imagePaths: string[];
  key: string;
  label: string;
  lineName?: string;
  routeId: string;
  stationRouteIds?: string[];
};

export type TransitFilterSection = {
  id: string;
  label: string;
  routes: TransitRouteFilter[];
};

export type TransitFilterAgency = {
  id: string;
  label: string;
  sections: TransitFilterSection[];
};

export type TransitFilterSystem = {
  id: string;
  label: string;
  agencies: TransitFilterAgency[];
};

const routes = (
  agency: string,
  definitions: Array<
    [
      routeId: string,
      label: string,
      color: string,
      stationRouteIds?: string[],
      lineName?: string,
    ]
  >,
): TransitRouteFilter[] =>
  definitions.map(([routeId, label, color, stationRouteIds, lineName]) => ({
    color,
    imagePaths: getTransitFilterRouteImages(agency, routeId),
    key: `${agency}:${routeId}`,
    label,
    lineName,
    routeId,
    stationRouteIds,
  }));

const REGIONAL_FILTER_AGENCIES = new Set<RegionalTransitAgency>([
  "CTrail",
  "EWR AirTrain",
  "JFK AirTrain",
  "LIRR",
  "MNR",
  "NJ Transit",
  "PATH",
]);

function getTransitFilterRouteImages(agency: string, routeId: string) {
  if (agency === "NYCTA") {
    const iconRoute =
      routeId === "GS"
        ? "S"
        : routeId === "FS"
          ? "SF"
          : routeId === "H"
            ? "SR"
            : routeId;
    return [
      routeId === "SI"
        ? "/NewYorkSubwaySI.png"
        : getSubwayRouteIconPath(iconRoute),
    ];
  }

  if (!REGIONAL_FILTER_AGENCIES.has(agency as RegionalTransitAgency)) return [];

  return getRegionalTransitBranding(
    agency as RegionalTransitAgency,
    routeId,
  ).lines.map((line) => line.imagePath);
}

export const TRANSIT_FILTER_SYSTEMS: TransitFilterSystem[] = [
  {
    id: "mta",
    label: "MTA",
    agencies: [
      {
        id: "nycta",
        label: "NYCTA",
        sections: [
          {
            id: "nycta-a-division",
            label: "A Division",
            routes: routes("NYCTA", [
              ["1", "1", "#EE352E", undefined, "IRT Broadway–7 Av"],
              ["2", "2", "#EE352E", undefined, "IRT Broadway–7 Av"],
              ["3", "3", "#EE352E", undefined, "IRT Broadway–7 Av"],
              ["4", "4", "#00933C", undefined, "IRT Lexington Av"],
              ["5", "5", "#00933C", undefined, "IRT Lexington Av"],
              ["6", "6", "#00933C", undefined, "IRT Lexington Av"],
              [
                "6X",
                "6 Express",
                "#00933C",
                undefined,
                "IRT Lexington Av",
              ],
              ["7", "7", "#B933AD", undefined, "IRT Flushing"],
              [
                "7X",
                "7 Express",
                "#B933AD",
                undefined,
                "IRT Flushing",
              ],
              [
                "GS",
                "42 St Shuttle",
                "#A7A9AC",
                ["S", "GS"],
                "IRT 42 St Shuttle",
              ],
            ]),
          },
          {
            id: "nycta-b-division",
            label: "B Division",
            routes: routes("NYCTA", [
              ["A", "A", "#0039A6", undefined, "IND 8 Av"],
              ["C", "C", "#0039A6", undefined, "IND 8 Av"],
              ["E", "E", "#0039A6", undefined, "IND 8 Av"],
              ["B", "B", "#FF6319", undefined, "IND 6 Av"],
              ["D", "D", "#FF6319", undefined, "IND 6 Av"],
              ["F", "F", "#FF6319", undefined, "IND 6 Av"],
              [
                "FX",
                "F Express",
                "#FF6319",
                ["F", "FX"],
                "IND 6 Av",
              ],
              ["M", "M", "#FF6319", undefined, "IND 6 Av"],
              ["G", "G", "#6CBE45", undefined, "IND Crosstown"],
              ["J", "J", "#996633", undefined, "BMT Nassau St"],
              ["Z", "Z", "#996633", undefined, "BMT Nassau St"],
              ["L", "L", "#A7A9AC", undefined, "BMT Canarsie"],
              ["N", "N", "#FCCC0A", undefined, "BMT Broadway"],
              ["Q", "Q", "#FCCC0A", undefined, "BMT Broadway"],
              ["R", "R", "#FCCC0A", undefined, "BMT Broadway"],
              ["W", "W", "#FCCC0A", undefined, "BMT Broadway"],
              [
                "FS",
                "Franklin Av Shuttle",
                "#A7A9AC",
                ["S", "FS"],
                "BMT Franklin Av Shuttle",
              ],
              [
                "H",
                "Rockaway Park Shuttle",
                "#A7A9AC",
                ["S", "H"],
                "IND Rockaway Park Shuttle",
              ],
            ]),
          },
          {
            id: "sir",
            label: "Staten Island Railway",
            routes: routes("NYCTA", [
              [
                "SI",
                "SIR",
                "#057FD4",
                ["SIR", "SI"],
                "SIR Main Line",
              ],
            ]),
          },
        ],
      },
      {
        id: "lirr",
        label: "Long Island Rail Road",
        sections: [
          {
            id: "lirr-lines",
            label: "Branches",
            routes: routes("LIRR", [
              ["1", "Babylon", "#00985F", ["BY"]],
              ["2", "Hempstead", "#CE8E00", ["HM"]],
              ["3", "Oyster Bay", "#00AF3F", ["OB"]],
              ["4", "Ronkonkoma", "#A626AA", ["RK"]],
              ["5", "Montauk", "#00B2A9", ["MK"]],
              ["6", "Long Beach", "#FF6319", ["LB"]],
              ["7", "Far Rockaway", "#6E3219", ["FR"]],
              ["8", "West Hempstead", "#00A1DE", ["WH"]],
              ["9", "Port Washington", "#C60C30", ["PW"]],
              ["10", "Port Jefferson", "#006EC7", ["PJ"]],
              ["13", "Greenport", "#A626AA", ["GY"]],
              ["BT", "Belmont Park", "#60269E", ["BT"]],
            ]),
          },
        ],
      },
      {
        id: "mnr",
        label: "Metro-North Railroad",
        sections: [
          {
            id: "mnr-lines",
            label: "Lines and branches",
            routes: routes("MNR", [
              ["1", "Hudson", "#009B3A", ["HU"]],
              ["2", "Harlem", "#0039A6", ["HA", "WA", "CI"]],
              ["3", "New Haven", "#EE0034", ["NH"]],
              ["4", "New Canaan", "#EE0034", ["NC"]],
              ["5", "Danbury", "#EE0034", ["DN"]],
              ["6", "Waterbury", "#E00034", ["WB"]],
            ]),
          },
          {
            id: "mnr-west-of-hudson",
            label: "West of Hudson",
            routes: routes("NJ Transit", [
              ["6", "Port Jervis", "#FF7900"],
              ["14", "Pascack Valley", "#94219A"],
            ]),
          },
        ],
      },
    ],
  },
  {
    id: "panynj",
    label: "Port Authority of NY & NJ",
    agencies: [
      {
        id: "path",
        label: "PATH",
        sections: [
          {
            id: "path-services",
            label: "Services",
            routes: routes("PATH", [
              ["BLU", "HOB–33", "#4D92FB", ["blue"]],
              ["GRE", "HOB–WTC", "#65C100", ["green"]],
              ["YEL", "JSQ–33", "#FF9900", ["yellow"]],
              ["RED", "NWK–WTC", "#D93A30", ["red"]],
            ]),
          },
        ],
      },
      {
        id: "jfk-airtrain",
        label: "AirTrain JFK",
        sections: [
          {
            id: "jfk-services",
            label: "Services",
            routes: routes("JFK AirTrain", [
              ["HOWARD", "Howard Beach", "#009E58"],
              ["JAMAICA", "Jamaica", "#EF3941"],
              ["TERMINALS", "All Terminals Loop", "#FDB827"],
            ]),
          },
        ],
      },
      {
        id: "ewr-airtrain",
        label: "AirTrain Newark",
        sections: [
          {
            id: "ewr-services",
            label: "Service",
            routes: routes("EWR AirTrain", [["AIRTRAIN", "AirTrain Newark", "#C81858"]]),
          },
        ],
      },
    ],
  },
  {
    id: "nj-transit",
    label: "NJ Transit",
    agencies: [
      {
        id: "njt-rail",
        label: "NJT Rail",
        sections: [
          {
            id: "njt-newark-division",
            label: "Newark Division",
            routes: routes("NJ Transit", [
              ["10", "Northeast Corridor", "#DD3439"],
              ["11", "North Jersey Coast", "#03A3DF", ["11", "12"]],
              ["16", "Raritan Valley", "#F2A537"],
              ["15", "Princeton", "#DD3439"],
              ["1", "Atlantic City", "#075AAA"],
            ]),
          },
          {
            id: "njt-hoboken-division",
            label: "Hoboken Division",
            routes: routes("NJ Transit", [
              ["2", "Montclair–Boonton", "#E66859", ["2", "3"]],
              ["5-main", "Main", "#FFCF01", ["5"]],
              ["5-bergen", "Bergen County", "#B9C9DF", ["5"]],
              ["6", "Port Jervis", "#FF7900"],
              ["7", "Morris & Essex", "#08A652"],
              ["8", "Gladstone", "#A4C9AA"],
              ["9", "Meadowlands", "#C1AA72"],
              ["14", "Pascack Valley", "#94219A"],
            ]),
          },
        ],
      },
      {
        id: "njt-light-rail",
        label: "NJT Light Rail",
        sections: [
          {
            id: "njt-light-rail-lines",
            label: "Light rail services",
            routes: routes("NJ Transit", [
              ["HBLR-8H", "8th Street–Hoboken", "#009EDA"],
              [
                "HBLR-WST",
                "West Side Avenue–Tonnelle Avenue",
                "#FFDD00",
              ],
              ["HBLR-HT", "Hoboken–Tonnelle Avenue", "#008C4E"],
              ["NLR-NCS", "Grove Street–Newark Penn", "#00A7E5"],
              ["NLR-BSE", "Broad Street–Newark Penn", "#FECE05"],
              ["17", "River LINE", "#181B72"],
            ]),
          },
        ],
      },
    ],
  },
  {
    id: "ctrail",
    label: "CTrail",
    agencies: [
      {
        id: "ctrail-rail",
        label: "CTrail Rail",
        sections: [
          {
            id: "ctrail-lines",
            label: "Lines",
            routes: routes("CTrail", [
              ["HART", "Hartford Line", "#EA0D2A"],
              ["SLE", "Shore Line East", "#ED0A28"],
            ]),
          },
        ],
      },
    ],
  },
];

export const TRANSIT_ROUTE_FILTERS = TRANSIT_FILTER_SYSTEMS.flatMap((system) =>
  system.agencies.flatMap((agency) =>
    agency.sections.flatMap((section) => section.routes),
  ),
);

export const ALL_TRANSIT_ROUTE_KEYS = [
  ...new Set(TRANSIT_ROUTE_FILTERS.map((route) => route.key)),
];

export const DEFAULT_ENABLED_TRANSIT_ROUTES = ALL_TRANSIT_ROUTE_KEYS.filter(
  (routeKey) => routeKey.startsWith("NYCTA:"),
);

export function getTransitRoutesForAgency(agency: string) {
  return TRANSIT_ROUTE_FILTERS.filter((route) => route.key.startsWith(`${agency}:`));
}

export function getEnabledTransitRouteIds(
  agency: string,
  enabledRouteKeys: string[],
) {
  const enabled = new Set(enabledRouteKeys);
  return [
    ...new Set(
      TRANSIT_ROUTE_FILTERS.filter(
        (route) =>
          route.key.startsWith(`${agency}:`) && enabled.has(route.key),
      ).flatMap((route) => [
        route.routeId,
        ...(route.stationRouteIds || []),
      ]),
    ),
  ];
}

export function getTransitRouteKeysForServices(
  services: RegionalStationService[],
) {
  return [
    ...new Set(
      TRANSIT_ROUTE_FILTERS.filter((route) =>
        services.some((service) => {
          if (!route.key.startsWith(`${service.agency}:`)) return false;

          // GTFS service IDs describe the trains that actually stop here.
          // NJ Transit publishes those IDs only for its light-rail services,
          // so commuter-rail IDs must also be retained from branchId at shared
          // terminals such as Hoboken.
          const stationRouteIds = new Set(service.serviceRouteIds);
          if (service.agency === "NJ Transit" || stationRouteIds.size === 0) {
            for (const routeId of service.branchId.split(",").filter(Boolean)) {
              stationRouteIds.add(routeId);
            }
          }

          return [route.routeId, ...(route.stationRouteIds || [])].some(
            (routeId) => stationRouteIds.has(routeId),
          );
        }),
      ).map((route) => route.key),
    ),
  ];
}
