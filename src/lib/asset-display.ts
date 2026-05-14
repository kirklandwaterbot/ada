import type { MtaAsset } from "@/lib/mta-assets";

export type AssetMapStatus = "accessible" | "not_accessible" | "work";

const LINE_NAME_OVERRIDES: Record<string, string> = {
  "BMT-38-38STYD": "BMT West End",
  "IND-A-8AV/FULTONST": "IND Fulton St",
  "IRT-K-CLARKST": "IRT Broadway/7 Av",
  "IRT-V-7AV": "IRT Broadway/7 Av",
};

const LINE_SEGMENT_NAMES: Record<string, string> = {
  "6AV": "6 Av",
  "7AV": "7 Av",
  "8AV": "8 Av",
  "63ST": "63 St",
  ARCHER: "Archer Av",
  ASTORIA: "Astoria",
  BROADWAY: "Broadway",
  BRIGHTON: "Brighton",
  BROADWAY7AV: "Broadway 7 Av",
  CANARSIE: "Canarsie",
  CONCOURSE: "Concourse",
  CROSSTOWN: "Crosstown",
  CULVER: "Culver",
  EASTERNPKWY: "Eastern Pkwy",
  EASTERNPKWYLINE: "Eastern Pkwy",
  FLUSHING: "Flushing",
  FULTONST: "Fulton St",
  JAMAICA: "Jamaica",
  LEXINGTON: "Lexington Av",
  LEXINGTONAV: "Lexington Av",
  MYRTLE: "Myrtle Av",
  NASSAU: "Nassau St",
  QUEENSBLVD: "Queens Blvd",
  ROCKAWAY: "Rockaway",
  SEA: "Sea Beach",
  SEABEACH: "Sea Beach",
  WESTEND: "West End",
  WHITEPLAINS: "White Plains Rd",
};
const STATION_LINE_DIVISIONS: Record<string, string> = {
  "2 Av": "IND",
  "4 Av": "BMT",
  "6 Av": "IND",
  "8 Av": "IND",
  "42 St Shuttle": "IRT",
  "63 St": "IND",
  "Archer Av": "IND",
  Astoria: "BMT",
  Brighton: "BMT",
  Broadway: "BMT",
  "Broadway/7 Av": "IRT",
  Canarsie: "BMT",
  Concourse: "IND",
  Crosstown: "IND",
  Culver: "IND",
  "Dyre Av": "IRT",
  "Eastern Pkwy": "IRT",
  Flushing: "IRT",
  "Franklin Av": "BMT",
  "Fulton St": "IND",
  Jamaica: "BMT",
  "Jerome Av": "IRT",
  "Lenox Av": "IRT",
  "Lexington Av": "IRT",
  "Myrtle Av": "BMT",
  "Nassau St": "BMT",
  "New Lots": "IRT",
  "Nostrand Av": "IRT",
  Pelham: "IRT",
  "Queens Blvd": "IND",
  Rockaway: "IND",
  "Sea Beach": "BMT",
  "Staten Island Railway": "SIR",
  "West End": "BMT",
  "White Plains Rd": "IRT",
};
const ROUTE_SORT_ORDER = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "6X",
  "7",
  "7X",
  "S",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "FX",
  "G",
  "J",
  "L",
  "M",
  "N",
  "Q",
  "SF",
  "R",
  "W",
  "SR",
  "SIR",
  "SIRX",
  "Z",
];
const ROUTE_SORT_INDEX = new Map(
  ROUTE_SORT_ORDER.map((route, index) => [route, index]),
);

export function formatStationDescription(value?: string, stationName?: string) {
  const displayValue = normalizeDisplayValue(value)
    .replace(/\s+-\s+Station$/i, "")
    .replace(/^B'way-Lafayette St$/i, "Broadway-Lafayette St")
    .replace(/^8th Ave$/i, "8 Av")
    .replace(/^42St\/Port Authority-Bus Terminal$/i, "42 St/Port Authority-Bus Terminal")
    .replace(/\s*-\s*/g, " - ");
  const normalizedStationName = stationName?.toUpperCase() ?? "";

  if (
    displayValue === "6 Av" ||
    normalizedStationName.includes("14ST-6AV")
  ) {
    return "14 St - 6 Av";
  }

  if (
    normalizedStationName.includes("14ST-8AV") ||
    normalizedStationName.includes("8AV-CNR-L")
  ) {
    return "8 Av - 14 St";
  }

  if (
    displayValue === "Borough Hall" &&
    normalizedStationName.includes("BOROUGHHALL")
  ) {
    return "Borough Hall/Court St";
  }

  if (
    displayValue === "Court St" &&
    normalizedStationName.includes("COURTST")
  ) {
    return "Borough Hall/Court St";
  }

  if (
    displayValue === "Court Sq" &&
    normalizedStationName.includes("COURTSQ-23ST")
  ) {
    return "Court Sq - 23 St";
  }

  if (
    normalizedStationName.includes("CORTLANDTST-BWY") ||
    normalizedStationName.includes("PARKPLACE-CLK") ||
    normalizedStationName.includes("WORLDTRADECENTER-8AV")
  ) {
    return "Chambers St–World Trade Ctr/Park Pl/Cortlandt St";
  }

  if (
    displayValue === "South Ferry" ||
    displayValue === "Whitehall St - South Ferry" ||
    normalizedStationName.includes("SOUTHFERRY") ||
    normalizedStationName.includes("WHITEHALLST-SOUTHFERRY")
  ) {
    return "Whitehall St - South Ferry";
  }

  return displayValue;
}

export function formatSubwayLine(value?: string) {
  const normalized = normalizeDisplayValue(value);

  if (normalized === "-") {
    return normalized;
  }

  const override = LINE_NAME_OVERRIDES[normalized];

  if (override) {
    return override;
  }

  const parts = normalized.split("-");
  const division = parts[0];
  const descriptor = parts.slice(2).join("-") || parts.slice(1).join("-");
  const readableDescriptor = descriptor
    .split("/")
    .map((segment) => LINE_SEGMENT_NAMES[segment] ?? titleCaseCode(segment))
    .filter(Boolean)
    .join(" / ");

  return [division, readableDescriptor]
    .filter(Boolean)
    .join(" ");
}

export function formatStationLineDisplay(value?: string, rawSubwayLine?: string) {
  const normalized = normalizeDisplayValue(value);

  if (normalized === "-") {
    return normalized;
  }

  return formatStationLineList(normalized, rawSubwayLine);
}

export function formatAssetCellValue(asset: MtaAsset, column: string) {
  const rawValue = asset[column];

  if (column === "station_description") {
    return formatStationDescription(rawValue, asset.station_name);
  }

  if (column === "subway_line") {
    if (isSharedArcherAvStation(asset)) {
      return "IND/BMT Archer Av";
    }

    return asset.station_line
      ? formatStationLineDisplay(asset.station_line, rawValue)
      : formatSubwayLine(rawValue);
  }

  return formatCommaList(rawValue || "-");
}

function isSharedArcherAvStation(asset: MtaAsset) {
  const stationName = asset.station_name?.toUpperCase() ?? "";

  return (
    stationName.includes("JAMAICACENTER-PARSONS/ARCHER") ||
    stationName.includes("SUTPHINBLVD-ARCHERAV-JFKAIRPORT")
  );
}

export function getAssetCoordinates(asset: MtaAsset) {
  const latitude = Number(asset.x_coordinate);
  const longitude = Number(asset.y_coordinate);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 40 ||
    latitude > 41 ||
    longitude > -72 ||
    longitude < -75
  ) {
    return null;
  }

  return { latitude, longitude };
}

export function getAssetMapStatus(asset: MtaAsset): AssetMapStatus {
  const statusText = [
    asset.service_status,
    asset.service_status_code,
    asset.notes,
    asset.alternative_route,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(construction|repair|rehab|rehabilitation|modernization|outage|closed|closure|temporar)/i.test(
      statusText,
    )
  ) {
    return "work";
  }

  return asset.ada_compliant === "YES" ? "accessible" : "not_accessible";
}

export function getAssetRoutes(asset: MtaAsset) {
  if (isWhitehallSouthFerryComplex(asset)) {
    return sortRoutes(["1", "R", "W"]);
  }

  const stationSpecificRoutes = getStationSpecificRoutes(asset);

  if (stationSpecificRoutes.length > 0) {
    return stationSpecificRoutes;
  }

  const complexRoutes = extractRoutesFromComplexDescription(
    asset.station_complex_description,
  );

  if (complexRoutes.length > 0) {
    return sortRoutes(complexRoutes);
  }

  if (asset.station_services) {
    return sortRoutes(normalizeRoutes(asset.station_services.split(",")));
  }

  const stationNameParts = asset.station_name?.split("-") ?? [];
  const routePart = stationNameParts.at(-1);

  if (!routePart) {
    return [];
  }

  return sortRoutes(normalizeRoutes(routePart.split("/")));
}

function isWhitehallSouthFerryComplex(asset: MtaAsset) {
  const stationName = asset.station_name?.toUpperCase() ?? "";
  const stationDescription = asset.station_description?.toLowerCase() ?? "";
  const complexDescription = asset.station_complex_description?.toLowerCase() ?? "";

  return (
    stationName.includes("WHITEHALLST-SOUTHFERRY") ||
    stationName.includes("SOUTHFERRY-7AV") ||
    stationDescription.includes("whitehall st-south ferry") ||
    stationDescription.includes("south ferry") ||
    complexDescription.includes("south ferry") ||
    complexDescription.includes("whitehall st")
  );
}

function getStationSpecificRoutes(asset: MtaAsset) {
  const stationName = asset.station_name?.toUpperCase() ?? "";
  const stationDescription = asset.station_description?.toLowerCase() ?? "";
  const subwayLine = asset.subway_line?.toUpperCase() ?? "";

  if (stationName.includes("34ST-PENNSTATION")) {
    return sortRoutes(["1", "2", "3", "A", "C", "E"]);
  }

  if (
    stationName.includes("LEXINGTONAV/59ST") ||
    stationName.includes("59ST-LEX")
  ) {
    return sortRoutes(["4", "5", "6", "N", "R", "W"]);
  }

  if (
    stationName.includes("CORTLANDTST-BWY") ||
    stationName.includes("PARKPLACE-CLK") ||
    stationName.includes("WORLDTRADECENTER-8AV")
  ) {
    return sortRoutes(["2", "3", "A", "C", "E", "R", "W"]);
  }

  if (
    stationName.includes("FRANKLINAV-FRK") ||
    stationName.includes("FRANKLINAV-8AV") ||
    stationDescription.includes("franklin av")
  ) {
    return sortRoutes(["C", "SF"]);
  }

  if (stationName.includes("14ST-UNIONSQ")) {
    return sortRoutes(["4", "5", "6", "L", "N", "Q", "R", "W"]);
  }

  if (stationName.includes("34ST-HERALDSQ")) {
    return sortRoutes(["B", "D", "F", "M", "N", "Q", "R", "W"]);
  }

  if (
    stationName.includes("TIMESSQ-42ST") ||
    stationName.includes("42ST/PORTAUTHORITY")
  ) {
    return sortRoutes(["1", "2", "3", "7", "S", "A", "C", "E", "N", "Q", "R", "W"]);
  }

  if (stationName.includes("49ST-BWY")) {
    return sortRoutes(["N", "R", "W"]);
  }

  if (stationName.includes("57ST-7AV-BWY")) {
    return sortRoutes(["N", "Q", "R", "W"]);
  }

  if (stationName.includes("ASTORIABLVD-AST")) {
    return sortRoutes(["N", "W"]);
  }

  if (stationName.includes("QUEENSBOROPLAZA")) {
    return sortRoutes(["7", "N", "W"]);
  }

  if (
    stationName.includes("5AV/53ST") ||
    stationDescription.includes("5 av/53 st") ||
    stationDescription.includes("5 av-53 st")
  ) {
    return sortRoutes(["E", "F"]);
  }

  if (
    stationName.includes("LEXINGTONAV/53ST") ||
    stationDescription.includes("lexington av/53 st") ||
    stationDescription.includes("lexington av-53 st")
  ) {
    return sortRoutes(["E"]);
  }

  if (
    stationName.includes("COURTSQ-23ST") ||
    (stationDescription.includes("court sq-23 st") &&
      subwayLine.includes("QUEENSBLVD"))
  ) {
    return sortRoutes(["E", "F"]);
  }

  if (
    stationName.includes("QUEENSPLAZA") ||
    stationDescription.includes("queens plaza")
  ) {
    return sortRoutes(["E", "F", "R"]);
  }

  if (
    stationName.includes("8AV-CNR-L") ||
    (stationDescription === "8 av - station" && subwayLine.includes("CANARSIE"))
  ) {
    return sortRoutes(["L"]);
  }

  if (
    stationName.includes("7AV-BRIGHTON") ||
    stationName.includes("7AV-BRI") ||
    (stationDescription === "7 av - station" && subwayLine.includes("BRIGHTON"))
  ) {
    return sortRoutes(["B", "Q"]);
  }

  if (
    stationName.includes("WORLDTRADECENTER") ||
    stationDescription.includes("world trade center")
  ) {
    return sortRoutes(["E"]);
  }

  if (
    stationName.includes("WHITEHALLST-SOUTHFERRY") ||
    stationName.includes("SOUTHFERRY-7AV") ||
    stationDescription.includes("south ferry") ||
    (stationDescription.includes("whitehall st") && subwayLine.includes("BROADWAY"))
  ) {
    return sortRoutes(["1", "R", "W"]);
  }

  if (
    stationName.includes("57ST-6AV") ||
    (stationDescription === "57 st - station" && subwayLine.includes("6AV"))
  ) {
    return sortRoutes(["M"]);
  }

  if (
    stationName.includes("LEXINGTONAV/63ST") ||
    stationDescription.includes("lexington av/63 st") ||
    stationDescription.includes("lexington av-63 st")
  ) {
    return sortRoutes(["M", "Q"]);
  }

  if (
    stationName.includes("ROOSEVELTISLAND") ||
    stationDescription.includes("roosevelt island")
  ) {
    return sortRoutes(["M"]);
  }

  if (
    stationName.includes("21ST-QUEENSBRIDGE") ||
    stationDescription.includes("21 st-queensbridge") ||
    stationDescription.includes("21 st queensbridge")
  ) {
    return sortRoutes(["M"]);
  }

  if (
    stationName.includes("BWAY-LAFAYETTEST") ||
    stationDescription.includes("b'way-lafayette")
  ) {
    return sortRoutes(["B", "D", "F", "M"]);
  }

  if (
    stationName.includes("BLEECKERST") ||
    stationDescription.includes("bleecker st")
  ) {
    return sortRoutes(["6"]);
  }

  return [];
}

export function getSubwayRouteIconPath(route: string) {
  const iconRoute = normalizeRouteIconName(route);

  return `/${encodeURIComponent(iconRoute)}.png`;
}

export function getAssetRouteSortKey(asset: MtaAsset) {
  const routes = getAssetRoutes(asset);
  const routeIndexes = routes
    .map((route) => ROUTE_SORT_INDEX.get(normalizeRouteIconName(route)))
    .filter((index): index is number => typeof index === "number");

  if (routeIndexes.length === 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.min(...routeIndexes);
}

function normalizeDisplayValue(value?: string) {
  return value?.trim() || "-";
}

function formatCommaList(value: string) {
  return value.replace(/,\s*/g, ", ");
}

function formatStationLineList(value: string, rawSubwayLine?: string) {
  const division = getLineDivision(rawSubwayLine);

  return value
    .split(",")
    .map((line) => formatStationLineName(line, division))
    .filter(Boolean)
    .join(", ");
}

function formatStationLineName(value: string, division: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (/^(BMT|IND|IRT|SIR)\s/i.test(normalized)) {
    return normalized.replace(/\s+Line$/i, "");
  }

  const lineName = normalized
    .replace(/^42nd St Line$/i, "42 St Shuttle")
    .replace(/\s+Line$/i, "")
    .replace(/^Broadway-7 Av$/i, "Broadway/7 Av")
    .replace(/\b(\d+)(?:st|nd|rd|th) St\b/gi, "$1 St");
  const lineDivision = STATION_LINE_DIVISIONS[lineName] ?? division;

  return [lineDivision, lineName].filter(Boolean).join(" ");
}

function getLineDivision(value?: string) {
  const normalized = normalizeDisplayValue(value).toUpperCase();

  if (normalized.startsWith("SIR")) {
    return "SIR";
  }

  const division = normalized.split("-")[0];

  return ["BMT", "IND", "IRT"].includes(division) ? division : "";
}

function extractRoutesFromComplexDescription(value?: string) {
  const matches = Array.from(value?.matchAll(/\(([^)]+)\)/g) ?? []);

  if (matches.length === 0) {
    return [];
  }

  return normalizeRoutes(
    matches.flatMap((match) => (match[1] ?? "").split(/[,\s/]+/)),
  );
}

function normalizeRoutes(routes: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const route of routes) {
    const cleanRoute = route.trim().toUpperCase();

    if (!cleanRoute || isInvalidRouteToken(cleanRoute) || seen.has(cleanRoute)) {
      continue;
    }

    seen.add(cleanRoute);
    normalized.push(cleanRoute);
  }

  return normalized;
}

function isInvalidRouteToken(route: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(route);
}

function sortRoutes(routes: string[]) {
  return [...routes].sort((a, b) => {
    const routeA = ROUTE_SORT_INDEX.get(normalizeRouteIconName(a));
    const routeB = ROUTE_SORT_INDEX.get(normalizeRouteIconName(b));

    if (typeof routeA === "number" || typeof routeB === "number") {
      if (typeof routeA !== "number") return 1;
      if (typeof routeB !== "number") return -1;
      return routeA - routeB;
    }

    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function normalizeRouteIconName(route: string) {
  if (route === "FS") return "SF";
  if (route === "H") return "SR";
  if (route === "SIRX") return "SIRExpress";
  return route;
}

function titleCaseCode(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([A-Z]+)(\d+)/g, "$1 $2")
    .replace(/(\d+)([A-Z]+)/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bAv\b/g, "Av")
    .replace(/\bSt\b/g, "St");
}
