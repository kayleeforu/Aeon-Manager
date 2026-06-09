import "../App.css";
import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { SettingsSection, SettingsRow } from "./SettingsRow.jsx";
import CookiesConfiguration from "./CookiesConfiguration.jsx";
import ConfirmWindow from "./ConfirmWindow.jsx";
import { t } from "../i18n";

export default function Cookies({ cookiesExist, updateSetting, config, setConfig, setNotification, collapsed, focusPulse = 0 }) {
    const [cookiesWindow, setCookiesWindow] = useState(false);
    const [confirmWindow, setConfirmWindow] = useState(false);
    const [removeWindow, setRemoveWindow] = useState(false);
    const sectionControls = useAnimationControls();
    const lastFocusPulse = useRef(focusPulse);

    useEffect(() => {
        if (!focusPulse || focusPulse === lastFocusPulse.current) return;
        lastFocusPulse.current = focusPulse;
        sectionControls.start({
            scale: [1, 1.015, 1],
            x: [0, -3, 0],
            transition: { duration: 0.45, ease: "easeOut" }
        });
    }, [focusPulse, sectionControls]);

    const importCookies = async () => {
        try {
            await invoke("import_cookies");
            const rawJsonString = await invoke("get_config");
            setConfig(JSON.parse(rawJsonString));
            setNotification({ visible: true, message: t("notifications.cookiesImported"), type: "success" });
        } catch (error) {
            setNotification({ visible: true, message: `${error}`, type: "error" });
        } finally {
            setConfirmWindow(false);
        }
    };

    const removeCookies = async () => {
        try {
            await invoke("remove_cookies");
            const rawJsonString = await invoke("get_config");
            setConfig(JSON.parse(rawJsonString));
            setNotification({ visible: true, message: t("notifications.cookiesRemoved"), type: "success" });
        } catch (error) {
            setNotification({ visible: true, message: `${error}`, type: "error" });
        } finally {
            setRemoveWindow(false);
        }
    };

    return (
        <motion.div
            className="flex flex-col gap-1"
            animate={sectionControls}
            initial={false}
        >
            {confirmWindow && (
                <ConfirmWindow
                    title={t("settings.cookies.confirmImport.title")}
                    description={t("settings.cookies.confirmImport.description")}
                    confirmLabel={t("common.import")}
                    confirmClass="border-aeon-primary-600 bg-aeon-primary-300 text-aeon-surface-500 hover:bg-aeon-primary-500 hover:border-aeon-primary-500"
                    onConfirm={importCookies}
                    onCancel={() => setConfirmWindow(false)}
                />
            )}
            {removeWindow && (
                <ConfirmWindow
                    title={t("settings.cookies.confirmRemove.title")}
                    description={t("settings.cookies.confirmRemove.description")}
                    confirmLabel={t("common.remove")}
                    confirmClass="aeon-danger"
                    onConfirm={removeCookies}
                    onCancel={() => setRemoveWindow(false)}
                />
            )}
            {cookiesWindow && (
                <CookiesConfiguration
                    onClose={() => setCookiesWindow(false)}
                    updateSetting={updateSetting}
                    config={config}
                    setConfig={setConfig}
                    setNotification={setNotification}
                />
            )}
            <SettingsSection label={t("settings.cookies.section")} />
            <div className="flex flex-col gap-5">
                <SettingsRow index={0} collapsed={collapsed} title={t("settings.cookies.autoImport.title")} description={t("settings.cookies.autoImport.description")}>
                    <button
                        onClick={() => setConfirmWindow(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-primary-300 px-5 py-2 text-sm font-medium text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-primary-500 hover:border-aeon-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {cookiesExist ? t("common.reimport") : t("common.import")}
                    </button>
                </SettingsRow>
                <SettingsRow index={1} collapsed={collapsed} title={t("settings.cookies.manualImport.title")} description={t("settings.cookies.manualImport.description")}>
                    <button
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-5 py-2 text-sm font-medium text-aeon-primary-100/80 transition-colors duration-200 hover:bg-aeon-surface-400 hover:text-aeon-primary-100 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setCookiesWindow(true)}
                    >
                        {t("common.configure")}
                    </button>
                </SettingsRow>
                <SettingsRow index={2} collapsed={collapsed} title={t("settings.cookies.remove.title")} description={t("settings.cookies.remove.description")}>
                    <button
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-danger-300 bg-transparent px-5 py-2 text-sm font-medium text-aeon-danger-200 transition-colors duration-200 hover:bg-aeon-danger-300/10 hover:text-aeon-danger-100 hover:border-aeon-danger-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setRemoveWindow(true)}
                        disabled={!cookiesExist}
                    >
                        {t("common.remove")}
                    </button>
                </SettingsRow>
            </div>
        </motion.div>
    );
}
