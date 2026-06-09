import "../App.css";
import { X, Check } from "@phosphor-icons/react";

export default function ToggleSwitch({ onClick, state, disabled = false, title = "" }) {
    return (
        <button 
            disabled={disabled}
            onClick={onClick}
            title={title}
            className={`
                relative inline-flex h-6 w-11 items-center cursor-pointer rounded-full transition-all duration-300 focus:outline-none border
                ${state ? "bg-aeon-primary-500 border-transparent" : "bg-aeon-surface-500 border-aeon-surface-300"} 
                disabled:opacity-50 disabled:cursor-not-allowed
            `}
        >
            <span className={`
                flex h-5 w-5 transform items-center justify-center rounded-full bg-white transition-transform duration-300
                ${state ? "translate-x-5" : "translate-x-0.5"}
            `}>
                {state ? (
                    <Check size={14} weight="bold" className="text-aeon-primary-600" />
                ) : (
                    <X size={14} weight="bold" className="text-aeon-surface-500" />
                )}
            </span>
        </button>
    );
}
