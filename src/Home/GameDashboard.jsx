import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { animate, AnimatePresence, motion } from "framer-motion";
import GameCard from "./GameCard.jsx";
import { gameAssets } from "../data/GameAssets.js";
import { t } from "../i18n";

export default function GameDashboard({ config }) {
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [streaks, setStreaks] = useState({});
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);

    const enabledGames = config?.enabledGames ?? {};
    const activeGames = Object.entries(enabledGames)
        .filter(([_, enabled]) => enabled)
        .map(([id]) => id)
        .reverse();

    const stretch = activeGames.length <= 3;

    const loadStreaks = async () => {
        try {
            const nextStreaks = await invoke("get_streaks");
            setStreaks(nextStreaks ?? {});
        } catch (error) {
            console.error(t("logs.failedLoadStreaks"), error);
        }
    };

    function updateScrollButtons() {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateScrollButtons();
        el.addEventListener("scroll", updateScrollButtons);
        window.addEventListener("resize", updateScrollButtons);
        return () => {
            el.removeEventListener("scroll", updateScrollButtons);
            window.removeEventListener("resize", updateScrollButtons);
        };
    }, [activeGames]);

    useEffect(() => {
        let cleanup = null;
        loadStreaks();

        listen("aeon-streaks-updated", (event) => {
            const entry = event.payload;
            if (!entry?.gameId) {
                loadStreaks();
                return;
            }

            setStreaks(prev => ({
                ...prev,
                [entry.gameId]: entry
            }));
        }).then(unlisten => {
            cleanup = unlisten;
        });

        return () => cleanup?.();
    }, []);

    function scrollBy(amount) {
        const el = scrollRef.current;
        if (!el) return;
        const start = el.scrollLeft;
        const end = start + amount;
        animate(start, end, {
            duration: 0.4,
            ease: "easeInOut",
            onUpdate: (v) => { el.scrollLeft = v; }
        });
    }

    function onMouseDown(e) {
        isDragging.current = true;
        startX.current = e.pageX - scrollRef.current.offsetLeft;
        scrollLeft.current = scrollRef.current.scrollLeft;
        scrollRef.current.style.cursor = "grabbing";
    }

    function onMouseMove(e) {
        if (!isDragging.current) return;
        e.preventDefault();
        const x = e.pageX - scrollRef.current.offsetLeft;
        const walk = (x - startX.current) * 1.2;
        scrollRef.current.scrollLeft = scrollLeft.current - walk;
    }

    function onMouseUp() {
        isDragging.current = false;
        if (scrollRef.current) scrollRef.current.style.cursor = "grab";
    }

    if (activeGames.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <span className="text-aeon-primary-100 text-lg font-semibold">{t("home.dashboardTitle")}</span>
            <div className="relative">
                <AnimatePresence>
                    {canScrollLeft && !stretch && (
                        <motion.button
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => scrollBy(-280)}
                            title={t("home.scrollLeft")}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 bg-aeon-surface-400 border border-aeon-surface-300 rounded-full p-1 hover:cursor-pointer"
                        >
                            <CaretLeft size={16} className="text-aeon-primary-100" />
                        </motion.button>
                    )}
                </AnimatePresence>

                <div
                    ref={scrollRef}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    className={`flex gap-2 w-full select-none ${!stretch ? "overflow-x-auto scrollbar-none pb-2 cursor-grab" : ""}`}
                >
                    {activeGames.map((id, i) => (
                        <motion.div
                            key={id}
                            layout
                            transition={{ layout: { duration: 0.6, ease: "easeInOut" } }}
                            className={`${stretch ? "flex-1" : "flex-none w-70"}`}
                        >
                            <GameCard
                                gameId={id}
                                banner={gameAssets[id].banner}
                                streak={streaks[id]?.currentStreak ?? 0}
                                index={i}
                                stretch={stretch}
                                showCheckin={!config.settings.checkin}
                            />
                        </motion.div>
                    ))}
                </div>

                <AnimatePresence>
                    {canScrollRight && !stretch && (
                        <motion.button
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => scrollBy(280)}
                            title={t("home.scrollRight")}
                            className="absolute right-0 top-1/2 -translate-y-1/2 hover:cursor-pointer translate-x-3 z-10 bg-aeon-surface-400 border border-aeon-surface-300 rounded-full p-1"
                        >
                            <CaretRight size={16} className="text-aeon-primary-100" />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
