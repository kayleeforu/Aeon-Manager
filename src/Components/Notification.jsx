import { useEffect } from "react";
import { motion } from "framer-motion";
import "../App.css";
import { XIcon, CheckCircleIcon, XCircleIcon, InfoIcon, CopyIcon } from "@phosphor-icons/react";
import { t } from "../i18n";

export default function Notification({ message, type, onClose, button }) {
    useEffect(() => {
        if (button) return undefined;

        const timer = setTimeout(() => {
            onClose();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ 
                type: "tween", 
                duration: 0.3,
                ease: "easeInOut"
            }}
            className={`fixed bottom-4 right-4 z-50 flex items-center justify-between
                px-3 py-2 rounded-xl shadow-lg border border-aeon-surface-300 bg-aeon-surface-500
                text-aeon-primary-300 w-100`}
        >
            <div className="flex min-w-0 flex-row gap-2 items-center">
                {type === "success" && <div className="text-aeon-success-100"><CheckCircleIcon size={24} weight="light" /></div>}
                {type === "error" && <div className="text-aeon-danger-300"><XCircleIcon size={24} weight="light" /></div>}
                {type === "info" && <div className="text-aeon-info-300"><InfoIcon size={24} weight="light" /></div>}
                <p className="text-md font-medium wrap-break-word">{message}</p>
            </div>
            <div className="flex flex-row items-center gap-1 shrink-0">
                {type === "error" && (
                    <motion.button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(String(message))}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        className="cursor-pointer hover:text-xl"
                        title={t("notification.copyError")}
                    >
                        <CopyIcon size={20} weight="light" />
                    </motion.button>
                )}
                {!button ? (
                    <motion.button 
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        className="cursor-pointer hover:text-xl"
                        onClick={onClose}
                    >
                        <XIcon size="20" weight="light"/>
                    </motion.button>
                ) : (
                    button
                )}
            </div>
        </motion.div>
    );
}
