import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import CreateAccount from "./Account/CreateAccount";
import AccountView from "./Account/AccountView";
import ConfirmWindow from "./Account/ConfirmWindow";
import { t } from "./i18n";

const WINDOWS = {
    regenerate: {
        title: t("account.confirm.regenerate.title"),
        description: t("account.confirm.regenerate.description"),
        confirmLabel: t("common.regenerate"),
        confirmClass: "aeon-danger",
    },
    secondary: {
        title: t("account.confirm.generateSecondary.title"),
        description: t("account.confirm.generateSecondary.description"),
        confirmLabel: t("common.generate"),
        confirmClass: "bg-aeon-primary-600 hover:bg-aeon-primary-500 text-aeon-surface-500 transition-all duration-300",
    },
    deleteSecondary: {
        title: t("account.confirm.deleteSecondary.title"),
        description: t("account.confirm.deleteSecondary.description"),
        confirmLabel: t("common.delete"),
        confirmClass: "aeon-danger",
    },
};

export default function Account({ config, setConfig, setNotification  }) {
    const uuid       = config?.settings?.uuid     ?? null;
    const username   = config?.settings?.username ?? null;
    const hasAccount = !!(uuid && username);

    const [activeWindow, setActiveWindow]       = useState(null);
    const [windowHandlers, setWindowHandlers]   = useState({});

    return (
        <div className="relative w-full h-full">
            <div className="flex flex-col h-full w-full max-w-xs mx-auto justify-center items-center gap-6">
                {hasAccount
                    ? <AccountView
                        uuid={uuid}
                        username={username}
                        setConfig={setConfig}
                        setWindow={setActiveWindow}
                        setWindowHandlers={setWindowHandlers}
                        setNotification={setNotification}
                      />
                    : <CreateAccount setConfig={setConfig} setNotification={setNotification} />
                }
            </div>

            <AnimatePresence>
                {activeWindow && WINDOWS[activeWindow] && (
                    <ConfirmWindow
                        {...WINDOWS[activeWindow]}
                        onConfirm={windowHandlers[activeWindow]}
                        onCancel={() => setActiveWindow(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
