import "../App.css"
import { t } from "../i18n";

export default function SectionLabel({ label = t("placeholders.section") }) {
    return (
        <div className="topbar sticky top-0 z-10 bg-aeon-surface-500/20 backdrop-blur-sm border-b p-4 border-aeon-surface-300 w-full">
            <p className="text-aeon-primary-100 text-3xl font-bold">{label}</p>
        </div>
    );
}
