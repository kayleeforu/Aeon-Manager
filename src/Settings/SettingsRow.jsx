import "../App.css";
import { motion } from "framer-motion";
import { t } from "../i18n";

export function SettingsSection({ label = t("placeholders.settingsSection") }) {
    return (
        <div>
            <p className="font-bold text-1xl">{label}</p>
        </div>
    );
}

export function SettingsRow({ title, description, children, collapsed, index = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.4,
                delay: index * 0.05,
                ease: "easeOut"
            }}
            className="flex flex-row justify-between items-start w-full"
        >
            <motion.div
                className="flex flex-col justify-center overflow-hidden pr-4"
                variants={{
                    wide: { maxWidth: "85%", transition: { duration: 0.2, ease: "easeInOut" } },
                    narrow: { maxWidth: "75%", transition: { duration: 0.2, ease: "easeInOut" } }
                }}
                animate={collapsed ? "wide" : "narrow"}
                initial={collapsed ? "wide" : "narrow"}
                style={{ overflow: "hidden", whiteSpace: "nowrap" }}
            >
                <span className="text-1xl block truncate">{title}</span>
                <span className="text-aeon-primary-600 text-sm block whitespace-normal wrap-break-word">
                    {description}
                </span>
            </motion.div>

            <div className="shrink-0 pt-1">
                {children}
            </div>
        </motion.div>
    );
}
