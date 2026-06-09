import "./App.css";
import { PlanetIcon } from "@phosphor-icons/react";
import GameSelection from "./GameSelection.jsx";
import Settings from "./Settings.jsx";
import SectionLabel from "./Components/SectionLabel.jsx";
import TitleBar from "./Components/TitleBar.jsx";
import Sidebar from "./Components/Sidebar.jsx";
import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import Home from "./Home.jsx";
import Account from "./Account.jsx";
import Notification from "./Components/Notification.jsx";
import News from "./News.jsx";
import Calendar from "./Calendar.jsx";
import Onboarding from "./Onboarding.jsx";
import { AnimatePresence } from "framer-motion";
import { t } from "./i18n";
import { checkForUpdates } from "./utils/updates.jsx";

const appWindow = getCurrentWindow();

const getHostPlatform = () => navigator.userAgentData?.platform ?? navigator.platform ?? "";
const isMacPlatform = () => /mac/i.test(getHostPlatform());

function App() {
  const [activePage, setActivePage] = useState("home");
  const [cookiesFocusPulse, setCookiesFocusPulse] = useState(0);
  const notificationHomePendingRef = useRef(false);

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [config, setConfig] = useState({
    cookies: false,
    enabledGames: {},
    settings: {}
  });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    invoke("get_config")
      .then((rawJsonString) => {
        const parsed = JSON.parse(rawJsonString);
        if (parsed) {
          setConfig(parsed);
          setCollapsed(!!parsed.settings?.sidebarcollapsed);
        }
      })
      .catch((err) => {
        console.error(t("logs.failedLoadConfig", { error: err }));
      })
      .finally(() => {
        setLoadingConfig(false);
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const quitPressed = isMacPlatform() ? event.metaKey : event.ctrlKey;

      if (quitPressed && event.key.toLowerCase() === "q") {
        event.preventDefault();
        closeApp();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  useEffect(() => {
    let cleanupNotificationListener = null;

    const openHomeIfNotificationPending = () => {
      if (!notificationHomePendingRef.current) return;

      notificationHomePendingRef.current = false;
      setActivePage("home");
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        openHomeIfNotificationPending();
      }
    };

    listen("aeon-checkin-notification-sent", () => {
      notificationHomePendingRef.current = true;
    }).then((unlisten) => {
      cleanupNotificationListener = unlisten;
    });

    window.addEventListener("focus", openHomeIfNotificationPending);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cleanupNotificationListener?.();
      window.removeEventListener("focus", openHomeIfNotificationPending);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (loadingConfig || !config?.settings?.onboardingcomplete) return;

    checkForUpdates({ setNotification, manual: false });
  }, [loadingConfig, config?.settings?.onboardingcomplete]);

  const updateSetting = async (key, value) => {
    try {
      setConfig((prev) => ({
        ...prev,
        settings: { ...prev.settings, [key]: value }
      }));
      await invoke("update_config", { option: key, value });
      const rawJsonString = await invoke("get_config");
      setConfig(JSON.parse(rawJsonString));
    } catch (err) {
      try {
        const rawJsonString = await invoke("get_config");
        setConfig(JSON.parse(rawJsonString));
      } catch {
        setConfig((prev) => ({
          ...prev,
          settings: { ...prev.settings, [key]: !value }
        }));
      }
      setNotification({ 
        visible: true, 
        message: t("notifications.settingsUpdateFailed", { error: err }), 
        type: "error" 
      });
    }
  };

  const updateSidebarCollapsed = async (value) => {
    const previousValue = collapsed;
    setCollapsed(value);
    setConfig((prev) => ({
      ...prev,
      settings: { ...prev.settings, sidebarcollapsed: value }
    }));

    try {
      await invoke("update_config", { option: "sidebarcollapsed", value });
    } catch (err) {
      setCollapsed(previousValue);
      setConfig((prev) => ({
        ...prev,
        settings: { ...prev.settings, sidebarcollapsed: previousValue }
      }));
      setNotification({
        visible: true,
        message: t("notifications.sidebarUpdateFailed", { error: err }),
        type: "error"
      });
    }
  };

  const cookiesExist = !!config.cookies;

  const openCookiesSettings = () => {
    setActivePage("settings");
    setCookiesFocusPulse((value) => value + 1);
  };

  const completeOnboarding = async () => {
    await updateSetting("onboardingcomplete", true);
    setActivePage("home");
  };

  const [notification, setNotification] = useState({
    visible: false,
    message: "",
    type: "success"
  });

  const minimizingRef = useRef(false);
  const windowMetricsRef = useRef(null);

  const refreshWindowMetrics = async () => {
    const metrics = {
      position: await appWindow.outerPosition(),
      size: await appWindow.outerSize(),
      monitor: await currentMonitor(),
    };

    windowMetricsRef.current = metrics;
    return metrics;
  };

  useEffect(() => {
    refreshWindowMetrics().catch(() => {});
  }, []);

  const animateWindowPosition = (from, to, duration = 230) => {
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    return new Promise((resolve) => {
      const startedAt = performance.now();

      function frame(now) {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = easeInOut(progress);
        const x = Math.round(from.x + (to.x - from.x) * eased);
        const y = Math.round(from.y + (to.y - from.y) * eased);

        appWindow.setPosition(new PhysicalPosition(x, y));

        if (progress < 1) {
          requestAnimationFrame(frame);
          return;
        }

        resolve();
      }

      requestAnimationFrame(frame);
    });
  };

  const minimizeWindow = async () => {
    if (minimizingRef.current) return;
    minimizingRef.current = true;

    try {
      const minimizeToTray = !isMacPlatform() && !!config?.settings?.minimizetotray;
      const { position, size, monitor } = windowMetricsRef.current ?? await refreshWindowMetrics();

      if (monitor) {
        const target = new PhysicalPosition(
          Math.round(monitor.workArea.position.x + (monitor.workArea.size.width - size.width) / 2),
          Math.round(monitor.workArea.position.y + monitor.workArea.size.height - size.height - 12)
        );

        await animateWindowPosition(position, target);
        if (minimizeToTray) {
          await appWindow.hide();
        } else {
          await appWindow.minimize();
        }
        await appWindow.setPosition(position);
        windowMetricsRef.current = { position, size, monitor };
      } else {
        if (minimizeToTray) {
          await appWindow.hide();
        } else {
          await appWindow.minimize();
        }
      }
    } finally {
      minimizingRef.current = false;
    }
  };

  const closeApp = () => {
    invoke("exit_app");
  };

  if (loadingConfig) {
    return (
      <div className="h-screen w-screen bg-aeon-surface-500 flex flex-row gap-2 items-center justify-center text-aeon-primary-300">
        <PlanetIcon size={64} weight="light"/>
        <p className="text-2xl">{t("app.name")}</p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col rounded-lg">
      <TitleBar
        onMinimize={minimizeWindow}
        onPrepareMinimize={refreshWindowMetrics}
        onClose={closeApp}
        minimizeToTray={!isMacPlatform() && !!config?.settings?.minimizetotray}
      />
      {!config?.settings?.onboardingcomplete ? (
        <Onboarding
          config={config}
          setConfig={setConfig}
          updateSetting={updateSetting}
          setNotification={setNotification}
          onComplete={completeOnboarding}
        />
      ) : (
      <div className="flex flex-1 min-h-0">
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          collapsed={collapsed}
          setCollapsed={updateSidebarCollapsed}
          config={config}
        />
        <div className="content h-full w-full overflow-y-auto">
          {activePage === "home" &&
            <div className="w-full h-full flex flex-col">
              <SectionLabel label={t("navigation.home")} />
              <Home config={config} collapsed={collapsed} onNavigate={setActivePage} />
            </div>
          }
          {activePage === "news" &&
            <div className="w-full h-full flex flex-col">
              <SectionLabel label={t("navigation.news")} />
              <News />
            </div>
          }
          {activePage === "calendar" &&
            <div className="w-full h-full flex flex-col">
              <SectionLabel label={t("navigation.calendar")} />
              <Calendar />
            </div>
          }
          {activePage === "games" && 
            <div className="w-full">
              <SectionLabel label={t("navigation.games")} />
              <GameSelection
                config={config}
                setConfig={setConfig}
                cookiesExist={cookiesExist}
                onOpenCookies={openCookiesSettings}
              />
            </div>
          }
          {activePage === "settings" && 
            <div>
              <SectionLabel label={t("navigation.settings")} />
              <Settings
                cookiesExist={cookiesExist}
                setNotification={setNotification}
                config={config} 
                setConfig={setConfig}
                updateSetting={updateSetting}
                collapsed={collapsed}
                cookiesFocusPulse={cookiesFocusPulse}
              />
            </div>
          }
          {activePage === "account" &&
              <div className="w-full h-full flex flex-col justify-center">
                  <SectionLabel label={config.settings.username ? t("navigation.welcome", { username: config.settings.username }) : t("navigation.accountCreate")} />
                  <Account config={config} setConfig={setConfig} setNotification={setNotification} />
              </div>
          }
        </div>
      </div>
      )}
      
      <AnimatePresence>
        {notification.visible && (
          <Notification 
            key={notification.message}
            message={notification.message}
            type={notification.type}
            button={notification.button}
            onClose={() => setNotification({ ...notification, visible: false })}
          />
        )}
      </AnimatePresence>

    </div>
  );
}

export default App;
