import "../App.css";
import { useEffect, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

export default function DropdownMenu({ children, selectedIndex, onSelect, disabledIndices = [] }) {
    const options = Array.isArray(children) ? children : [children];
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState(0);
    const dropdownRef = useRef(null);
    const activeIndex = Number.isInteger(selectedIndex) ? selectedIndex : selected;

    useEffect(() => {
        const handler = (event) => {
            if (!dropdownRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };

        window.addEventListener("pointerdown", handler);
        return () => window.removeEventListener("pointerdown", handler);
    }, []);

    function selectOption(index) {
        if (disabledIndices.includes(index)) return;

        if (!Number.isInteger(selectedIndex)) {
            setSelected(index);
        }

        onSelect?.(options[index], index);
        setOpen(false);
    }

    return (
        <div ref={dropdownRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="min-w-34 px-5 py-2 pr-9 cursor-pointer bg-aeon-primary-300 rounded-lg text-aeon-surface-500 text-1xl tracking-wide font-medium text-left outline-none hover:bg-aeon-primary-500 transition duration-300"
            >
                {options[activeIndex] ?? options[0]}
            </button>
            <CaretDownIcon
                size={14}
                weight="bold"
                className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-aeon-surface-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        className="absolute right-0 top-full z-30 mt-1 min-w-34 overflow-hidden rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 shadow-xl"
                    >
                        {options.map((option, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => selectOption(i)}
                                disabled={disabledIndices.includes(i)}
                                className={`w-full px-5 py-2 text-left text-sm cursor-pointer transition-colors
                                    ${activeIndex === i
                                        ? "bg-aeon-primary-300 text-aeon-surface-500"
                                        : "text-aeon-primary-100 hover:bg-aeon-surface-400"
                                    } disabled:cursor-not-allowed disabled:text-aeon-primary-100/35 disabled:hover:bg-transparent`}
                            >
                                {option}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
