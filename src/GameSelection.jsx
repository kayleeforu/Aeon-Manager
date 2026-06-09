import "./App.css";
import { motion } from "framer-motion";
import { useRef } from "react";
import GameBanner from "./GameSelection/GameBanner.jsx";
import { gameAssets } from "./data/GameAssets.js";
import { normalizeGameRegions, toggleRegionForGame } from "./data/Regions.js";
import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";

export default function GameSelection({ cookiesExist, config, setConfig, onOpenCookies }) {
    const gameIds = Object.keys(gameAssets);
    const enabledCount = gameIds.filter(id => config?.enabledGames?.[id]).length;
    const allEnabled = enabledCount === gameIds.length;
    const allDisabled = enabledCount === 0;
    const gameRegions = normalizeGameRegions(config?.settings?.regions, gameIds);
    const regionsRef = useRef(gameRegions);
    regionsRef.current = gameRegions;

    const updateAllGames = async (enabled) => {
        const previousGames = config?.enabledGames ?? {};
        const nextGames = gameIds.reduce((games, id) => ({ ...games, [id]: enabled }), {});

        setConfig(prev => ({
            ...prev,
            enabledGames: { ...prev.enabledGames, ...nextGames }
        }));

        try {
            await Promise.all(gameIds.map(gameId => invoke("update_game", { gameId, enabled })));
        } catch (e) {
            console.error(t("logs.configSaveError"), e);
            setConfig(prev => ({
                ...prev,
                enabledGames: { ...prev.enabledGames, ...previousGames }
            }));
        }
    };

    const updateGameRegion = async (gameId, region) => {
        const previousRegions = regionsRef.current;
        const nextRegions = toggleRegionForGame(regionsRef.current, gameIds, gameId, region);
        regionsRef.current = nextRegions;

        setConfig(prev => ({
            ...prev,
            settings: { ...prev.settings, regions: nextRegions }
        }));

        try {
            await invoke("update_config", { option: "regions", value: nextRegions });
        } catch (e) {
            console.error(t("logs.configSaveError"), e);
            regionsRef.current = previousRegions;
            setConfig(prev => ({
                ...prev,
                settings: { ...prev.settings, regions: previousRegions }
            }));
        }
    };

    return (
        <div className="w-full flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between gap-3 border-b border-aeon-surface-300 pb-3">
                <span className="text-aeon-primary-100/40 text-sm">{t("games.enabledCount", { enabled: enabledCount, total: gameIds.length })}</span>
                <div className="flex items-center gap-2">
                    {cookiesExist && (
                        <motion.button
                            type="button"
                            onClick={onOpenCookies}
                            whileTap={{ scale: 0.96 }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 px-3 py-1 text-xs font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:text-aeon-primary-100 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-9 min-w-24 bg-aeon-surface-500"
                        >
                            {t("games.cookiesReady")}
                        </motion.button>
                    )}
                    <GameActionButton onClick={() => updateAllGames(true)} disabled={allEnabled}>
                        {t("games.enableAll")}
                    </GameActionButton>
                    <GameActionButton onClick={() => updateAllGames(false)} disabled={allDisabled}>
                        {t("games.disableAll")}
                    </GameActionButton>
                </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {gameIds.map((id, index) => (
                    <GameBanner
                        key={id}
                        index={index}
                        id={id}
                        image={gameAssets[id].banner}
                        icon={gameAssets[id].icon}
                        cookiesExist={cookiesExist}
                        config={config}
                        setConfig={setConfig}
                        selectedRegions={gameRegions[id] ?? []}
                        onToggleRegion={updateGameRegion}
                    />
                ))}
            </div>
        </div>
    );
}

function GameActionButton({ children, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-3 py-1 text-xs font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:text-aeon-primary-100 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-9 min-w-24 disabled:hover:bg-aeon-surface-500 disabled:hover:text-aeon-primary-100/70"
        >
            {children}
        </button>
    );
}
