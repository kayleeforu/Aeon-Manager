import "./App.css";
import CodesSection from "./Home/CodesSection.jsx";
import EmptyState from "./Home/EmptyState.jsx";
import GameDashboard from "./Home/GameDashboard.jsx";

export default function Home({ config, onNavigate }) {
    const enabledGames = config?.enabledGames ?? {};
    const activeGames = Object.values(enabledGames).some(Boolean);
    return (
        <div className="h-full w-full flex flex-col gap-5 p-4">
            {activeGames ? (
                <>
                    <GameDashboard config={config} />
                    <CodesSection config={config} />
                </>
            ) : (
                <EmptyState onNavigate={onNavigate} />
            )}
        </div>
    );
}
