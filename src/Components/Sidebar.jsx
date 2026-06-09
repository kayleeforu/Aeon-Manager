import "../App.css";
import { CalendarDotsIcon, GameControllerIcon, HouseIcon, NewspaperIcon, SidebarSimpleIcon, SlidersHorizontalIcon, UserIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import SidebarButton from "./SidebarButton.jsx";
import { t } from "../i18n";

export default function Sidebar({ activePage, setActivePage, collapsed, setCollapsed, config }) {
    const sidebarButtonSize = 20;

    return (
        <motion.div
            animate={{ width: collapsed ? 56 : 200 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            className="sidebar bg-aeon-surface-500 overflow-hidden border-r border-aeon-surface-300 flex-col shrink-0 px-1"
        >
            <div className="py-3 flex justify-start items-center flex-col h-full w-full gap-2">
                <SidebarButton
                    icon={<SidebarSimpleIcon size={sidebarButtonSize} weight="light"/>}
                    text={t("navigation.collapse")}
                    onClick={() => setCollapsed(!collapsed)}
                    collapsed={collapsed}
                />
                <SidebarButton
                    icon={<HouseIcon size={sidebarButtonSize} weight="light" />}
                    text={t("navigation.home")}
                    isActive={activePage === "home"}
                    onClick={() => setActivePage("home")}
                    collapsed={collapsed}
                />
                <SidebarButton
                    icon={<NewspaperIcon size={sidebarButtonSize} weight="light" />}
                    text={t("navigation.news")}
                    isActive={activePage === "news"}
                    onClick={() => setActivePage("news")}
                    collapsed={collapsed}
                />
                <SidebarButton
                    icon={<CalendarDotsIcon size={sidebarButtonSize} weight="light"/>}
                    text={t("navigation.calendar")}
                    isActive={activePage === "calendar"}
                    onClick={() => setActivePage("calendar")}
                    collapsed={collapsed}
                />
                <div className="configuration flex flex-col gap-2 w-full border-t border-aeon-surface-300 pt-2 mt-auto">
                    <SidebarButton
                        icon={<GameControllerIcon size={sidebarButtonSize} weight="light"/>}
                        text={t("navigation.gameSelection")}
                        isActive={activePage === "games"}
                        onClick={() => setActivePage("games")}
                        collapsed={collapsed}
                    />
                    <SidebarButton
                        icon={<SlidersHorizontalIcon size={sidebarButtonSize} weight="light"/>}
                        text={t("navigation.settings")}
                        isActive={activePage === "settings"}
                        onClick={() => setActivePage("settings")}
                        collapsed={collapsed}
                    />
                    <SidebarButton
                        icon={<UserIcon size={sidebarButtonSize} weight="light" />}
                        text={config.settings.username ? config.settings.username : t("navigation.accountCreate")}
                        isActive={activePage === "account"}
                        onClick={() => setActivePage("account")}
                        collapsed={collapsed}
                    />
                </div>
            </div>
        </motion.div>
    );
}
