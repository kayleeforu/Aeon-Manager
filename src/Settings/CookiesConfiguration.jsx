import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";

export default function CookiesConfiguration({ onClose, updateSetting, config, setConfig, setNotification }) {
    const [howTo, setHowTo] = useState(false);
    const [cookieToken, setCookieToken] = useState("");
    const [accountId, setAccountId] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handler = (event) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const handleSave = async () => {
        if (!cookieToken.trim() || !accountId.trim()) {
            setNotification({ visible: true, message: t("settings.cookies.manualModal.requiredFields"), type: "error" });
            return;
        }
        setLoading(true);
        try {
            await invoke("import_cookies_manual", {
                cookieToken: cookieToken.trim(),
                accountId: accountId.trim(),
            });
            const rawJsonString = await invoke("get_config");
            setConfig(JSON.parse(rawJsonString));
            setNotification({ visible: true, message: t("notifications.cookiesImported"), type: "success" });
            onClose();
        } catch (e) {
            setNotification({ visible: true, message: `${e}`, type: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 rounded-lg"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-120 flex flex-col gap-4 p-5 rounded-xl border border-aeon-surface-300 bg-aeon-surface-500 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                {howTo ? (
                    <HowTo onBack={() => setHowTo(false)} />
                ) : (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <p className="text-aeon-primary-100 font-bold text-lg">{t("settings.cookies.manualModal.title")}</p>
                            <div className="flex items-center gap-2">
                                <p className="text-aeon-primary-600 text-sm">
                                    {t("settings.cookies.manualModal.description")}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setHowTo(true)}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-2 py-1 text-xs font-medium text-aeon-primary-100/80 transition-colors duration-200 hover:bg-aeon-surface-400 hover:text-aeon-primary-100 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 shrink-0"
                                >
                                    {t("settings.cookies.manualModal.howToButton")}
                                </button>
                            </div>
                        </div>
                        <InputField
                            placeholder={t("settings.cookies.manualModal.cookieTokenPlaceholder")}
                            value={cookieToken}
                            onChange={e => setCookieToken(e.target.value)}
                        />
                        <InputField
                            placeholder={t("settings.cookies.manualModal.accountIdPlaceholder")}
                            value={accountId}
                            onChange={e => setAccountId(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-4 py-2 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={loading || !cookieToken.trim() || !accountId.trim()}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-primary-300 px-4 py-2 text-sm font-medium text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-primary-500 hover:border-aeon-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                            >
                                {loading ? t("common.saving") : t("common.save")}
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}

function Tooltip({ text, children }) {
    const [visible, setVisible] = useState(false);
    return (
        <span
            className="relative inline-block"
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
        >
            {children}
            {visible && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-56 px-2.5 py-1.5 rounded-lg bg-aeon-surface-500 border border-aeon-surface-200 text-aeon-primary-100/70 text-xs leading-relaxed z-10 pointer-events-none">
                    {text}
                </span>
            )}
        </span>
    );
}

function Step({ number, children }) {
    return (
        <div className="flex gap-3 items-start">
            <span className="shrink-0 w-5 h-5 rounded-full bg-aeon-surface-300 text-aeon-primary-600 text-xs flex items-center justify-center font-bold mt-0.5">
                {number}
            </span>
            <p className="text-aeon-primary-600 text-sm leading-relaxed">{children}</p>
        </div>
    );
}

function HowTo({ onBack }) {
    return (
        <>
            <div className="flex flex-col gap-3">
                <p className="text-aeon-primary-100 font-bold text-lg">{t("manualCookies.title")}</p>
                <div className="flex flex-col gap-3">
                    <Step number={1}>
                        {t("manualCookies.step1BeforeLink")} <span className="text-aeon-primary-300 font-medium hover:cursor-pointer hover:text-aeon-primary-500 transition-all duration-300 underline underline-offset-2 decoration-dashed" onClick={() => openUrl("https://hoyolab.com/")}>{t("manualCookies.hoyolab")}</span> {t("manualCookies.step1AfterLink")}
                    </Step>
                    <Step number={2}>
                        {t("manualCookies.step2BeforeTooltip")}{" "}
                        <Tooltip text={t("manualCookies.devtoolsTooltip")}>
                            <span className="text-aeon-primary-300 hover:text-aeon-primary-500 font-medium underline underline-offset-2 cursor-help transition-colors duration-300">
                                {t("manualCookies.devtools")}
                            </span>
                        </Tooltip>
                        {t("manualCookies.step2AfterTooltip")}
                    </Step>
                    <Step number={3}>
                        {t("manualCookies.step3BeforeTooltip")}{" "}
                        <Tooltip text={t("manualCookies.storageCookiesTooltip")}>
                            <span className="text-aeon-primary-300 hover:text-aeon-primary-500 font-medium underline underline-offset-2 cursor-help transition-colors duration-300">
                                {t("manualCookies.storageCookies")}
                            </span>
                        </Tooltip>{" "}
                        {t("manualCookies.step3AfterTooltip")}
                    </Step>
                    <Step number={4}>
                        {t("manualCookies.step4")}
                    </Step>
                </div>
            </div>
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-4 py-2 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {t("common.back")}
            </button>
        </>
    );
}

function InputField({ placeholder, value, onChange }) {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input
                className="w-full px-2 py-3 pr-9 border border-aeon-surface-300 rounded-lg text-aeon-primary-100 outline-none focus:border-aeon-primary-600 transition-colors bg-transparent [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                type={visible ? "text" : "password"}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
            />
            <button
                type="button"
                onClick={() => setVisible(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-aeon-primary-100/40 hover:text-aeon-primary-100/80 transition-colors cursor-pointer"
                title={visible ? t("common.hide") : t("common.show")}
            >
                {visible ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
            </button>
        </div>
    );
}
