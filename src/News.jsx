import "./App.css"
import { PlanetIcon } from "@phosphor-icons/react";
import { t } from "./i18n";

export default function News() {
  return (
    <div className="w-full h-full flex justify-center items-center text-aeon-primary-600">
      <div className="flex flex-row gap-2 justify-center items-center text-4xl">
        <PlanetIcon size={64} weight="light" />
        <p>{t("common.comingSoon")}</p>
      </div>
    </div>
  );
}
