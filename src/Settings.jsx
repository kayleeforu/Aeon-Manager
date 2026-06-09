import "./App.css";
import Cookies from "./Settings/Cookies.jsx";
import GameSettings from "./Settings/GameSettings.jsx";
import AppSettings from "./Settings/AppSettings.jsx";

export default function Settings({ cookiesExist, setCookiesExist, setNotification, config, setConfig, updateSetting, collapsed, cookiesFocusPulse }) {
    return (
        <div>
            <div className="body">
                <div className="content text-aeon-primary-100 p-4 flex flex-col gap-10">
                    <Cookies
                        cookiesExist={cookiesExist}
                        updateSetting={updateSetting}
                        config={config}
                        setConfig={setConfig}
                        setNotification={setNotification}
                        collapsed={collapsed}
                        focusPulse={cookiesFocusPulse}
                    />
                    <GameSettings
                        cookiesExist={cookiesExist}
                        updateSetting={updateSetting}
                        config={config}
                        collapsed={collapsed}
                    />
                    <AppSettings
                        setConfig={setConfig}
                        updateSetting={updateSetting}
                        config={config}
                        collapsed={collapsed}
                        setNotification={setNotification}
                    />
                </div>
            </div>
        </div>
    );
}
