import "../App.css";
import { motion, AnimatePresence } from "framer-motion";

export default function SidebarButton({ icon, text, isActive, onClick, collapsed }) {
    const buttonClass = [
        "text-aeon-primary-100 text-sm font-medium",
        "flex justify-start items-center h-11 rounded-lg overflow-hidden transition-colors w-full",
        "hover:bg-aeon-primary-100 hover:text-aeon-surface-500 duration-400 cursor-pointer",
        isActive ? "bg-aeon-primary-600 text-aeon-surface-500 hover:bg-aeon-primary-500" : "",
    ].join(" ");

    return (
        <button onClick={onClick} className={buttonClass}>
            <div className="w-12 shrink-0 flex items-center justify-center">
                {icon}
            </div>
            
            <AnimatePresence>
                {!collapsed && (
                    <motion.span
                        key="label"
                        className="pl-1"
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.4, ease: "easeInOut" }}
                        style={{ overflow: "hidden", whiteSpace: "nowrap" }}
                    >
                        {text}
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    );
}
