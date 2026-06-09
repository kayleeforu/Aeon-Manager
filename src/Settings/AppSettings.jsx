import "../App.css";
import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { ArrowClockwiseIcon, GithubLogoIcon } from "@phosphor-icons/react";
import ToggleSwitch from "../Components/ToggleSwitch.jsx";
import DropdownMenu from "../Components/Dropdown.jsx";
import { SettingsSection, SettingsRow } from "./SettingsRow.jsx";
import { t } from "../i18n";
import { checkForUpdates } from "../utils/updates.jsx";

export default function AppSettings({ setConfig, updateSetting, config, collapsed, setNotification }) {
    const [version, setVersion] = useState("");
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    useEffect(() => { getVersion().then(setVersion); }, []);
    const settingsMap = config.settings || {};

    const updateStartup = async () => {
        const newVal = !settingsMap.startup;
        try {
            await invoke("set_startup_enabled", { enabled: newVal });
            setConfig(prev => ({
                ...prev,
                settings: { ...prev.settings, startup: newVal }
            }));
        } catch (e) {
            setNotification({ visible: true, message: t("notifications.startupError", { error: e }), type: "error" });
        }
    };

    const isWindows = window.navigator.userAgent.includes("Windows");

    const runUpdateCheck = async () => {
        setCheckingUpdate(true);
        try {
            await checkForUpdates({ setNotification, manual: true });
        } finally {
            setCheckingUpdate(false);
        }
    };

    return (
        <div className="flex flex-col gap-1">
            <SettingsSection label={t("settings.app.section")} />
            <div className="flex flex-col gap-5">
                <SettingsRow index={0} collapsed={collapsed} title={t("settings.app.launchStartup.title")} description={t("settings.app.launchStartup.description")}>
                    <ToggleSwitch onClick={updateStartup} state={!!settingsMap.startup} />
                </SettingsRow>
                <SettingsRow index={1} collapsed={collapsed} title={t("settings.app.launchBackground.title")} description={t("settings.app.launchBackground.description")}>
                    <ToggleSwitch onClick={() => updateSetting("background", !settingsMap.background)} state={!!settingsMap.background} />
                </SettingsRow>
                {isWindows &&
                <SettingsRow index={2} collapsed={collapsed} title={t("settings.app.minimizeTray.title")} description={t("settings.app.minimizeTray.description")}>
                    <ToggleSwitch onClick={() => updateSetting("minimizetotray", !settingsMap.minimizetotray)} state={!!settingsMap.minimizetotray} />
                </SettingsRow>
                }
                <SettingsRow index={3} collapsed={collapsed} title={t("settings.app.discordActivity.title")} description={t("settings.app.discordActivity.description")}>
                    <ToggleSwitch
                        onClick={async () => {
                            const newVal = !settingsMap.discordactivity;
                            await updateSetting("discordactivity", newVal);
                            try {
                                await invoke(newVal ? "enable_discord" : "disable_discord");
                            } catch (e) {
                                await updateSetting("discordactivity", !newVal);
                                setNotification({ visible: true, message: t("notifications.discordError", { error: e }), type: "error" });
                            }
                        }}
                        state={!!settingsMap.discordactivity}
                    />
                </SettingsRow>
                <SettingsRow index={4} collapsed={collapsed} title={t("settings.app.language.title")} description={t("settings.app.language.description")}>
                    <DropdownMenu>{[t("languages.english"), t("common.comingSoon")]}</DropdownMenu>
                </SettingsRow>
                <SettingsRow index={5} collapsed={collapsed} title={t("settings.app.rewardNotifications.title")} description={t("settings.app.rewardNotifications.description")}>
                    <ToggleSwitch onClick={() => updateSetting("notification", !settingsMap.notification)} state={!!settingsMap.notification} />
                </SettingsRow>
                <SettingsRow index={6} collapsed={collapsed} title={t("settings.app.version")}>
                    <p className="text-aeon-primary-600 tracking-wide">{version}</p>
                </SettingsRow>
                <SettingsRow index={7} collapsed={collapsed} title={t("settings.app.updates.title")} description={t("settings.app.updates.description")}>
                    <button
                        type="button"
                        onClick={runUpdateCheck}
                        disabled={checkingUpdate}
                        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-100 transition-colors duration-200 hover:border-aeon-surface-200 hover:bg-aeon-surface-400 disabled:cursor-not-allowed disabled:opacity-50"
                        title={t("settings.app.updates.check")}
                    >
                        <ArrowClockwiseIcon size={17} className={checkingUpdate ? "animate-spin" : ""} />
                    </button>
                </SettingsRow>
                <div className="flex flex-row justify-end items-center text-aeon-surface-100 gap-2">
                    <p>{t("settings.app.github")}</p>
                    <button onClick={() => openUrl("https://github.com/kayleeforu")} className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-9 w-9 p-0"><GithubLogoIcon size={24} weight="bold" /></button>
                </div>
            </div>
        </div>
    );
}
