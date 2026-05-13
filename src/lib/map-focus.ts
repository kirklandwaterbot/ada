export const MAP_FOCUS_EVENT = "mta-access-map-focus";

export type MapFocusDetail =
  | {
      code: string;
      kind: "asset";
    }
  | {
      key: string;
      kind: "planned";
    };

export function focusAssetOnMap(code: string) {
  dispatchMapFocusEvent({ code, kind: "asset" });
}

export function focusPlannedStationOnMap(key: string) {
  dispatchMapFocusEvent({ key, kind: "planned" });
}

function dispatchMapFocusEvent(detail: MapFocusDetail) {
  window.dispatchEvent(new CustomEvent<MapFocusDetail>(MAP_FOCUS_EVENT, { detail }));
}
