import { EyeIcon, EyeSlashIcon, CopyIcon, CheckIcon } from "@phosphor-icons/react";
import { t } from "../i18n";

export default function BackupCodeField({ label, code, revealed, copied, onReveal, onCopy, action }) {
    const masked = `${code.split(":")[0]}:${"*".repeat(24)}`;

    return (
        <div className="w-full flex flex-col gap-2">
            <p className="text-aeon-primary-100/50 text-xs uppercase tracking-wider">{label}</p>
            <div className="w-full flex items-center gap-2 p-3 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500">
                <span className="flex-1 text-sm text-aeon-primary-100/80 break-all tracking-wide">
                    {revealed ? code : masked}
                </span>
                <button
                    onClick={onReveal}
                    title={revealed ? t("account.actions.hideBackupCode") : t("account.actions.showBackupCode")}
                    className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0 text-aeon-primary-100/40 hover:text-aeon-primary-100/80 shrink-0"
                >
                    {revealed ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
                <button
                    onClick={onCopy}
                    title={t("account.actions.copyBackupCode")}
                    className="inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 p-0 text-aeon-primary-100/40 hover:text-aeon-primary-100/80 shrink-0"
                >
                    {copied ? <CheckIcon size={16} className="text-green-400" /> : <CopyIcon size={16} />}
                </button>
                {action}
            </div>
        </div>
    );
}
