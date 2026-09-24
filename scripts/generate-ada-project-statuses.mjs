import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plannedStations = await readJson(
  "data/planned-ada-station-coordinates.json",
);
const accessibilityStations = await readJson("data/accessibility-stations.json");
const capitalProjects = await readJson(
  "data/mta-capital-elevator-escalator-projects.json",
);
const subwayAssets = await readJson(
  "data/mta-subway-elevator-escalator-assets.json",
);
const regionalRailAccessibility = await readJson(
  "data/mta-regional-rail-accessibility.json",
);

const FUNDED_PROJECT = {
  projectId: "9999902",
  projectPhase: "Planned",
  projectTitle: "25-29 NYCT ADA Improvements (including SIR)",
  sourceUrl: "https://capitaldashboard.mta.info/?projectId=9999902",
};

const UNDER_CONSTRUCTION = [
  project("42 St-Bryant Park/5 Av", [], "13479", "NYCT ADA Station Improvements: 42 St - Bryant Park Complex"),
  project("42 St-Bryant Park/Fifth Av", [], "13479", "NYCT ADA Station Improvements: 42 St - Bryant Park Complex"),
  project("Junius St", ["3"], "12420", "NYCT ADA Station Improvements: Package 3"),
  project("Kings Hwy", ["F"], "12420", "NYCT ADA Station Improvements: Package 3"),
  project("Rockaway Blvd", ["A"], "12420", "NYCT ADA Station Improvements: Package 3"),
  project("Steinway St", ["M", "R"], "12420", "NYCT ADA Station Improvements: Package 3"),
  project("Woodhaven Blvd", ["M", "R"], "12420", "NYCT ADA Station Improvements: Package 3"),
  project("Huguenot", ["SIR"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("New Lots Av", ["3"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("36 St", ["D", "N", "R"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("Broadway", ["N", "W"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("33 St-Rawson St", ["7"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("46 St-Bliss St", ["7"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("81 St-Museum of Natural History", ["B", "C"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("86 St", ["4", "5", "6"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("96 St", ["B", "C"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("Classon Av", ["G"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("Van Cortlandt Park-242 St", ["1"], "12630", "NYCT ADA Station Improvements: Package 5"),
  project("Av I", ["F"], "12750", "NYCT ADA Station Improvements: Package 6"),
  project("Burnside Av", ["4"], "12750", "NYCT ADA Station Improvements: Package 6"),
  project("Middletown Rd", ["6"], "12750", "NYCT ADA Station Improvements: Package 6"),
  project("Myrtle Av", ["J", "M", "Z"], "12750", "NYCT ADA Station Improvements: Package 6"),
  project("Norwood Av", ["J", "Z"], "12750", "NYCT ADA Station Improvements: Package 6"),
  project("167 St", ["B", "D"], "12751", "NYCT ADA: Package 7"),
  project("Kingsbridge Rd", ["4"], "12751", "NYCT ADA: Package 7"),
  project("Briarwood", ["E", "F"], "12753", "NYCT ADA Station Improvements: Package 9"),
  project("Gates Av", ["J", "Z"], "12753", "NYCT ADA Station Improvements: Package 9"),
  project("Parsons Blvd", ["F"], "12753", "NYCT ADA Station Improvements: Package 9"),
];

const ACTIVE_PROJECTS_AT_ACCESSIBLE_STATIONS = [
  equipmentProject("Bay Ridge-95 St", "4 Av Line", ["R"], ["BAYRIDGE-95ST-4AV-R"], "12411", "NYCT ADA Station Improvements: Package 4"),
  equipmentProject(
    "137 St-City College",
    "Broadway-7 Av Line",
    ["1"],
    ["137ST-CITYCOLLEGE-BWY7-1"],
    "12411",
    "NYCT ADA Station Improvements: Package 4",
    {
      note: "Uptown access is open via EL519; downtown accessibility remains under construction.",
      onlyInServiceCoordinates: true,
    },
  ),
];

const COMPLEX_PROJECT_MARKERS = [
  {
    borough: "Brooklyn",
    coordinateSource: "MTA elevator and escalator equipment inventory",
    id: "broadway-junction-complex",
    latitude: 40.67856,
    line: "Broadway Junction Complex",
    longitude: -73.90392,
    neighborhood: "East New York",
    note: "Construction is making the entire A/C, J/Z, and L complex fully ADA accessible, including seven new elevators and circulation improvements.",
    plannedAdaNote: "✅",
    projectPhase: "Construction",
    projectStatus: "under_construction",
    projectTitle: "NYCT ADA Station Improvements: Broadway Junction",
    agency: "NYCTA",
    services: ["A", "C", "J", "Z", "L"],
    sourceUrl: "https://capitaldashboard.mta.info/?projectId=11134",
    station: "Broadway Junction",
    transitRouteKeys: toTransitRouteKeys("NYCTA", ["A", "C", "J", "Z", "L"]),
  },
];

const DESIGN_STUDY = [
  project("Neptune Av", ["F"], "12752", "Design-Build Services for ADA Upgrades Package 8", "Active Procurement"),
  project("Jefferson St", ["L"], "12752", "Design-Build Services for ADA Upgrades Package 8", "Active Procurement"),
  project("Fort Hamilton Pkwy", ["D"], "12752", "Design-Build Services for ADA Upgrades Package 8", "Active Procurement"),
  project("Nostrand Av", ["A", "C"], "12752", "Design-Build Services for ADA Upgrades Package 8", "Active Procurement"),
  project("18 Av", ["D"], "12752", "Design-Build Services for ADA Upgrades Package 8", "Active Procurement"),
  project("2 Av", ["F"], "12754", "Design-Build Services for ADA Upgrades - Package 10", "Active Procurement"),
  project("7 Av", ["B", "D", "E"], "12754", "Design-Build Services for ADA Upgrades - Package 10", "Active Procurement"),
  project("Morrison Av-Soundview", ["6"], "12754", "Design-Build Services for ADA Upgrades - Package 10", "Active Procurement"),
  project("110 St", ["6"], "13429", "Design-Build Services for ADA Upgrades Package 11", "Active Procurement"),
  project("145 St", ["A", "B", "C", "D"], "13429", "Design-Build Services for ADA Upgrades Package 11", "Active Procurement"),
  project("Wakefield-241 St", ["2"], "13429", "Design-Build Services for ADA Upgrades Package 11", "Active Procurement"),
];

const REGIONAL_PROJECTS = [
  regionalProject("Forest Hills", "12654", "LIRR ADA Station Improvements: Package 2", "Construction", "under_construction"),
  regionalProject("Hollis", "12654", "LIRR ADA Station Improvements: Package 2", "Construction", "under_construction"),
  regionalProject("Babylon", "12654", "LIRR ADA Station Improvements: Package 2", "Construction", "under_construction"),
  regionalProject("Bellerose", "14768", "ADA Station Improvements - Package 3", "Active Procurement", "design_study"),
  regionalProject("Floral Park", "14768", "ADA Station Improvements - Package 3", "Active Procurement", "design_study"),
];

const PLANNED_NEW_STATIONS = [
  newStation("106 St", 40.79002, -73.94315),
  newStation("116 St", 40.79886, -73.93864),
  newStation("125 St", 40.80418, -73.93742),
];

const ACCESSIBLE_STATION_UPGRADES = [
  upgrade("3 Av-149 St", "White Plains Rd Line", ["2", "5"], ["3AV-149ST-LWP-2/5"], "T8040715"),
  upgrade("161 St-Yankee Stadium", "Concourse/Jerome Av Lines", ["B", "D", "4"], ["161ST-YANKEESTADIUM-CON-B/D"], "T8040715"),
  upgrade("34 St-Penn Station", "8 Av Line", ["A", "C", "E"], ["34ST-PENNSTATION-8AV-A/C/E"], "T8040715"),
  upgrade("Euclid Av", "8 Av Line", ["A", "C"], ["EUCLIDAV-8AV-A/C"], "T8040715"),
  upgrade("Atlantic Av-Barclays Ctr", "4 Av/Eastern Pkwy Lines", ["D", "N", "R", "2", "3", "4", "5"], ["ATLANTICAV-BARCLAYSCTR-4AV-D/N/R", "ATLANTICAV-BARCLAYSCTR-EPK-2/3/4/5"], "T8040719"),
  upgrade("Crown Hts-Utica Av", "Eastern Pkwy Line", ["3", "4"], ["CROWNHTS-UTICAAV-EPK-3/4"], "T8040719"),
  upgrade("DeKalb Av", "4 Av Line", ["B", "Q", "R"], ["DEKALBAV-4AV-B/Q/R"], "T8040719"),
  upgrade("Church Av", "Nostrand Av Line", ["2", "5"], ["CHURCHAV-NOS-2/5"], "T8040719"),
  upgrade("Coney Island-Stillwell Av", "Sea Beach Line", ["D", "F", "N", "Q"], ["CONEYISLAND-STILLWELLAV-SEA-D/F/N/Q"], "T8040719"),
  upgrade("175 St", "8 Av Line", ["A"], ["175ST-8AV-A"], "T8040717"),
  upgrade("125 St", "8 Av Line", ["A", "B", "C", "D"], ["125ST-8AV-A/B/C/D"], "T8040717"),
  upgrade("14 St-Union Sq", "Broadway/Canarsie Lines", ["L", "N", "Q", "R", "W"], ["14ST-UNIONSQ-BWY-N/R/Q", "14ST-UNIONSQ-CNR-L"], "T8040717"),
  upgrade("8 Av", "Canarsie Line", ["L"], ["8AV-CNR-L"], "T8040717"),
  upgrade("Times Sq-42 St", "Broadway Line", ["N", "Q", "R", "W"], ["TIMESSQ-42ST-BWY-N/R/Q"], "T8040717"),
  upgrade("Lexington Av/53 St", "Queens Blvd Line", ["E", "M"], ["LEXINGTONAV/53ST-QBL-E/M"], "T8040717"),
  upgrade("W 4 St-Wash Sq", "8 Av Line", ["A", "B", "C", "D", "E", "F", "M"], ["W4ST-WASHSQ-8AV-A/B/C/D/E/F/M"], "T8040717"),
  upgrade("Jackson Hts-Roosevelt Av", "Queens Blvd/Flushing Lines", ["E", "F", "M", "R", "7"], ["JACKSONHTS-ROOSEVELTAV-QBL-E/F/M/R", "74ST-BROADWAY-FLS-7"], "T8040717"),
  upgrade("Fordham Rd", "Jerome Av Line", ["4"], ["FORDHAMRD-JER-4"], "T8040720"),
  upgrade("14 St", "8 Av Line", ["A", "C", "E"], ["14ST-8AV-A/C/E"], "T8040720"),
  upgrade("66 St-Lincoln Center", "Broadway-7 Av Line", ["1"], ["66ST-LINCOLNCENTER-BWY7-1"], "T8040720"),
  upgrade("72 St", "Broadway-7 Av Line", ["1", "2", "3"], ["72ST-BWY7-1/2/3"], "T8040720"),
  upgrade("Canal St", "Lexington Av Line", ["6"], ["CANALST-LEX-6"], "T8040720"),
  upgrade("Flushing-Main St", "Flushing Line", ["7"], ["FLUSHING-MAINST-FLS-7"], "T8040720"),
  upgrade("Queens Plaza", "Queens Blvd Line", ["E", "M", "R"], ["QUEENSPLAZA-QBL-E/M/R"], "T8040720"),
  upgrade("Jamaica-179 St", "Queens Blvd Line", ["F"], ["JAMAICA-179ST-QBL-F"], "T8040720"),
];

const stationRows = accessibilityStations.stations;
const projectRows = capitalProjects.projects;
const baselineMarkers = plannedStations.stations
  .filter((station) => normalize(station.station) !== "broadway junction")
  .map((station) => {
  const construction = findProject(UNDER_CONSTRUCTION, station);
  const designStudy = findProject(DESIGN_STUDY, station);
  const match = construction ?? designStudy ?? FUNDED_PROJECT;
  const projectStatus = construction
    ? "under_construction"
    : designStudy
      ? "design_study"
      : "funded_planned";

    return {
      ...station,
      agency: "NYCTA",
      note:
        projectStatus === "funded_planned"
          ? "Funded or identified for a future ADA accessibility project."
          : projectStatus === "design_study"
            ? "ADA design, study, or active procurement work is underway; construction is not yet shown as active."
            : "The MTA Capital Program Dashboard lists this accessibility project in construction.",
      projectPhase: match.projectPhase,
      projectStatus,
      projectTitle: match.projectTitle,
      sourceUrl: match.sourceUrl,
      transitRouteKeys: toTransitRouteKeys("NYCTA", station.services),
    };
  });

const newStationMarkers = PLANNED_NEW_STATIONS.map((station) => ({
  ...station,
  agency: "NYCTA",
  borough: "Manhattan",
  coordinateSource: "Approximate Second Avenue Subway Phase 2 station location",
  line: "Second Av Line",
  neighborhood: "East Harlem",
  note: "New ADA-accessible station planned as part of Second Avenue Subway Phase 2.",
  projectPhase: "Construction",
  projectStatus: "planned_new_station",
  projectTitle: "Second Avenue Subway Phase 2",
  services: ["Q"],
  sourceUrl: "https://www.mta.info/document/186856",
  transitRouteKeys: toTransitRouteKeys("NYCTA", ["Q"]),
}));

const activeAccessibleStationMarkers = ACTIVE_PROJECTS_AT_ACCESSIBLE_STATIONS.map(
  (station) =>
    createEquipmentProjectMarker(station, {
      idPrefix: "active-ada-package",
      note:
        station.note ??
        "The MTA Capital Program Dashboard still lists this station accessibility package in construction.",
      projectStatus: "under_construction",
    }),
);

const accessibleUpgradeMarkers = ACCESSIBLE_STATION_UPGRADES.map((station) =>
  createEquipmentProjectMarker(station, {
    idPrefix: "accessible-upgrade",
    note: "Active project replaces or modernizes elevators at a station that already has an accessible route.",
    projectStatus: "upgrade_to_accessible_station",
  }),
);

const regionalProjectMarkers = REGIONAL_PROJECTS.map((project) => {
  const station = regionalRailAccessibility.stations.find(
    (candidate) =>
      candidate.agency === project.agency &&
      normalize(candidate.name) === normalize(project.station),
  );
  if (!station) {
    throw new Error(`No regional station record found for ${project.station}.`);
  }

  return {
    agency: project.agency,
    coordinateSource: "MTA regional rail accessibility and GTFS data",
    id: `${project.agency.toLowerCase()}-ada-package-${project.projectId}-${slug(project.station)}`,
    latitude: station.latitude,
    line: station.branchName,
    longitude: station.longitude,
    neighborhood: "",
    note:
      project.projectStatus === "under_construction"
        ? "The MTA Capital Program Dashboard lists this regional-rail accessibility project in construction."
        : "This regional-rail accessibility package is in active procurement; construction is not yet shown as active.",
    plannedAdaNote: "✅",
    projectPhase: project.projectPhase,
    projectStatus: project.projectStatus,
    projectTitle: project.projectTitle,
    services: station.serviceRouteIds,
    sourceUrl: `https://capitaldashboard.mta.info/?projectId=${project.projectId}`,
    station: station.name,
    transitRouteKeys: toTransitRouteKeys(project.agency, station.serviceRouteIds),
  };
});

function createEquipmentProjectMarker(station, options) {
  const matchedAssets = subwayAssets.filter((asset) =>
    station.assetStationNames.includes(asset.station_name),
  );
  if (matchedAssets.length === 0) {
    throw new Error(`No equipment coordinates found for ${station.station}.`);
  }

  const inServiceAssets = matchedAssets.filter(
    (asset) => asset.service_status_code?.trim().toUpperCase() === "IFIS",
  );
  const coordinateAssets =
    station.onlyInServiceCoordinates && inServiceAssets.length > 0
      ? inServiceAssets
      : matchedAssets;
  const coordinates = coordinateAssets
    .map((asset) => asset.georeference?.coordinates)
    .filter(
      (value) =>
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((coordinate) => Number.isFinite(Number(coordinate))),
    );
  if (coordinates.length === 0) {
    throw new Error(`No valid equipment coordinates found for ${station.station}.`);
  }

  const matchingStationRow = stationRows.find(
    (row) =>
      normalize(row.station) === normalize(station.station) &&
      row.services.some((route) => station.services.includes(String(route))),
  );
  const project = projectRows.find(
    (row) => row.externalId === station.projectId,
  );
  const longitude = average(coordinates.map((value) => Number(value[0])));
  const latitude = average(coordinates.map((value) => Number(value[1])));

  return {
    agency: "NYCTA",
    borough: matchingStationRow?.borough ?? matchedAssets[0].borough ?? "New York City",
    coordinateSource: "MTA elevator and escalator equipment inventory",
    id: `${options.idPrefix}-${slug(station.station)}-${station.services.join("-")}`,
    latitude,
    line: station.line,
    longitude,
    neighborhood: matchingStationRow?.neighborhood ?? "",
    note: options.note,
    projectPhase: project?.phase ?? station.projectPhase ?? "Construction",
    projectStatus: options.projectStatus,
    projectTitle: project?.title ?? station.projectTitle ?? "Elevator replacement project",
    services: station.services,
    sourceUrl: station.projectId.startsWith("T")
      ? `https://capitaldashboard.mta.info/?acepId=${station.projectId}`
      : `https://capitaldashboard.mta.info/?projectId=${station.projectId}`,
    station: station.station,
    transitRouteKeys: toTransitRouteKeys("NYCTA", station.services),
  };
}

const stations = [
  ...baselineMarkers,
  ...COMPLEX_PROJECT_MARKERS,
  ...newStationMarkers,
  ...activeAccessibleStationMarkers,
  ...accessibleUpgradeMarkers,
  ...regionalProjectMarkers,
].sort(
  (left, right) =>
    left.station.localeCompare(right.station, undefined, { numeric: true }) ||
    left.line.localeCompare(right.line),
);

const statusCounts = Object.fromEntries(
  [
    "under_construction",
    "funded_planned",
    "design_study",
    "planned_new_station",
    "upgrade_to_accessible_station",
  ].map((status) => [
    status,
    stations.filter((station) => station.projectStatus === status).length,
  ]),
);

const output = {
  checkedAt: capitalProjects.metadata.checkedAt,
  generatedFrom: [
    "data/planned-ada-station-coordinates.json",
    "data/accessibility-stations.json",
    "data/mta-capital-elevator-escalator-projects.json",
    "data/mta-subway-elevator-escalator-assets.json",
    "data/mta-regional-rail-accessibility.json",
  ],
  methodology:
    "Each marker receives one primary status. New-station and already-accessible upgrade scopes take precedence over project phase; remaining projects are grouped by construction, design/study, or funded/planned phase.",
  sourceUrls: [
    "https://capitaldashboard.mta.info/",
    "https://www.mta.info/document/174186",
    "https://www.mta.info/document/186856",
  ],
  statusCounts,
  stations,
};

await writeFile(
  path.join(root, "data/ada-project-statuses.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

console.log(
  `Wrote ${stations.length} ADA project markers (${Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ")}).`,
);

function project(
  station,
  routes,
  projectId,
  projectTitle,
  projectPhase = "Construction",
) {
  return {
    projectId,
    projectPhase,
    projectTitle,
    routes,
    sourceUrl: `https://capitaldashboard.mta.info/?projectId=${projectId}`,
    station,
  };
}

function equipmentProject(
  station,
  line,
  services,
  assetStationNames,
  projectId,
  projectTitle,
  overrides = {},
) {
  return {
    assetStationNames,
    line,
    projectId,
    projectPhase: "Construction",
    projectTitle,
    services,
    station,
    ...overrides,
  };
}

function regionalProject(
  station,
  projectId,
  projectTitle,
  projectPhase,
  projectStatus,
) {
  return {
    agency: "LIRR",
    projectId,
    projectPhase,
    projectStatus,
    projectTitle,
    station,
  };
}

function newStation(station, latitude, longitude) {
  return {
    id: `planned-new-${slug(station)}-second-av-line`,
    latitude,
    longitude,
    station,
  };
}

function upgrade(
  station,
  line,
  services,
  assetStationNames,
  projectId,
) {
  return { assetStationNames, line, projectId, services, station };
}

function findProject(projects, station) {
  return projects.find(
    (candidate) =>
      normalize(candidate.station) === normalize(station.station) &&
      (candidate.routes.length === 0 ||
        candidate.routes.some((route) =>
          station.services.map(normalizeRoute).includes(normalizeRoute(route)),
        )),
  );
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(avenue|av)\b/g, "av")
    .replace(/\b(street|st)\b/g, "st")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRoute(value) {
  return String(value ?? "").trim().toUpperCase().replace("SIR", "SI");
}

function toTransitRouteKeys(agency, services) {
  return services.flatMap((service) => {
    if (agency === "LIRR" && String(service) === "12") return [];
    if (agency !== "NYCTA") return `${agency}:${service}`;
    const normalized = normalizeRoute(service);
    const routeId =
      normalized === "SF" ? "FS" : normalized === "SR" ? "H" : normalized;
    return `NYCTA:${routeId}`;
  });
}

function slug(value) {
  return normalize(value).replace(/\s+/g, "-");
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}
