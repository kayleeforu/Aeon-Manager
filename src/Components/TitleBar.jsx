import "../App.css";
import { XIcon, MinusIcon, PlanetIcon } from "@phosphor-icons/react";
import { t } from "../i18n";

export default function TitleBar({ onMinimize, onPrepareMinimize, onClose, minimizeToTray = false }) {
    return (
        <div data-tauri-drag-region className="topbar flex w-full border-b border-aeon-surface-300 py-3 text-aeon-primary-100 justify-between">
            <div className="flex justify-center items-center gap-2 px-7">
                <PlanetIcon size={32} weight="light"/>
                <p>{t("titleBar.appName")}</p>
            </div>
            <div className="flex flex-row gap-2 px-2">
                <Button
                    icon={<MinusIcon size={22} weight="bold"/>}
                    title={minimizeToTray ? t("window.minimizeToTray") : t("window.minimize")}
                    callback={onMinimize}
                    onPrepare={onPrepareMinimize}
                    triggerOnPointerDown
                />
                <Button
                    icon={<XIcon size={22} weight="bold"/>}
                    title={t("window.close")}
                    callback={onClose}
                />
            </div>
        </div>
    );
}

function Button({ callback, icon, title, onPrepare, triggerOnPointerDown = false }) {
    const handlePointerDown = (event) => {
        if (!triggerOnPointerDown || event.button !== 0) return;
        callback();
    };

    const handleClick = () => {
        if (triggerOnPointerDown) return;
        callback();
    };

    return (
        <div className="rounded-lg">
            <button title={title} onPointerEnter={onPrepare} onPointerDown={handlePointerDown} onClick={handleClick} className="inline-flex items-center justify-center rounded-lg bg-aeon-surface-500 text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0 hover:text-aeon-primary-100">
                {icon}
            </button>
        </div>
    );
}
