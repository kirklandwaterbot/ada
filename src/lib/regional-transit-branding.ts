export type RegionalTransitAgency =
  | "CTrail"
  | "EWR AirTrain"
  | "JFK AirTrain"
  | "LIRR"
  | "MNR"
  | "NJ Transit"
  | "PATH";

export type RegionalTransitBadge = {
  imagePath: string;
  label: string;
};

type RegionalTransitBranding = {
  lines: RegionalTransitBadge[];
};

const badge = (label: string, imagePath: string): RegionalTransitBadge => ({
  imagePath,
  label,
});

const LIRR_LINES: Record<string, RegionalTransitBadge[]> = {
  "1": [badge("Babylon Branch", "/LIRRBabylon.png")],
  BY: [badge("Babylon Branch", "/LIRRBabylon.png")],
  "2": [badge("Hempstead Branch", "/LIRRHempstead.png")],
  HM: [badge("Hempstead Branch", "/LIRRHempstead.png")],
  "3": [badge("Oyster Bay Branch", "/LIRROysterBay.png")],
  OB: [badge("Oyster Bay Branch", "/LIRROysterBay.png")],
  "4": [badge("Ronkonkoma Branch", "/LIRRRonkonkoma.png")],
  RK: [badge("Ronkonkoma Branch", "/LIRRRonkonkoma.png")],
  "5": [badge("Montauk Branch", "/LIRRMontauk.png")],
  MK: [badge("Montauk Branch", "/LIRRMontauk.png")],
  "6": [badge("Long Beach Branch", "/LIRRLongBeach.png")],
  LB: [badge("Long Beach Branch", "/LIRRLongBeach.png")],
  "7": [badge("Far Rockaway Branch", "/LIRRFarRockaway.png")],
  FR: [badge("Far Rockaway Branch", "/LIRRFarRockaway.png")],
  "8": [badge("West Hempstead Branch", "/LIRRWestHempstead.png")],
  WH: [badge("West Hempstead Branch", "/LIRRWestHempstead.png")],
  "9": [badge("Port Washington Branch", "/LIRRPortWashington.png")],
  PW: [badge("Port Washington Branch", "/LIRRPortWashington.png")],
  "10": [badge("Port Jefferson Branch", "/LIRRPortJefferson.png")],
  PJ: [badge("Port Jefferson Branch", "/LIRRPortJefferson.png")],
  "13": [badge("Greenport Branch", "/LIRRGreenport.png")],
  GY: [badge("Greenport Branch", "/LIRRGreenport.png")],
  BT: [badge("Belmont Park", "/LIRRBelmontPark.png")],
};

const MNR_LINES: Record<string, RegionalTransitBadge[]> = {
  "1": [badge("Hudson Line", "/MNRHudson.png")],
  HU: [badge("Hudson Line", "/MNRHudson.png")],
  "2": [badge("Harlem Line", "/MNRHarlem.png")],
  HA: [badge("Harlem Line", "/MNRHarlem.png")],
  WA: [badge("Harlem Line", "/MNRHarlem.png")],
  "3": [badge("New Haven Line", "/MNRNewHaven.png")],
  NH: [badge("New Haven Line", "/MNRNewHaven.png")],
  "4": [badge("New Canaan Branch", "/MNRNewCanaan.png")],
  NC: [badge("New Canaan Branch", "/MNRNewCanaan.png")],
  "5": [badge("Danbury Branch", "/MNRDanbury.png")],
  DN: [badge("Danbury Branch", "/MNRDanbury.png")],
  "6": [badge("Waterbury Branch", "/MNRWaterbury.png")],
  WB: [badge("Waterbury Branch", "/MNRWaterbury.png")],
};

const PATH_LINES: Record<string, RegionalTransitBadge[]> = {
  blue: [badge("HOB–33", "/NewYorkSubwayPATHHob33.png")],
  BLU: [badge("HOB–33", "/NewYorkSubwayPATHHob33.png")],
  green: [badge("HOB–WTC", "/NewYorkSubwayPATHHobwtc.png")],
  GRE: [badge("HOB–WTC", "/NewYorkSubwayPATHHobwtc.png")],
  yellow: [badge("JSQ–33", "/NewYorkSubwayPATHJsq33.png")],
  YEL: [badge("JSQ–33", "/NewYorkSubwayPATHJsq33.png")],
  red: [badge("NWK–WTC", "/NewYorkSubwayPATHNwkwtc.png")],
  RED: [badge("NWK–WTC", "/NewYorkSubwayPATHNwkwtc.png")],
};

const JFK_AIRTRAIN_LINES: Record<string, RegionalTransitBadge[]> = {
  HOWARD: [badge("Howard Beach service", "/AirTrainJFKHowardBeach.png")],
  JAMAICA: [badge("Jamaica service", "/AirTrainJFKJamaica.png")],
  TERMINALS: [badge("All Terminals loop", "/AirTrainJFKAllTerminals.png")],
};

const EWR_AIRTRAIN_LINES: Record<string, RegionalTransitBadge[]> = {
  AIRTRAIN: [badge("AirTrain Newark", "/AirTrainEWR.png")],
};

const NJ_TRANSIT_LINES: Record<string, RegionalTransitBadge[]> = {
  "1": [badge("Atlantic City Rail Line", "/NJTAtlanticCity.png")],
  "2": [badge("Montclair–Boonton Line", "/NJTMontclairBoonton.png")],
  "3": [badge("Montclair–Boonton Line", "/NJTMontclairBoonton.png")],
  "HBLR-HT": [
    badge("Hoboken–Tonnelle Avenue", "/NJTLRHobokenTonnelle.png"),
  ],
  "HBLR-WST": [
    badge("West Side Avenue–Tonnelle Avenue", "/NJTLRWestSideTonnelle.png"),
  ],
  "HBLR-8H": [badge("8th Street–Hoboken", "/NJTLR8thStHoboken.png")],
  "5-main": [badge("Main Line", "/NJTMainLine.png")],
  "5-bergen": [badge("Bergen County Line", "/NJTBergenCounty.png")],
  "6": [badge("Port Jervis Line", "/NJTPortJervis.png")],
  "7": [badge("Morris & Essex Line", "/NJTMorrisEssex.png")],
  "8": [badge("Gladstone Branch", "/NJTGladstone.png")],
  "9": [badge("Meadowlands Rail Line", "/NJTMeadowlands.png")],
  "10": [badge("Northeast Corridor", "/NJTNorthEastCorridor.png")],
  "11": [badge("North Jersey Coast Line", "/NJTNorthJerseyCoast.png")],
  "12": [badge("North Jersey Coast Line", "/NJTNorthJerseyCoast.png")],
  "NLR-NCS": [badge("Newark City Subway", "/NJTLRNewark.png")],
  "NLR-BSE": [
    badge("Broad Street Extension", "/NJTLRNewarkBroad.png"),
  ],
  "14": [badge("Pascack Valley Line", "/NJTPascackValley.png")],
  "15": [badge("Princeton Shuttle", "/NJTPrinceton.png")],
  "16": [badge("Raritan Valley Line", "/NJTRaritanValley.png")],
  "17": [badge("River LINE", "/NJTLRRiverLine.png")],
};

const CTRAIL_LINES: Record<string, RegionalTransitBadge[]> = {
  HART: [badge("Hartford Line", "/CTRailHartfordLine.png")],
  SLE: [badge("Shore Line East", "/CTRailShoreLineEast.png")],
};

const LINE_BADGES: Record<
  RegionalTransitAgency,
  Record<string, RegionalTransitBadge[]>
> = {
  CTrail: CTRAIL_LINES,
  "EWR AirTrain": EWR_AIRTRAIN_LINES,
  "JFK AirTrain": JFK_AIRTRAIN_LINES,
  LIRR: LIRR_LINES,
  MNR: MNR_LINES,
  "NJ Transit": NJ_TRANSIT_LINES,
  PATH: PATH_LINES,
};

export function getRegionalTransitBranding(
  agency: RegionalTransitAgency,
  branchIds: string,
  serviceRouteIds = "",
): RegionalTransitBranding {
  const resolvedRouteIds =
    agency === "NJ Transit" && serviceRouteIds
      ? [...splitIds(branchIds), ...splitIds(serviceRouteIds)]
      : splitIds(serviceRouteIds || branchIds);
  const routeIds = resolvedRouteIds.filter(
    (routeId) =>
      !(
        agency === "NJ Transit" &&
        ((routeId === "4" && resolvedRouteIds.some((id) => id.startsWith("HBLR-"))) ||
          (routeId === "13" && resolvedRouteIds.some((id) => id.startsWith("NLR-"))))
      ) &&
      !(agency === "LIRR" && routeId === "12"),
  );
  const lines = routeIds
    .flatMap((routeId) => LINE_BADGES[agency][routeId] || [])
    .filter(
      (line, index, items) =>
        items.findIndex((item) => item.imagePath === line.imagePath) === index,
    );

  return { lines };
}

function splitIds(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
