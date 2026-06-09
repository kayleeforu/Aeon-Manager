import "../App.css";
import { invoke } from "@tauri-apps/api/core";
import ToggleSwitch from "../Components/ToggleSwitch.jsx";
import { t } from "../i18n";

export default function GameToggleSwitch({ gameId, config, setConfig }) {
    const state = config?.enabledGames?.[gameId] ?? false;

    const handleToggle = async () => {
        const newState = !state;

        setConfig(prev => ({
            ...prev,
            enabledGames: { ...prev.enabledGames, [gameId]: newState }
        }));

        try {
            await invoke("update_game", { gameId, enabled: newState });
        } catch (e) {
            console.error(t("logs.configSaveError"), e);
            setConfig(prev => ({
                ...prev,
                enabledGames: { ...prev.enabledGames, [gameId]: !newState }
            }));
        }
    };

    return (
        <ToggleSwitch
            onClick={handleToggle}
            state={state}
        />
    );
}
