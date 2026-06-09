import "../App.css";
import ToggleSwitch from "../Components/ToggleSwitch.jsx";
import { SettingsSection, SettingsRow } from "./SettingsRow.jsx";
import { t } from "../i18n";

export default function GameSettings({ cookiesExist, updateSetting, config, collapsed }) {
    const settingsMap = config.settings || {};
    return (
        <div className="flex flex-col gap-1">
            <SettingsSection label={t("settings.game.section")} />
            <div className="flex flex-col gap-5">
                <SettingsRow index={0} collapsed={collapsed} title={t("settings.game.checkIn.title")} description={t("settings.game.checkIn.description")}>
                    <ToggleSwitch onClick={() => updateSetting("checkin", !settingsMap.checkin)} state={!!settingsMap.checkin} disabled={!cookiesExist} title={!cookiesExist ? t("settings.game.cookiesRequired") : ""} />
                </SettingsRow>
                <SettingsRow index={1} collapsed={collapsed} title={t("settings.game.redemptionCodes.title")} description={t("settings.game.redemptionCodes.description")}>
                    <ToggleSwitch onClick={() => updateSetting("redeemcodes", !settingsMap.redeemcodes)} state={!!settingsMap.redeemcodes} disabled={!cookiesExist} title={!cookiesExist ? t("settings.game.cookiesRequired") : ""} />
                </SettingsRow>
            </div>
        </div>
    );
}
