import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PencilSimpleIcon, ArrowsClockwiseIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import BackupCodeField from "./BackupCodeField";
import InputField from "./InputField";
import { t } from "../i18n";

export default function AccountView({ uuid, username, setConfig, setWindow, setWindowHandlers, setNotification }) {
    const [editingUsername, setEditingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState(username);
    const [usernameLoading, setUsernameLoading] = useState(false);
    const [usernameError, setUsernameError] = useState("");

    const [secondaryUUID, setSecondaryUUID] = useState(null);
    const [loadingSecondary, setLoadingSecondary] = useState(true);

    const [revealedMain, setRevealedMain] = useState(false);
    const [revealedSecondary, setRevealedSecondary] = useState(false);
    const [copiedMain, setCopiedMain] = useState(false);
    const [copiedSecondary, setCopiedSecondary] = useState(false);

    const mainBackupCode = `${username}:${uuid}`;
    const secondaryBackupCode = secondaryUUID ? `${username}:${secondaryUUID}` : null;

    useEffect(() => {
        invoke("get_secondary_code", { uuid })
            .then(code => setSecondaryUUID(code))
            .catch(() => setSecondaryUUID(null))
            .finally(() => setLoadingSecondary(false));
    }, [uuid]);

    useEffect(() => {
        setWindowHandlers({
            regenerate: async () => {
                try {
                    const result = await invoke("regenerate_uuid", { oldUuid: uuid });
                    setConfig(prev => ({
                        ...prev,
                        settings: { ...prev.settings, uuid: result.uuid }
                    }));
                    setNotification({ visible: true, message: t("notifications.backupCodeRegenerated"), type: "success" });
                } catch (e) {
                    setNotification({ visible: true, message: e, type: "error" });
                } finally {
                    setWindow(null);
                }
            },
            secondary: async () => {
                try {
                    const recoveryUUID = await invoke("generate_secondary_code");
                    setSecondaryUUID(recoveryUUID);
                    setNotification({ visible: true, message: t("notifications.secondaryCodeGenerated"), type: "success" });
                } catch (e) {
                    setNotification({ visible: true, message: e, type: "error" });
                } finally {
                    setWindow(null);
                }
            },
            deleteSecondary: async () => {
                try {
                    await invoke("delete_secondary_code", { uuid });
                    setSecondaryUUID(null);
                    setNotification({ visible: true, message: t("notifications.secondaryCodeDeleted"), type: "success" });
                } catch (e) {
                    setNotification({ visible: true, message: e, type: "error" });
                } finally {
                    setWindow(null);
                }
            },
        });
    }, [uuid]);

    function copyCode(code, setCopied) {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function saveUsername() {
        if (!newUsername.trim()) return setUsernameError(t("account.errors.usernameCannotBeEmpty"));
        if (newUsername.trim() === username) return setEditingUsername(false);
        setUsernameLoading(true);
        setUsernameError("");
        try {
            await invoke("update_username", { uuid, newUsername: newUsername.trim() });
            setConfig(prev => ({
                ...prev,
                settings: { ...prev.settings, username: newUsername.trim() }
            }));
            setEditingUsername(false);
            setNotification({ visible: true, message: t("notifications.usernameUpdated"), type: "success" });
        } catch (e) {
            setUsernameError(e);
            setNotification({ visible: true, message: e, type: "error" });
        } finally {
            setUsernameLoading(false);
        }
    }

    async function handleLogout() {
        try {
            await invoke("update_config", { option: "uuid", value: null });
            await invoke("update_config", { option: "username", value: null });
            setConfig(prev => ({
                ...prev,
                settings: { ...prev.settings, uuid: null, username: null }
            }));
            setNotification({ visible: true, message: t("notifications.loggedOut"), type: "success" });
        } catch (e) {
            setNotification({ visible: true, message: e, type: "error" });
        }
    }

    return (
        <>
            <div className="w-full flex flex-col gap-1">
                <p className="text-aeon-primary-100/50 text-xs uppercase tracking-wider">{t("account.loggedInAs")}</p>
                {editingUsername ? (
                    <div className="flex flex-col gap-2">
                        <InputField
                            placeholder={t("account.newUsernamePlaceholder")}
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                        />
                        {usernameError && <p className="text-aeon-danger-200 text-xs">{usernameError}</p>}
                        <div className="flex gap-2">
                            <button
                                onClick={saveUsername}
                                disabled={usernameLoading}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-primary-300 px-4 py-2 text-sm font-bold text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-primary-500 hover:border-aeon-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                            >
                                {usernameLoading ? t("common.saving") : t("common.save")}
                            </button>
                            <button
                                onClick={() => { setEditingUsername(false); setNewUsername(username); setUsernameError(""); }}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-4 py-2 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                            >
                                {t("common.cancel")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <p className="text-aeon-primary-100 text-2xl font-bold">{username}</p>
                        <button
                            onClick={() => setEditingUsername(true)}
                            title={t("account.actions.editUsername")}
                            className="inline-flex items-center justify-center text-aeon-primary-100 transition-colors duration-200 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0 hover:text-aeon-primary-100/80"
                        >
                            <PencilSimpleIcon size={16} />
                        </button>
                    </div>
                )}
            </div>

            <BackupCodeField
                label={t("account.backupCode")}
                code={mainBackupCode}
                revealed={revealedMain}
                copied={copiedMain}
                onReveal={() => setRevealedMain(v => !v)}
                onCopy={() => copyCode(mainBackupCode, setCopiedMain)}
                    action={
                        <button
                            onClick={() => setWindow("regenerate")}
                            title={t("account.actions.regenerateBackupCode")}
                            className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0 text-aeon-primary-100/40 hover:text-aeon-danger-200 shrink-0"
                        >
                            <ArrowsClockwiseIcon size={16} />
                        </button>
                    }
            />

            {loadingSecondary ? null : secondaryUUID ? (
                <BackupCodeField
                    label={t("account.secondaryCode")}
                    code={secondaryBackupCode}
                    revealed={revealedSecondary}
                    copied={copiedSecondary}
                    onReveal={() => setRevealedSecondary(v => !v)}
                    onCopy={() => copyCode(secondaryBackupCode, setCopiedSecondary)}
                    action={
                        <button
                            onClick={() => setWindow("deleteSecondary")}
                            title={t("account.actions.deleteSecondaryCode")}
                            className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0 text-aeon-primary-100/40 hover:text-aeon-danger-200 shrink-0"
                        >
                            <TrashIcon size={16} />
                        </button>
                    }
                />
            ) : (
                <button
                    onClick={() => setWindow("secondary")}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-aeon-surface-300 bg-aeon-surface-500 px-4 py-2.5 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
                >
                    <PlusIcon size={14} />
                    {t("account.addSecondaryCode")}
                </button>
            )}

            <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-danger-300 bg-transparent px-4 py-2.5 text-sm font-medium text-aeon-danger-200 transition-colors duration-200 hover:bg-aeon-danger-300/10 hover:text-aeon-danger-100 hover:border-aeon-danger-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
                {t("account.logout")}
            </button>

            <p className="text-aeon-primary-100/30 text-xs text-center">
                {t("account.backupCodeAdvice")}
            </p>
        </>
    );
}
