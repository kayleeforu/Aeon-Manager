import { GameControllerIcon } from "@phosphor-icons/react";
import { t } from "../i18n";

export default function EmptyState({ onNavigate }) {
    return (
        <div className="min-h-72 flex flex-col items-center justify-center gap-4 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500/40 px-6 text-center">
            <GameControllerIcon size={36} weight="light" className="text-aeon-primary-300" />
            <div className="flex flex-col gap-1">
                <span className="text-aeon-primary-100 text-lg font-semibold">{t("home.emptyTitle")}</span>
                <p className="text-aeon-primary-100/50 text-sm max-w-md">
                    {t("home.emptyDescription")}
                </p>
            </div>
            <button
                onClick={() => onNavigate("games")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-primary-300 px-5 py-2 text-sm font-medium text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-primary-500 hover:border-aeon-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {t("home.openGames")}
            </button>
        </div>
    );
}
