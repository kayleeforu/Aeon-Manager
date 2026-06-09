import { motion } from "framer-motion";
import { useEffect } from "react";
import { t } from "../i18n";

export default function ConfirmWindow({ title, description, confirmLabel, confirmClass, onConfirm, onCancel }) {
    const isDanger = confirmClass === "aeon-danger";

    useEffect(() => {
        const handler = (event) => {
            if (event.key === "Escape") {
                onCancel();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onCancel]);
    
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 rounded-lg"
            onClick={onCancel}
        >
            <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-80 flex flex-col gap-4 p-5 rounded-xl border border-aeon-surface-300 bg-aeon-surface-500 shadow-xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex flex-col gap-1.5">
                    <p className="text-aeon-primary-100 font-bold text-lg">{title}</p>
                    <p className="text-aeon-primary-100/50 text-sm leading-relaxed">{description}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-4 py-2 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                    >
                        {t("common.cancel")}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={
                            isDanger
                                ? "inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-danger-300 bg-transparent px-4 py-2 text-sm font-medium text-aeon-danger-200 transition-colors duration-200 hover:bg-aeon-danger-300/10 hover:text-aeon-danger-100 hover:border-aeon-danger-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                                : `inline-flex items-center justify-center gap-2 rounded-lg border border-aeon-primary-600 bg-aeon-primary-300 px-4 py-2 text-sm font-medium text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-primary-500 hover:border-aeon-primary-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-1 ${confirmClass ?? ""}`
                        }
                    >
                        {confirmLabel}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
