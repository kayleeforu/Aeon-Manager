export const REGION_OPTIONS = [
    { value: "Europe", labelKey: "regions.europe" },
    { value: "Asia", labelKey: "regions.asia" },
    { value: "America", labelKey: "regions.america" },
    { value: "TW, HK, MO", labelKey: "regions.twHkMo" },
];

export function cleanRegionList(regions) {
    if (!Array.isArray(regions)) return [];

    const cleaned = [];

    for (const region of regions) {
        const value = typeof region === "string" ? region.trim() : "";
        if (value && !cleaned.includes(value)) {
            cleaned.push(value);
        }
    }

    return cleaned;
}

export function normalizeGameRegions(regionsSetting, gameIds = []) {
    if (Array.isArray(regionsSetting)) {
        const legacyRegions = cleanRegionList(regionsSetting);
        if (legacyRegions.length === 0) return {};

        const regionsByGame = {};
        for (const gameId of gameIds) {
            regionsByGame[gameId] = legacyRegions;
        }

        return regionsByGame;
    }

    if (!regionsSetting || typeof regionsSetting !== "object") return {};

    const regionsByGame = {};

    for (const gameId of gameIds) {
        const regions = cleanRegionList(regionsSetting[gameId]);
        if (regions.length > 0) {
            regionsByGame[gameId] = regions;
        }
    }

    return regionsByGame;
}

export function selectedRegionsForGame(regionsSetting, gameId) {
    if (Array.isArray(regionsSetting)) return cleanRegionList(regionsSetting);
    if (!regionsSetting || typeof regionsSetting !== "object") return [];

    return cleanRegionList(regionsSetting[gameId]);
}

export function toggleRegionForGame(regionsSetting, gameIds, gameId, region) {
    const regionsByGame = normalizeGameRegions(regionsSetting, gameIds);
    const currentRegions = selectedRegionsForGame(regionsByGame, gameId);

    if (currentRegions.includes(region)) {
        regionsByGame[gameId] = currentRegions.filter((currentRegion) => currentRegion !== region);
    } else {
        regionsByGame[gameId] = [...currentRegions, region];
    }

    return regionsByGame;
}
