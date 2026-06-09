import { useEffect, useState } from "react";
import { motion, animate } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import games from "../data/Games.js";
import { gameName as localizedGameName, t } from "../i18n";

function getStreakStyle(streak) {
    if (streak >= 90) return { color: "#ffd700" };
    if (streak >= 30) return { color: "#c084fc" };
    if (streak >= 15) return { color: "#60a5fa" };
    if (streak >= 3) return { color: "#4ade80" };
    return { color: "#94a3b8" };
}

export default function GameCard({ gameId, banner, streak = 0, index = 0, stretch = false, showCheckin }) {
    const [rewards, setRewards] = useState(null);
    const [loading, setLoading] = useState(true);
    const [displayStreak, setDisplayStreak] = useState(0);

    const streakStyle = getStreakStyle(streak);
    const game = games.find(g => g.id === gameId);
    const displayName = localizedGameName(gameId);

    useEffect(() => {
        const controls = animate(0, streak, {
            duration: 2.34,
            ease: "easeInOut",
            onUpdate: (v) => setDisplayStreak(Math.floor(v))
        });
        return () => controls.stop();
    }, [streak]);

    useEffect(() => {
        if (!game?.homeEndpoint) return;

        async function fetchRewards() {
            try {
                const raw = await invoke("fetch_checkin_rewards", { gameId });
                const data = JSON.parse(raw);
                const awards = data?.data?.awards;
                if (!awards) return;

                const utc8Date = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
                const todayIndex = utc8Date.getDate() - 1;

                setRewards({
                    today: awards[todayIndex] || null,
                    tomorrow: awards[todayIndex + 1] || null
                });
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }

        fetchRewards();
    }, [game, gameId]);

    async function handleManualCheckin() {
        if (!game?.checkInURL) return;

        try {
            await invoke("record_checkin_streak", { gameId });
        } catch (error) {
            console.error(t("logs.failedUpdateStreak"), error);
        }

        openUrl(game.checkInURL);
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: "easeOut"
            }}
            className={`relative h-54 overflow-hidden rounded-lg border border-aeon-surface-300 w-full ${!stretch ? "max-w-70" : ""}`}
        >
            <img src={banner} className="object-cover object-center h-full w-full" alt={t("home.gameBannerAlt", { game: displayName })} />
            <div className="absolute inset-0 bg-black/40" />

            <div className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-lg border border-[rgba(74,58,73,0.45)] bg-[rgba(10,0,10,0.48)] px-2.5 py-1.5 text-xs font-medium leading-none text-aeon-primary-100">
                <span className="leading-none">{t("home.streak")}</span>
                <span className="leading-none" style={{ color: streakStyle.color }}>{displayStreak}</span>
                <span className="leading-none">{t("home.days")}</span>
            </div>

            {showCheckin && (
                <button
                    type="button"
                    className="absolute top-3 right-3 inline-flex items-center justify-center gap-2 rounded-lg border border-[rgba(74,58,73,0.45)] bg-[rgba(10,0,10,0.4)] px-2.5 py-1.5 text-xs font-medium leading-none text-white/80 transition-colors duration-200 hover:bg-[rgba(10,0,10,0.55)] hover:border-[rgba(90,74,89,0.6)] cursor-pointer"
                    onClick={handleManualCheckin}
                >
                    <span className="leading-none text-white/80">{t("home.checkIn")}</span>
                </button>
            )}

            {!loading && rewards && (
                <div className="absolute bottom-0 left-0 right-0 flex justify-between items-end px-3 py-2 bg-linear-to-t from-black/80 to-transparent">
                    <RewardBadge label={t("home.today")} reward={rewards.today} />
                    {rewards.tomorrow && <RewardBadge label={t("home.tomorrow")} reward={rewards.tomorrow} align="right" />}
                </div>
            )}
        </motion.div>
    );
}

function RewardBadge({ label, reward, align = "left" }) {
    if (!reward) return null;

    return (
        <div className={`flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
            <img src={reward.icon} className="h-8 w-8 rounded-md border border-white/20" alt={reward.name} />

            <div className={align === "right" ? "text-right" : ""}>
                <p className="text-white/55 text-[10px]">{label}</p>
                <p className="text-white text-xs font-medium leading-tight">{reward.name}</p>
                <p className="text-white/65 text-[10px]">{t("home.rewardQuantity", { count: reward.cnt })}</p>
            </div>
        </div>
    );
}
