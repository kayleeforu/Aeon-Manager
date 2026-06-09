import { motion } from "framer-motion";
import "../App.css";
import GameToggleSwitch from "./GameToggleSwitch.jsx";
import games from "../data/Games.js";
import { REGION_OPTIONS } from "../data/Regions.js";
import { gameName, t } from "../i18n";

export default function GameBanner({
    image,
    icon,
    id,
    cookiesExist = false,
    config,
    setConfig,
    selectedRegions = [],
    onToggleRegion,
    index = 0,
}) {
    const foundGame = games.find(game => game.id === id);
    const enabled = config?.enabledGames?.[id] ?? false;
    const displayName = gameName(id, foundGame?.name);
    const status = enabled ? t("games.enabled") : t("games.disabled");

    if (!foundGame) {
        return <div className="relative h-40 overflow-hidden rounded-lg bg-aeon-surface-100 text-aeon-primary-100"><p className="p-4">{t("games.gameNotFound")}</p></div>;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
                duration: 0.4, 
                delay: index * 0.1, 
                ease: "easeOut" 
            }}
            className="group relative min-h-44 overflow-hidden rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 transition-colors"
        >
            <div className="relative h-44 overflow-hidden">
                <img src={image} className="object-cover object-center h-full w-full transition-transform duration-600 group-hover:scale-105" alt={t("home.gameBannerAlt", { game: displayName })}/>
                <div className="absolute inset-0 bg-black/35"/>
                <div className="absolute inset-0 bg-linear-to-t from-aeon-surface-500 via-aeon-surface-500/45 to-transparent"/>
                <div className="absolute top-3 right-3">
                    <span
                        className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 px-3 py-1 text-sm bg-aeon-surface-500 text-aeon-primary-600/80 pointer-events-none"
                        style={{ transition: "none" }}
                    >
                        {status}
                    </span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end gap-4 px-4 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <img
                            src={icon}
                            className="h-13 w-13 rounded-lg object-cover object-center border border-aeon-surface-200 shrink-0"
                            alt={displayName}
                        />
                        <div className="flex flex-col min-w-0">
                            <p className="text-aeon-primary-100 text-2xl leading-tight truncate">
                                {displayName}
                            </p>
                        </div>
                    </div>
                    <GameToggleSwitch
                        gameId={foundGame.id}
                        gameName={displayName}
                        config={config}
                        setConfig={setConfig}
                    />
                </div>
            </div>

            {enabled && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="border-t border-aeon-surface-300 px-4 py-3"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="mr-1 text-xs font-medium text-aeon-primary-100/42">
                            {t("games.regions")}
                        </span>
                        {REGION_OPTIONS.map(region => (
                            <RegionChip
                                key={region.value}
                                label={t(region.labelKey)}
                                active={selectedRegions.includes(region.value)}
                                onClick={() => onToggleRegion?.(id, region.value)}
                            />
                        ))}
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}

function RegionChip({ label, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex h-8 cursor-pointer items-center justify-center rounded-lg px-3 text-xs font-medium transition-colors duration-200 ${
                active
                    ? "bg-aeon-primary-300 text-aeon-surface-500 hover:bg-aeon-primary-400"
                    : "bg-aeon-surface-400 text-aeon-primary-100/62 hover:bg-aeon-surface-300 hover:text-aeon-primary-100"
            }`}
        >
            {label}
        </button>
    );
}
