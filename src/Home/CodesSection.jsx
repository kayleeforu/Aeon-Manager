import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ArrowClockwise, CaretDown, CaretUp, Check, Copy, WarningCircle } from "@phosphor-icons/react";
import { gameAssets } from "../data/GameAssets.js";
import games from "../data/Games.js";
import { selectedRegionsForGame } from "../data/Regions.js";
import { gameName as localizedGameName, t } from "../i18n";

const STATUS_LABEL_KEYS = {
    redeemed: "codes.statuses.redeemed",
    already_redeemed: "codes.statuses.alreadyRedeemed",
    failed: "codes.statuses.failed",
    expired: "codes.statuses.expired",
    missing_role: "codes.statuses.missingRole",
    unsupported: "codes.statuses.unsupported",
};

function copyStorageKey(gameId, code) {
    return `copied:${gameId}:${code}`;
}

function manualStatusStorageKey(gameId, code) {
    return `manualRedeemed:${gameId}:${code}`;
}

function formatDateTime(timestamp) {
    if (!timestamp) return t("common.pending");

    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(timestamp * 1000));
}

function gameName(gameId) {
    return localizedGameName(gameId, games.find(game => game.id === gameId)?.name);
}

function canAutoRedeemGame(gameId) {
    return !!games.find(game => game.id === gameId)?.redeemURL;
}

function isSuccessful(status) {
    return status === "redeemed" || status === "already_redeemed";
}

function isRetryable(status) {
    return status === "failed" || status === "missing_role";
}

function historyEntryKey(entry) {
    return `${entry.gameId}:${entry.region}:${entry.code}`;
}

function readableMessage(message) {
    const trimmed = String(message ?? "").trim();
    if (!trimmed) return "";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isCodeExpired(code) {
    return code.expiresAt && code.expiresAt * 1000 <= Date.now();
}

function sortCodes(codes) {
    return [...codes].sort((a, b) => {
        return (b.addedAt ?? 0) - (a.addedAt ?? 0);
    });
}

export default function CodesSection({ config }) {
    const enabledGames = config?.enabledGames ?? {};
    const autoRedeem = config?.settings?.redeemcodes ?? false;
    const regionsByGame = config?.settings?.regions ?? {};

    const activeGames = Object.entries(enabledGames)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id)
        .reverse();

    const [activeTab, setActiveTab] = useState(activeGames[0] ?? null);
    const [codes, setCodes] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [retryingKey, setRetryingKey] = useState(null);
    const [error, setError] = useState(null);

    const currentTab = activeGames.includes(activeTab) ? activeTab : activeGames[0];
    const currentTabAutoRedeem = autoRedeem && canAutoRedeemGame(currentTab);

    const codesByGame = useMemo(() => {
        return codes.reduce((grouped, code) => {
            if (!grouped[code.gameId]) grouped[code.gameId] = [];
            grouped[code.gameId].push(code);
            return grouped;
        }, {});
    }, [codes]);

    const historyByGame = useMemo(() => {
        return history.reduce((grouped, entry) => {
            if (!grouped[entry.gameId]) grouped[entry.gameId] = [];
            grouped[entry.gameId].push(entry);
            return grouped;
        }, {});
    }, [history]);

    const loadData = async ({ runNow = false, quiet = false } = {}) => {
        try {
            if (!quiet) {
                setLoading(true);
                setError(null);
            }

            if (runNow && autoRedeem) {
                setRefreshing(true);
                await invoke("run_code_redemption_now");
            }

            const [activeCodes, redemptionHistory] = await Promise.all([
                invoke("get_redemption_codes"),
                invoke("get_code_redemption_history"),
            ]);

            setCodes(Array.isArray(activeCodes) ? activeCodes : []);
            setHistory(Array.isArray(redemptionHistory) ? redemptionHistory : []);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const retryHistoryEntry = async (entry) => {
        const key = historyEntryKey(entry);

        try {
            setRetryingKey(key);
            setError(null);
            await invoke("retry_code_redemption", {
                code: entry.code,
                gameId: entry.gameId,
                region: entry.region,
            });
            await loadData({ quiet: true });
        } catch (err) {
            setError(String(err));
        } finally {
            setRetryingKey(null);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        let cleanup = null;

        listen("aeon-code-redemption-updated", () => {
            loadData({ quiet: true });
        }).then(unlisten => {
            cleanup = unlisten;
        });

        return () => cleanup?.();
    }, [autoRedeem]);

    if (activeGames.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <span className="text-aeon-primary-100 text-lg font-semibold">
                    {currentTabAutoRedeem ? t("codes.redeemedCodes") : t("codes.redemptionCodes")}
                </span>
                <button
                    onClick={() => loadData({ runNow: currentTabAutoRedeem, quiet: true })}
                    disabled={refreshing || loading}
                    className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0"
                    title={currentTabAutoRedeem ? t("codes.refreshHistory") : t("codes.refreshCodes")}
                >
                    <ArrowClockwise size={15} className={refreshing ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="border border-aeon-surface-300 rounded-lg overflow-hidden flex min-h-55 max-h-80">
                <GameSidebar
                    activeGames={activeGames}
                    currentTab={currentTab}
                    onSelect={setActiveTab}
                    autoRedeem={autoRedeem}
                    codesByGame={codesByGame}
                    historyByGame={historyByGame}
                />
                <CodePanel
                    key={`${currentTab}-${currentTabAutoRedeem}`}
                    gameId={currentTab}
                    autoRedeem={currentTabAutoRedeem}
                    selectedRegions={selectedRegionsForGame(regionsByGame, currentTab)}
                    codes={codesByGame[currentTab] ?? []}
                    history={historyByGame[currentTab] ?? []}
                    loading={loading}
                    error={error}
                    retryingKey={retryingKey}
                    onRetry={retryHistoryEntry}
                />
            </div>
        </div>
    );
}

function GameSidebar({ activeGames, currentTab, onSelect, autoRedeem, codesByGame, historyByGame }) {
    return (
        <div className="flex flex-col border-r border-aeon-surface-300 shrink-0 overflow-y-auto">
            {activeGames.map(id => {
                const useHistory = autoRedeem && canAutoRedeemGame(id);

                return (
                    <GameTab
                        key={id}
                        id={id}
                        isActive={currentTab === id}
                        onSelect={onSelect}
                        autoRedeem={useHistory}
                        count={useHistory ? (historyByGame[id]?.length ?? 0) : (codesByGame[id]?.length ?? 0)}
                    />
                );
            })}
        </div>
    );
}

function GameTab({ id, isActive, onSelect, autoRedeem, count }) {
    const icon = gameAssets[id]?.icon;

    return (
        <button
            onClick={() => onSelect(id)}
            className={`relative flex items-center gap-2.5 px-3 py-3 text-sm transition-colors text-left border-b border-aeon-surface-300 last:border-b-0
                ${isActive
                    ? "text-aeon-primary-100 bg-aeon-surface-400/30"
                    : "text-aeon-primary-100/40 hover:text-aeon-primary-100/70 hover:bg-aeon-surface-400/60"
                }`}
        >
            <img src={icon} className="h-7 w-7 rounded-md object-cover border shrink-0" alt={gameName(id)} />
            <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium whitespace-nowrap">{gameName(id)}</span>
                <span className="text-[10px] text-aeon-primary-100/40">
                    {count} {autoRedeem ? t("codes.history") : t("codes.active")}
                </span>
            </div>
        </button>
    );
}

function CodePanel({ gameId, autoRedeem, selectedRegions, codes, history, loading, error, retryingKey, onRetry }) {
    return (
        <div className="flex-1 overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="p-3"
            >
                {error && <ErrorMessage error={error} />}
                {!error && loading && <p className="text-aeon-primary-100/40 text-sm py-4 text-center">{t("codes.loading")}</p>}
                {!error && !loading && autoRedeem && (
                    <AutoRedeemView
                        gameId={gameId}
                        history={history}
                        selectedRegions={selectedRegions}
                        retryingKey={retryingKey}
                        onRetry={onRetry}
                    />
                )}
                {!error && !loading && !autoRedeem && (
                    <ManualRedeemView gameId={gameId} codes={codes} />
                )}
            </motion.div>
        </div>
    );
}

function ErrorMessage({ error }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <WarningCircle size={16} className="shrink-0" />
            <span className="line-clamp-2">{error}</span>
        </div>
    );
}

function ManualRedeemView({ gameId, codes }) {
    const game = games.find(g => g.id === gameId);
    const canRedeem = !!game?.redeemURL;
    const [markedCodes, setMarkedCodes] = useState(() => {
        const initial = new Set();
        codes.forEach(code => {
            if (
                localStorage.getItem(manualStatusStorageKey(gameId, code.code)) === "true"
                || localStorage.getItem(copyStorageKey(gameId, code.code)) === "true"
            ) {
                initial.add(`${gameId}:${code.code}`);
            }
        });
        return initial;
    });

    useEffect(() => {
        setMarkedCodes(prev => {
            const next = new Set(prev);
            codes.forEach(code => {
                if (
                    localStorage.getItem(manualStatusStorageKey(gameId, code.code)) === "true"
                    || localStorage.getItem(copyStorageKey(gameId, code.code)) === "true"
                ) {
                    next.add(`${gameId}:${code.code}`);
                }
            });
            return next;
        });
    }, [codes, gameId]);

    if (codes.length === 0) {
        return <p className="text-aeon-primary-100/40 text-sm py-4 text-center">{t("codes.noActiveCodes")}</p>;
    }

    const activeCodes = sortCodes(codes.filter(code => !isCodeExpired(code)));
    const failedCodes = activeCodes.filter(code => !markedCodes.has(`${gameId}:${code.code}`));
    const succeededCodes = activeCodes.filter(code => markedCodes.has(`${gameId}:${code.code}`));

    const setMarked = (entry, marked) => {
        const key = `${gameId}:${entry.code}`;
        const storageKey = manualStatusStorageKey(gameId, entry.code);

        if (marked) {
            localStorage.setItem(storageKey, "true");
            setMarkedCodes(prev => new Set([...prev, key]));
            return;
        }

        localStorage.removeItem(storageKey);
        localStorage.removeItem(copyStorageKey(gameId, entry.code));
        setMarkedCodes(prev => {
            const next = new Set(prev);
            next.delete(key);
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-3">
            <HistoryGroup label={t("codes.notRedeemedCodes")} entries={failedCodes}>
                {failedCodes.map((entry, index) => (
                    <CodeCard
                        key={`${entry.gameId}:${entry.code}`}
                        entry={entry}
                        game={game}
                        index={index}
                        canRedeem={canRedeem}
                        marked={false}
                        onMarkedChange={(marked) => setMarked(entry, marked)}
                    />
                ))}
            </HistoryGroup>

            <HistoryGroup label={t("codes.succeededCodes")} entries={succeededCodes}>
                {succeededCodes.map((entry, index) => (
                    <CodeCard
                        key={`${entry.gameId}:${entry.code}`}
                        entry={entry}
                        game={game}
                        index={index}
                        canRedeem={canRedeem}
                        marked
                        onMarkedChange={(marked) => setMarked(entry, marked)}
                    />
                ))}
            </HistoryGroup>
        </div>
    );
}

function CodeCard({ entry, game, index, canRedeem, marked, onMarkedChange }) {
    const [justCopied, setJustCopied] = useState(false);

    async function copyCode() {
        await navigator.clipboard.writeText(entry.code);
        setJustCopied(true);
        onMarkedChange(true);
        setTimeout(() => setJustCopied(false), 2000);
    }

    function handleRedeem() {
        openUrl(`${game.redeemURL}${entry.code}`);
        onMarkedChange(true);
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors
                ${marked
                    ? "border-aeon-surface-200/30 bg-aeon-surface-500/50"
                    : "border-aeon-surface-300 bg-aeon-surface-500"
                }`}
        >
            <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={() => onMarkedChange(!marked)}
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors duration-200 cursor-pointer
                            ${marked
                                ? "border-green-400/40 bg-green-400/10 text-green-300 hover:bg-green-400/15"
                                : "border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-100/30 hover:bg-aeon-surface-400 hover:text-aeon-primary-100/70"
                            }`}
                        title={marked ? t("codes.unmarkDone") : t("codes.markDone")}
                    >
                        <Check size={6} weight="bold" />
                    </button>
                    <span className={`text-sm font-mono font-semibold tracking-wide truncate ${marked ? "text-aeon-primary-100/45" : "text-aeon-primary-100"}`}>
                        {entry.code}
                    </span>
                    <button
                        onClick={copyCode}
                        className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer h-7 w-7 p-0 shrink-0"
                        title={t("codes.copyCode")}
                    >
                        {justCopied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                </div>
                <span className="text-xs text-aeon-primary-100/45">
                    {t("codes.added", { date: formatDateTime(entry.addedAt) })}
                </span>
            </div>

            {canRedeem && (
                <button
                    onClick={handleRedeem}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-surface-500 px-3 py-1.5 text-xs font-medium text-aeon-primary-100/80 transition-colors duration-200 hover:bg-aeon-primary-600/20 hover:text-aeon-primary-100 cursor-pointer shrink-0"
                >
                    {t("codes.redeem")}
                </button>
            )}
        </motion.div>
    );
}

function AutoRedeemView({ gameId, history, selectedRegions, retryingKey, onRetry }) {
    if (selectedRegions.length === 0) {
        return <p className="text-aeon-primary-100/40 text-sm py-4 text-center">{t("codes.chooseRegion")}</p>;
    }

    if (history.length === 0) {
        return <p className="text-aeon-primary-100/40 text-sm py-4 text-center">{t("codes.noRedeemedCodes")}</p>;
    }

    const failedHistory = history.filter(entry => !isSuccessful(entry.status));
    const succeededHistory = history.filter(entry => isSuccessful(entry.status));

    return (
        <div className="flex flex-col gap-3">
            <HistoryGroup label={t("codes.succeededCodes")} entries={succeededHistory}>
                {succeededHistory.map((entry, index) => (
                    <HistoryCard
                        key={historyEntryKey(entry)}
                        entry={entry}
                        index={index}
                    />
                ))}
            </HistoryGroup>

            <HistoryGroup label={t("codes.failedCodes")} entries={failedHistory}>
                {failedHistory.map((entry, index) => (
                    <HistoryCard
                        key={historyEntryKey(entry)}
                        entry={entry}
                        index={index}
                        retrying={retryingKey === historyEntryKey(entry)}
                        onRetry={onRetry}
                    />
                ))}
            </HistoryGroup>
        </div>
    );
}

function HistoryGroup({ label, entries, children }) {
    if (entries.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-aeon-primary-100/35">
                    {label}
                </span>
                <span className="h-px flex-1 bg-aeon-surface-300" />
            </div>
            {children}
        </div>
    );
}

function HistoryCard({ entry, index, retrying = false, onRetry }) {
    const [detailsOpen, setDetailsOpen] = useState(false);
    const success = isSuccessful(entry.status);
    const retryable = !success && isRetryable(entry.status) && onRetry;
    const statusLabel = STATUS_LABEL_KEYS[entry.status] ? t(STATUS_LABEL_KEYS[entry.status]) : entry.status;
    const message = readableMessage(entry.message);
    const primaryStatusText = !success && message ? message : statusLabel;
    const secondaryStatusText = !success && message ? statusLabel : message;
    const canToggleDetails = !success && primaryStatusText.length > 110;

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-3 py-2.5"
        >
            <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <StatusDot success={success} />
                    <span className="text-sm font-mono font-semibold text-aeon-primary-100 truncate">
                        {entry.code}
                    </span>
                    <span className="rounded-md border border-aeon-surface-300 px-1.5 py-0.5 text-[10px] text-aeon-primary-100/50 shrink-0">
                        {entry.region}
                    </span>
                </div>
                <span className="text-xs text-aeon-primary-100/45">
                    {formatDateTime(entry.redeemedAt ?? entry.attemptedAt)}
                </span>
            </div>

            <div className="flex min-w-27.5 max-w-85 flex-col items-end gap-1">
                <div className="flex items-center justify-end gap-1.5">
                    <span
                        className={`max-w-80 text-right text-xs font-medium leading-snug wrap-break-word ${canToggleDetails && !detailsOpen ? "line-clamp-2" : ""} ${success ? "text-green-300" : "text-aeon-primary-100/55"}`}
                        title={primaryStatusText}
                    >
                        {primaryStatusText}
                    </span>
                    {retryable && (
                        <button
                            type="button"
                            onClick={() => onRetry(entry)}
                            disabled={retrying}
                            title={t("codes.retryCode")}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-100/70 transition-colors duration-200 hover:bg-aeon-surface-400 hover:text-aeon-primary-100 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ArrowClockwise size={14} className={retrying ? "animate-spin" : ""} />
                        </button>
                    )}
                </div>
                {canToggleDetails && (
                    <button
                        type="button"
                        onClick={() => setDetailsOpen(open => !open)}
                        className="inline-flex items-center gap-1 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-2 py-0.5 text-[10px] font-medium text-aeon-primary-100/50 transition-colors duration-200 hover:bg-aeon-surface-400 hover:text-aeon-primary-100/75 cursor-pointer"
                    >
                        {detailsOpen ? <CaretUp size={10} /> : <CaretDown size={10} />}
                        {detailsOpen ? t("codes.hideDetails") : t("codes.showDetails")}
                    </button>
                )}
                {secondaryStatusText && (
                    <span className="max-w-70 wrap-break-word text-right text-[10px] leading-snug text-aeon-primary-100/35" title={secondaryStatusText}>
                        {secondaryStatusText}
                    </span>
                )}
            </div>
        </motion.div>
    );
}

function StatusDot({ success }) {
    return (
        <span
            className={`h-2 w-2 rounded-full shrink-0 ${success ? "bg-green-400" : "bg-aeon-primary-100/25"}`}
        />
    );
}
