import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import InputField from "./InputField";
import { t } from "../i18n";

export default function CreateAccount({ setConfig, setNotification }) {
    const [activeForm, setActiveForm] = useState("create");
    const [username, setUsername]     = useState("");
    const [backupCode, setBackupCode] = useState("");
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState("");

    async function handleCreate() {
        if (!username.trim()) return setError(t("account.errors.usernameRequired"));
        setLoading(true);
        setError("");
        try {
            const uuid = await invoke("create_account", { username: username.trim() });
            setConfig(prev => ({
                ...prev,
                settings: { ...prev.settings, uuid, username: username.trim() }
            }));
        } catch (e) {
            setNotification({ visible: true, message: e, type: "error" });
        } finally {
            setLoading(false);
        }
    }

    async function handleRestore() {
        if (!backupCode.trim()) return setError(t("account.errors.backupCodeRequired"));
        const parts = backupCode.trim().split(":");
        if (parts.length !== 2) return setError(t("account.errors.invalidBackupCodeFormat"));
        const [restoredUsername, restoredUUID] = parts;
        setLoading(true);
        setError("");
        try {
            const uuid = await invoke("restore_account", { username: restoredUsername, uuid: restoredUUID });
            setConfig(prev => ({
                ...prev,
                settings: { ...prev.settings, uuid, username: restoredUsername }
            }));
        } catch (e) {
            setNotification({ visible: true, message: e, type: "error" });
        } finally {
            setLoading(false);
        }
    }

    function switchForm(form) {
        setActiveForm(form);
        setError("");
        setUsername("");
        setBackupCode("");
    }

    const base = "py-3 px-5 font-bold z-10 flex-1 text-center hover:cursor-pointer transition-all duration-350";
    const active = "bg-aeon-primary-300 text-aeon-surface-500";
    const inactive = "bg-transparent text-aeon-primary-100 hover:bg-aeon-surface-400";

    return (
        <>
            <div className="w-full relative flex bg-transparent rounded-lg overflow-hidden border border-aeon-surface-300">
                <button className={`${base} rounded-l-lg ${activeForm === "create" ? active : inactive}`} onClick={() => switchForm("create")}>
                    {t("account.create")}
                </button>
                <button className={`${base} rounded-r-lg ${activeForm === "restore" ? active : inactive}`} onClick={() => switchForm("restore")}>
                    {t("account.restore")}
                </button>
            </div>

            <div className="w-full text-aeon-primary-100">
                <div className="flex flex-col w-full gap-3">
                    {activeForm === "create" && (
                        <InputField placeholder={t("account.usernamePlaceholder")} value={username} onChange={e => setUsername(e.target.value)} />
                    )}
                    {activeForm === "restore" && (
                        <InputField placeholder={t("account.backupCodePlaceholder")} value={backupCode} onChange={e => setBackupCode(e.target.value)} />
                    )}
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                </div>
            </div>

            <button
                onClick={activeForm === "create" ? handleCreate : handleRestore}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-primary-300 px-4 py-3 text-lg font-bold tracking-wide text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-primary-500 hover:border-aeon-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
                {loading ? t("common.loadingShort") : activeForm === "create" ? t("account.createAccount") : t("account.restoreAccount")}
            </button>
        </>
    );
}
