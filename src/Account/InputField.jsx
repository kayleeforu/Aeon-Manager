import "../App.css";
export default function InputField({ placeholder, type = "text", value, onChange }) {
    return (
        <input
            className="w-full text-lg p-3 border border-aeon-surface-300 rounded-lg text-aeon-primary-100 outline-none focus:border-aeon-primary-600 transition-colors"
            placeholder={placeholder}
            type={type}
            value={value}
            onChange={onChange}
        />
    );
}
