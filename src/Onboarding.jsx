import "./App.css";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  CookieIcon,
  EyeIcon,
  EyeSlashIcon,
  GearIcon,
  GameControllerIcon,
  GiftIcon,
  LinkSimpleIcon,
  PlanetIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import DropdownMenu from "./Components/Dropdown.jsx";
import ToggleSwitch from "./Components/ToggleSwitch.jsx";
import { gameAssets } from "./data/GameAssets.js";
import games from "./data/Games.js";
import { REGION_OPTIONS, normalizeGameRegions, toggleRegionForGame } from "./data/Regions.js";
import { gameName, t } from "./i18n";

const STEPS = [
  { id: "intro", labelKey: "onboarding.progress.intro" },
  { id: "cookies", labelKey: "onboarding.progress.cookies" },
  { id: "cookieImport", labelKey: "onboarding.progress.cookieImport" },
  { id: "games", labelKey: "onboarding.progress.games" },
  { id: "regions", labelKey: "onboarding.progress.regions" },
  { id: "preferences", labelKey: "onboarding.progress.preferences" },
];

export default function Onboarding({
  config,
  setConfig,
  setNotification,
  onComplete,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cookiePreference, setCookiePreference] = useState(null);
  const [importMethod, setImportMethod] = useState(null);
  const [importing, setImporting] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualAccountId, setManualAccountId] = useState("");
  const [manualVisible, setManualVisible] = useState(false);
  const [savingFinish, setSavingFinish] = useState(false);
  const [advancingStep, setAdvancingStep] = useState(false);
  const [unlockedIndex, setUnlockedIndex] = useState(0);

  const settingsMap = config?.settings ?? {};
  const cookiesExist = !!config?.cookies;
  const gameIds = useMemo(() => Object.keys(gameAssets), []);
  const enabledGameIds = gameIds.filter((id) => config?.enabledGames?.[id]);
  const enabledCount = enabledGameIds.length;
  const gameRegions = normalizeGameRegions(settingsMap.regions, gameIds);
  const enabledGamesHaveRegions = enabledGameIds.length > 0
    && enabledGameIds.every((id) => (gameRegions[id] ?? []).length > 0);
  const automationAvailable = cookiesExist;
  const latestSettings = useRef(settingsMap);
  const latestEnabledGames = useRef(config?.enabledGames ?? {});
  const pendingSave = useRef(Promise.resolve());
  latestSettings.current = settingsMap;
  latestEnabledGames.current = config?.enabledGames ?? {};

  const cookieSetupDone = cookiePreference === "links" || (cookiePreference === "import" && cookiesExist);

  const canVisitStep = (index) => {
    const stepId = STEPS[index]?.id;

    if (stepId === "intro" || stepId === "cookies") return true;
    if (stepId === "cookieImport") return cookiePreference === "import";
    if (stepId === "games") return cookieSetupDone;
    if (stepId === "regions") return cookieSetupDone && enabledCount > 0;
    if (stepId === "preferences") return cookieSetupDone && enabledGamesHaveRegions;

    return cookieSetupDone;
  };

  const goToStep = (index) => {
    const boundedIndex = Math.max(0, Math.min(index, STEPS.length - 1));

    if (boundedIndex > unlockedIndex || !canVisitStep(boundedIndex)) return;

    setActiveIndex(boundedIndex);
  };

  const unlockStep = (index) => {
    const boundedIndex = Math.max(0, Math.min(index, STEPS.length - 1));
    if (!canVisitStep(boundedIndex)) return;

    setUnlockedIndex((current) => Math.max(current, boundedIndex));
    setActiveIndex(boundedIndex);
  };

  const goBack = () => {
    if (activeIndex === 3 && cookiePreference === "links") {
      setActiveIndex(1);
      return;
    }

    goToStep(activeIndex - 1);
  };

  const nextStepIndex = activeIndex === 1 && cookiePreference === "links" ? 3 : activeIndex + 1;

  const canContinue = () => {
    if (activeIndex === 0) return true;
    if (activeIndex === 1) return !!cookiePreference;
    if (activeIndex === 2) return cookiesExist && !importing;
    if (activeIndex === 3) return enabledCount > 0;
    if (activeIndex === 4) return enabledGamesHaveRegions;

    return false;
  };

  const goNext = async () => {
    if (!canContinue() || advancingStep) return;

    setAdvancingStep(true);
    try {
      if (activeIndex === 1 && cookiePreference === "links") {
        if (latestSettings.current?.checkin) {
          await updateOnboardingSetting("checkin", false);
        }

        if (latestSettings.current?.redeemcodes) {
          await updateOnboardingSetting("redeemcodes", false);
        }
      }

      unlockStep(nextStepIndex);
    } finally {
      setAdvancingStep(false);
    }
  };

  const finish = async () => {
    if (savingFinish) return;

    setSavingFinish(true);
    try {
      await pendingSave.current;
      await refreshConfig();
      await onComplete();
    } finally {
      setSavingFinish(false);
    }
  };

  const refreshConfig = async () => {
    const rawJsonString = await invoke("get_config");
    const nextConfig = JSON.parse(rawJsonString);
    latestSettings.current = nextConfig?.settings ?? {};
    setConfig(nextConfig);
    return nextConfig;
  };

  const queueConfigWrite = (write) => {
    const save = pendingSave.current.catch(() => {}).then(write);
    pendingSave.current = save.catch(() => {});
    return save;
  };

  const updateOnboardingSetting = (key, value) => {
    const previousValue = latestSettings.current?.[key];
    latestSettings.current = { ...latestSettings.current, [key]: value };

    setConfig((previous) => ({
      ...previous,
      settings: { ...previous.settings, [key]: value },
    }));

    return queueConfigWrite(async () => {
      try {
        await invoke("update_config", { option: key, value });
      } catch (error) {
        latestSettings.current = { ...latestSettings.current, [key]: previousValue };
        setConfig((previous) => ({
          ...previous,
          settings: { ...previous.settings, [key]: previousValue },
        }));
        setNotification({
          visible: true,
          message: t("notifications.settingsUpdateFailed", { error }),
          type: "error",
        });
        throw error;
      }
    });
  };

  const chooseCookiePreference = (preference) => {
    setCookiePreference(preference);
  };

  const importCookiesAutomatically = async () => {
    setImportMethod("automatic");
    setImporting(true);
    try {
      await invoke("import_cookies");
      await refreshConfig();
      setNotification({ visible: true, message: t("notifications.cookiesImported"), type: "success" });
      setUnlockedIndex((current) => Math.max(current, 2));
    } catch (error) {
      setNotification({ visible: true, message: `${error}`, type: "error" });
    } finally {
      setImporting(false);
    }
  };

  const importCookiesManually = async () => {
    if (!manualToken.trim() || !manualAccountId.trim()) {
      setNotification({
        visible: true,
        message: t("settings.cookies.manualModal.requiredFields"),
        type: "error",
      });
      return;
    }

    setImporting(true);
    try {
      await invoke("import_cookies_manual", {
        cookieToken: manualToken.trim(),
        accountId: manualAccountId.trim(),
      });
      await refreshConfig();
      setNotification({ visible: true, message: t("notifications.cookiesImported"), type: "success" });
      setUnlockedIndex((current) => Math.max(current, 2));
    } catch (error) {
      setNotification({ visible: true, message: `${error}`, type: "error" });
    } finally {
      setImporting(false);
    }
  };

  const updateGame = (gameId, enabled) => {
    const previousValue = !!latestEnabledGames.current?.[gameId];
    latestEnabledGames.current = { ...latestEnabledGames.current, [gameId]: enabled };

    setConfig((previous) => ({
      ...previous,
      enabledGames: { ...previous.enabledGames, [gameId]: enabled },
    }));

    return queueConfigWrite(async () => {
      try {
        await invoke("update_game", { gameId, enabled });
      } catch (error) {
        if (latestEnabledGames.current?.[gameId] === enabled) {
          latestEnabledGames.current = { ...latestEnabledGames.current, [gameId]: previousValue };
          setConfig((previous) => ({
            ...previous,
            enabledGames: { ...previous.enabledGames, [gameId]: previousValue },
          }));
        }

        setNotification({ visible: true, message: `${error}`, type: "error" });
        throw error;
      }
    });
  };

  const updateAllGames = (enabled) => {
    const previousGames = { ...(latestEnabledGames.current ?? {}) };
    const nextGames = gameIds.reduce((gamesMap, id) => ({ ...gamesMap, [id]: enabled }), {});
    latestEnabledGames.current = { ...latestEnabledGames.current, ...nextGames };

    setConfig((previous) => ({
      ...previous,
      enabledGames: { ...previous.enabledGames, ...nextGames },
    }));

    return queueConfigWrite(async () => {
      try {
        for (const gameId of gameIds) {
          await invoke("update_game", { gameId, enabled });
        }
      } catch (error) {
        const currentGames = latestEnabledGames.current ?? {};
        const shouldRollback = gameIds.every((id) => currentGames[id] === enabled);

        if (shouldRollback) {
          latestEnabledGames.current = previousGames;
          setConfig((previous) => ({
            ...previous,
            enabledGames: { ...previous.enabledGames, ...previousGames },
          }));
        }

        setNotification({ visible: true, message: `${error}`, type: "error" });
        throw error;
      }
    });
  };

  const updateGameRegion = (gameId, region) => {
    const nextRegions = toggleRegionForGame(latestSettings.current?.regions, gameIds, gameId, region);
    updateOnboardingSetting("regions", nextRegions);
  };

  const toggleStartup = () => {
    const previousValue = !!latestSettings.current?.startup;
    const nextValue = !previousValue;
    latestSettings.current = { ...latestSettings.current, startup: nextValue };

    setConfig((previous) => ({
      ...previous,
      settings: { ...previous.settings, startup: nextValue },
    }));

    return queueConfigWrite(async () => {
      try {
        await invoke("set_startup_enabled", { enabled: nextValue });
      } catch (error) {
        if (latestSettings.current?.startup === nextValue) {
          latestSettings.current = { ...latestSettings.current, startup: previousValue };
          setConfig((previous) => ({
            ...previous,
            settings: { ...previous.settings, startup: previousValue },
          }));
        }

        setNotification({ visible: true, message: t("notifications.startupError", { error }), type: "error" });
        throw error;
      }
    });
  };

  const toggleDiscordPresence = async () => {
    const nextValue = !settingsMap.discordactivity;
    try {
      await updateOnboardingSetting("discordactivity", nextValue);
    } catch {
      return;
    }

    try {
      await invoke(nextValue ? "enable_discord" : "disable_discord");
    } catch (error) {
      await updateOnboardingSetting("discordactivity", !nextValue).catch(() => {});
      setNotification({ visible: true, message: t("notifications.discordError", { error }), type: "error" });
    }
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-aeon-surface-500 text-aeon-primary-100">
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <motion.div
          animate={{ x: `-${activeIndex * 100}vw` }}
          transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-full"
          style={{ width: `${STEPS.length * 100}vw` }}
        >
          <OnboardingPanel>
            <IntroStep
              selectedLanguage={settingsMap.language ?? t("languages.english")}
              onSelectLanguage={(language) => updateOnboardingSetting("language", language)}
              onNext={() => unlockStep(1)}
            />
          </OnboardingPanel>

          <OnboardingPanel>
            <CookieChoiceStep
              selected={cookiePreference}
              onChoose={chooseCookiePreference}
              onContinue={goNext}
            />
          </OnboardingPanel>

          <OnboardingPanel>
            <CookieImportStep
              cookiesExist={cookiesExist}
              importMethod={importMethod}
              importing={importing}
              manualToken={manualToken}
              manualAccountId={manualAccountId}
              manualVisible={manualVisible}
              setManualToken={setManualToken}
              setManualAccountId={setManualAccountId}
              setManualVisible={setManualVisible}
              onAutomatic={importCookiesAutomatically}
              onManualSelect={() => setImportMethod("manual")}
              onManualSave={importCookiesManually}
              onContinue={goNext}
            />
          </OnboardingPanel>

          <OnboardingPanel compact>
            <GamesStep
              config={config}
              enabledCount={enabledCount}
              gameIds={gameIds}
              onToggleGame={updateGame}
              onToggleAll={updateAllGames}
              onNext={() => unlockStep(4)}
            />
          </OnboardingPanel>

          <OnboardingPanel>
            <RegionsStep
              config={config}
              gameIds={gameIds}
              gameRegions={gameRegions}
              canContinue={enabledGamesHaveRegions}
              onToggleRegion={updateGameRegion}
              onNext={() => unlockStep(5)}
              onBack={() => goToStep(3)}
            />
          </OnboardingPanel>

          <OnboardingPanel>
            <PreferencesStep
              automationAvailable={automationAvailable}
              saving={savingFinish}
              settingsMap={settingsMap}
              updateSetting={updateOnboardingSetting}
              toggleStartup={toggleStartup}
              toggleDiscordPresence={toggleDiscordPresence}
              onFinish={finish}
            />
          </OnboardingPanel>
        </motion.div>
      </div>

      <div className="border-t border-aeon-surface-300 bg-aeon-surface-500/96 px-5 py-2">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={activeIndex === 0}
              className="inline-flex h-9 min-w-24 cursor-pointer items-center justify-center gap-2 rounded-lg bg-transparent px-3 text-sm font-medium text-aeon-primary-100/55 transition-colors duration-200 hover:bg-aeon-surface-400/45 hover:text-aeon-primary-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowLeftIcon size={17} weight="bold" />
              {t("common.back")}
            </button>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex gap-2">
                {STEPS.map((step, index) => (
                  <StepProgressButton
                    key={step.id}
                    index={index}
                    activeIndex={activeIndex}
                    unlockedIndex={unlockedIndex}
                    skipped={step.id === "cookieImport" && cookiePreference === "links"}
                    canVisit={canVisitStep(index)}
                    onClick={() => goToStep(index)}
                    title={t(step.labelKey)}
                  />
                ))}
              </div>
              <div className="grid grid-cols-6 gap-2 text-center text-xs font-medium text-aeon-primary-100/42">
                {STEPS.map((step, index) => {
                  const locked = index > unlockedIndex || !canVisitStep(index);

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => goToStep(index)}
                      disabled={locked}
                      className={`truncate transition-colors duration-200 disabled:cursor-not-allowed ${
                        activeIndex === index ? "text-aeon-success-100/90" : "hover:text-aeon-primary-100/70 disabled:hover:text-aeon-primary-100/42"
                      } ${step.id === "cookieImport" && cookiePreference === "links" ? "opacity-45" : ""} ${locked ? "opacity-35" : ""}`}
                    >
                      {t(step.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={activeIndex >= STEPS.length - 1 || !canContinue() || advancingStep}
              className="inline-flex h-9 min-w-24 cursor-pointer items-center justify-center gap-2 rounded-lg bg-transparent px-3 text-sm font-medium text-aeon-primary-100/55 transition-colors duration-200 hover:bg-aeon-surface-400/45 hover:text-aeon-primary-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {t("common.next")}
              <ArrowRightIcon size={17} weight="bold" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function StepProgressButton({ index, activeIndex, unlockedIndex, skipped, canVisit, onClick, title }) {
  const locked = index > unlockedIndex || !canVisit;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={`h-2 flex-1 cursor-pointer rounded-full transition-colors duration-200 disabled:cursor-not-allowed ${
        index <= activeIndex ? "bg-aeon-success-300" : "bg-aeon-surface-300"
      } ${skipped ? "opacity-45" : ""} ${locked ? "opacity-35" : ""}`}
      title={title}
    />
  );
}

function OnboardingPanel({ children, compact = false }) {
  return (
    <section
      className={`flex h-full w-screen shrink-0 overflow-y-auto ${compact ? "px-5 py-2" : "px-8 py-5"}`}
    >
      <div className={`mx-auto flex min-h-full w-full max-w-5xl flex-col justify-start ${compact ? "py-0" : "py-2"}`}>
        {children}
      </div>
    </section>
  );
}

function SectionHeader({ eyebrow, title, description, icon, compact = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`mx-auto flex max-w-2xl flex-col items-center text-center ${compact ? "gap-2" : "gap-3"}`}
    >
      <span className={`inline-flex items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-success-100 ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
        {icon}
      </span>
      <p className="text-sm font-medium uppercase text-aeon-success-200/80">{eyebrow}</p>
      <h1 className={`${compact ? "text-2xl" : "text-3xl"} font-semibold text-aeon-primary-100`}>{title}</h1>
      <p className={`${compact ? "text-sm" : "text-base"} max-w-xl leading-relaxed text-aeon-primary-100/62`}>{description}</p>
    </motion.div>
  );
}

function IntroStep({ selectedLanguage, onSelectLanguage, onNext }) {
  const cards = [
    { id: "checkins", icon: <CalendarCheckIcon size={24} weight="light" /> },
    { id: "codes", icon: <GiftIcon size={24} weight="light" /> },
    { id: "control", icon: <GearIcon size={24} weight="light" /> },
  ];

  return (
    <div className="flex flex-col items-center gap-7">
      <SectionHeader
        icon={<PlanetIcon size={26} weight="light" />}
        eyebrow={t("onboarding.intro.eyebrow")}
        title={t("onboarding.intro.title")}
        description={t("onboarding.intro.description")}
      />

      <div className="flex w-full max-w-4xl justify-center">
        <LanguageSelect value={selectedLanguage} onChange={onSelectLanguage} />
      </div>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + index * 0.06, ease: "easeOut" }}
            className="min-h-36 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 p-5"
          >
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-aeon-success-100">
              {card.icon}
            </span>
            <p className="font-semibold text-aeon-primary-100">{t(`onboarding.intro.cards.${card.id}.title`)}</p>
            <p className="mt-2 text-sm leading-relaxed text-aeon-primary-100/56">
              {t(`onboarding.intro.cards.${card.id}.description`)}
            </p>
          </motion.div>
        ))}
      </div>

      <PrimaryButton onClick={onNext}>
        {t("onboarding.intro.start")}
        <ArrowRightIcon size={18} weight="bold" />
      </PrimaryButton>
    </div>
  );
}

function LanguageSelect({ value, onChange }) {
  const options = [t("languages.english"), t("common.comingSoon")];

  return (
    <DropdownMenu
      selectedIndex={0}
      disabledIndices={[1]}
      onSelect={(language, index) => {
        if (index === 0) onChange(language);
      }}
    >
      {options}
    </DropdownMenu>
  );
}

function CookieChoiceStep({ selected, onChoose, onContinue }) {
  return (
    <div className="flex flex-col items-center gap-9">
      <SectionHeader
        icon={<CookieIcon size={26} weight="light" />}
        eyebrow={t("onboarding.cookies.eyebrow")}
        title={t("onboarding.cookies.question")}
        description={t("onboarding.cookies.description")}
      />

      <div className="grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-2">
        <ChoiceCard
          icon={<CookieIcon size={26} weight="light" />}
          selected={selected === "import"}
          title={t("onboarding.cookies.import.title")}
          description={t("onboarding.cookies.import.description")}
          onClick={() => onChoose("import")}
        />
        <ChoiceCard
          icon={<LinkSimpleIcon size={26} weight="light" />}
          selected={selected === "links"}
          title={t("onboarding.cookies.links.title")}
          description={t("onboarding.cookies.links.description")}
          onClick={() => onChoose("links")}
        />
      </div>

      <PrimaryButton onClick={onContinue} disabled={!selected}>
        {selected === "links" ? t("onboarding.cookieImport.continue") : t("onboarding.continue")}
        <ArrowRightIcon size={18} weight="bold" />
      </PrimaryButton>
    </div>
  );
}

function CookieImportStep({
  cookiesExist,
  importMethod,
  importing,
  manualToken,
  manualAccountId,
  manualVisible,
  setManualToken,
  setManualAccountId,
  setManualVisible,
  onAutomatic,
  onManualSelect,
  onManualSave,
  onContinue,
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-aeon-surface-300 pb-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase text-aeon-success-200/80">{t("onboarding.cookieImport.eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-aeon-primary-100">{t("onboarding.cookieImport.title")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-aeon-primary-100/62">{t("onboarding.cookieImport.description")}</p>
        </div>

        {cookiesExist && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-aeon-success-300/50 bg-aeon-success-300/10 px-3 py-2 text-sm text-aeon-success-100"
          >
            <CheckCircleIcon size={17} weight="fill" />
            {t("onboarding.cookieImport.alreadyImported")}
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ImportMethodButton
          icon={<CookieIcon size={26} weight="light" />}
          selected={importMethod === "automatic"}
          title={t("onboarding.cookieImport.automatic.title")}
          description={t("onboarding.cookieImport.automatic.description")}
          onClick={onAutomatic}
          disabled={importing}
          actionLabel={importing && importMethod === "automatic" ? t("onboarding.cookieImport.importing") : t("common.import")}
        />
        <ImportMethodButton
          icon={<SlidersHorizontalIcon size={26} weight="light" />}
          selected={importMethod === "manual"}
          title={t("onboarding.cookieImport.manual.title")}
          description={t("onboarding.cookieImport.manual.description")}
          onClick={onManualSelect}
          disabled={importing}
          actionLabel={t("common.configure")}
        />
      </div>

      {importMethod === "manual" && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: "easeOut" }}
          className="rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 p-4"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-aeon-primary-100">{t("settings.cookies.manualModal.title")}</p>
                <p className="text-sm text-aeon-primary-100/54">{t("settings.cookies.manualModal.description")}</p>
              </div>
              <button
                type="button"
                onClick={() => setManualVisible((value) => !value)}
                className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 px-3 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200"
              >
                {manualVisible ? t("common.hide") : t("settings.cookies.manualModal.howToButton")}
              </button>
            </div>

            {manualVisible && <ManualCookieHelp />}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SecretInput
                placeholder={t("settings.cookies.manualModal.cookieTokenPlaceholder")}
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
              />
              <SecretInput
                placeholder={t("settings.cookies.manualModal.accountIdPlaceholder")}
                value={manualAccountId}
                onChange={(event) => setManualAccountId(event.target.value)}
              />
            </div>

            <PrimaryButton
              onClick={onManualSave}
              disabled={importing || !manualToken.trim() || !manualAccountId.trim()}
            >
              {importing ? t("common.saving") : t("common.save")}
            </PrimaryButton>
          </div>
        </motion.div>
      )}

      <div className="flex justify-center">
        <PrimaryButton onClick={onContinue} disabled={!cookiesExist || importing}>
          {t("onboarding.cookieImport.continue")}
          <ArrowRightIcon size={18} weight="bold" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function GamesStep({ config, enabledCount, gameIds, onToggleGame, onToggleAll, onNext }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        icon={<GameControllerIcon size={26} weight="light" />}
        eyebrow={t("onboarding.games.eyebrow")}
        title={t("onboarding.games.title")}
        description={t("onboarding.games.description")}
        compact
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-aeon-surface-300 pb-2">
        <span className="text-sm text-aeon-primary-100/48">
          {t("games.enabledCount", { enabled: enabledCount, total: gameIds.length })}
        </span>
        <div className="flex gap-2">
          <SecondaryButton onClick={() => onToggleAll(true)} compact>
            {t("games.enableAll")}
          </SecondaryButton>
          <SecondaryButton onClick={() => onToggleAll(false)} compact>
            {t("games.disableAll")}
          </SecondaryButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {gameIds.map((id, index) => (
          <OnboardingGameCard
            key={id}
            id={id}
            index={index}
            enabled={!!config?.enabledGames?.[id]}
            onToggle={() => onToggleGame(id, !config?.enabledGames?.[id])}
          />
        ))}
      </div>

      <div className="flex justify-center">
        <PrimaryButton onClick={onNext} disabled={enabledCount === 0}>
          {t("onboarding.games.continue")}
          <ArrowRightIcon size={18} weight="bold" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function RegionsStep({ config, gameIds, gameRegions, canContinue, onToggleRegion, onNext, onBack }) {
  const enabledGameIds = gameIds.filter((id) => config?.enabledGames?.[id]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        icon={<PlanetIcon size={26} weight="light" />}
        eyebrow={t("onboarding.regions.eyebrow")}
        title={t("onboarding.regions.title")}
        description={enabledGameIds.length > 0 ? t("onboarding.regions.description") : t("onboarding.regions.noGames")}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {enabledGameIds.map((id, index) => (
          <OnboardingRegionCard
            key={id}
            id={id}
            index={index}
            disabled={!config?.enabledGames?.[id]}
            selectedRegions={gameRegions[id] ?? []}
            onToggleRegion={onToggleRegion}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {enabledGameIds.length === 0 && (
          <SecondaryButton onClick={onBack}>
            <ArrowLeftIcon size={18} weight="bold" />
            {t("onboarding.regions.backToGames")}
          </SecondaryButton>
        )}
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          {t("onboarding.regions.continue")}
          <ArrowRightIcon size={18} weight="bold" />
        </PrimaryButton>
      </div>
    </div>
  );
}

function PreferencesStep({
  automationAvailable,
  saving,
  settingsMap,
  updateSetting,
  toggleStartup,
  toggleDiscordPresence,
  onFinish,
}) {
  const isWindows = window.navigator.userAgent.includes("Windows");
  const preferenceRows = [
    {
      id: "checkin",
      title: t("settings.game.checkIn.title"),
      description: automationAvailable
        ? t("settings.game.checkIn.description")
        : t("onboarding.preferences.cookiesNeeded"),
      state: !!settingsMap.checkin,
      disabled: !automationAvailable,
      onToggle: () => updateSetting("checkin", !settingsMap.checkin),
    },
    {
      id: "redeemcodes",
      title: t("settings.game.redemptionCodes.title"),
      description: automationAvailable
        ? t("settings.game.redemptionCodes.description")
        : t("onboarding.preferences.cookiesNeeded"),
      state: !!settingsMap.redeemcodes,
      disabled: !automationAvailable,
      onToggle: () => updateSetting("redeemcodes", !settingsMap.redeemcodes),
    },
    {
      id: "startup",
      title: t("settings.app.launchStartup.title"),
      description: t("settings.app.launchStartup.description"),
      state: !!settingsMap.startup,
      disabled: false,
      onToggle: toggleStartup,
    },
    {
      id: "background",
      title: t("settings.app.launchBackground.title"),
      description: t("settings.app.launchBackground.description"),
      state: !!settingsMap.background,
      disabled: false,
      onToggle: () => updateSetting("background", !settingsMap.background),
    },
    ...(isWindows ? [{
      id: "minimizetotray",
      title: t("settings.app.minimizeTray.title"),
      description: t("settings.app.minimizeTray.description"),
      state: !!settingsMap.minimizetotray,
      disabled: false,
      onToggle: () => updateSetting("minimizetotray", !settingsMap.minimizetotray),
    }] : []),
    {
      id: "notification",
      title: t("settings.app.rewardNotifications.title"),
      description: t("settings.app.rewardNotifications.description"),
      state: !!settingsMap.notification,
      disabled: false,
      onToggle: () => updateSetting("notification", !settingsMap.notification),
    },
    {
      id: "discordactivity",
      title: t("settings.app.discordActivity.title"),
      description: t("settings.app.discordActivity.description"),
      state: !!settingsMap.discordactivity,
      disabled: false,
      onToggle: toggleDiscordPresence,
    },
  ];

  return (
    <div className="flex flex-col items-center gap-5">
      <SectionHeader
        icon={<SlidersHorizontalIcon size={26} weight="light" />}
        eyebrow={t("onboarding.preferences.eyebrow")}
        title={t("onboarding.preferences.title")}
        description={t("onboarding.preferences.description")}
        compact
      />

      <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        {preferenceRows.map((row, index) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: index * 0.05, ease: "easeOut" }}
            className="flex min-h-28 items-center justify-between gap-4 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 p-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-aeon-primary-100">{row.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-aeon-primary-100/54">{row.description}</p>
            </div>
            <div className="shrink-0">
              <ToggleSwitch
                state={row.state}
                disabled={row.disabled}
                title={row.disabled ? t("settings.game.cookiesRequired") : ""}
                onClick={row.onToggle}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <PrimaryButton onClick={onFinish} disabled={saving}>
        {saving ? t("common.saving") : t("onboarding.preferences.finish")}
        {!saving && <CheckCircleIcon size={18} weight="fill" />}
      </PrimaryButton>
    </div>
  );
}

function ChoiceCard({ icon, selected, title, description, onClick, disabled = false, actionLabel }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-44 cursor-pointer flex-col justify-between rounded-lg border p-5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${
        selected
          ? "border-aeon-success-300 bg-aeon-surface-400"
          : "border-aeon-surface-300 bg-aeon-surface-500 hover:bg-aeon-surface-400"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border ${
          selected
            ? "border-aeon-success-300/60 bg-aeon-success-300/12 text-aeon-success-100"
            : "border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-300"
        }`}>
          {icon}
        </span>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
          selected
            ? "border-aeon-success-300 bg-aeon-success-300 text-aeon-surface-500"
            : "border-aeon-surface-200 text-transparent group-hover:border-aeon-success-300/60"
        }`}>
          <CheckCircleIcon size={18} weight="fill" />
        </span>
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-aeon-primary-100">{title}</h2>
        <p className="text-sm leading-relaxed text-aeon-primary-100/58">{description}</p>
        {actionLabel && (
          <span className="mt-2 text-sm font-semibold text-aeon-success-100">{actionLabel}</span>
        )}
      </div>
    </motion.button>
  );
}

function ImportMethodButton({ icon, selected, title, description, onClick, disabled = false, actionLabel }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      onClick={onClick}
      disabled={disabled}
      className={`group flex min-h-28 cursor-pointer items-center gap-4 rounded-lg border p-4 text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${
        selected
          ? "border-aeon-success-300 bg-aeon-surface-400"
          : "border-aeon-surface-300 bg-aeon-surface-500 hover:bg-aeon-surface-400"
      }`}
    >
      <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${
        selected
          ? "border-aeon-success-300/60 bg-aeon-success-300/12 text-aeon-success-100"
          : "border-aeon-surface-300 bg-aeon-surface-500 text-aeon-primary-300"
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-aeon-primary-100">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-aeon-primary-100/58">{description}</span>
        {actionLabel && (
          <span className="mt-2 block text-sm font-semibold text-aeon-success-100">{actionLabel}</span>
        )}
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
        selected
          ? "border-aeon-success-300 bg-aeon-success-300 text-aeon-surface-500"
          : "border-aeon-surface-200 text-transparent group-hover:border-aeon-success-300/60"
      }`}>
        <CheckCircleIcon size={18} weight="fill" />
      </span>
    </motion.button>
  );
}

function OnboardingGameCard({ id, enabled, onToggle, index }) {
  const foundGame = games.find((game) => game.id === id);
  const displayName = gameName(id, foundGame?.name ?? id);
  const assets = gameAssets[id];

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: index * 0.05, ease: "easeOut" }}
      onClick={onToggle}
      className="group relative h-28 cursor-pointer overflow-hidden rounded-lg text-left transition-colors"
    >
      <img
        src={assets.banner}
        className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        alt={t("home.gameBannerAlt", { game: displayName })}
      />
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-linear-to-t from-aeon-surface-500 via-aeon-surface-500/45 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={assets.icon}
            className="h-11 w-11 shrink-0 rounded-lg object-cover object-center"
            alt={displayName}
          />
          <div className="min-w-0">
            <p className="truncate text-lg leading-tight text-aeon-primary-100">{displayName}</p>
            <p className={enabled ? "text-sm text-aeon-success-100" : "text-sm text-aeon-primary-100/52"}>
              {enabled ? t("games.enabled") : t("games.disabled")}
            </p>
          </div>
        </div>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          enabled
            ? "bg-aeon-success-300 text-aeon-surface-500"
            : "bg-aeon-surface-500/80 text-transparent"
        }`}>
          <CheckCircleIcon size={20} weight="fill" />
        </span>
      </div>
    </motion.button>
  );
}

function OnboardingRegionCard({ id, index, disabled, selectedRegions, onToggleRegion }) {
  const foundGame = games.find((game) => game.id === id);
  const displayName = gameName(id, foundGame?.name ?? id);
  const assets = gameAssets[id];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: index * 0.05, ease: "easeOut" }}
      className={`overflow-hidden rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 ${
        disabled ? "opacity-55" : ""
      }`}
    >
      <div className="relative h-24 overflow-hidden">
        <img
          src={assets.banner}
          className="h-full w-full object-cover object-center"
          alt={t("home.gameBannerAlt", { game: displayName })}
        />
        <div className="absolute inset-0 bg-black/42" />
        <div className="absolute inset-0 bg-linear-to-t from-aeon-surface-500 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 p-4">
          <img
            src={assets.icon}
            className="h-11 w-11 shrink-0 rounded-lg object-cover object-center"
            alt={displayName}
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-aeon-primary-100">{displayName}</p>
            <p className="text-sm text-aeon-primary-100/48">
              {disabled ? t("games.disabled") : t("onboarding.regions.selectForGame")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 p-4">
        {REGION_OPTIONS.map((region) => (
          <OnboardingRegionChip
            key={region.value}
            label={t(region.labelKey)}
            active={selectedRegions.includes(region.value)}
            disabled={disabled}
            onClick={() => onToggleRegion(id, region.value)}
          />
        ))}
      </div>
    </motion.div>
  );
}

function OnboardingRegionChip({ label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed ${
        active
          ? "bg-aeon-success-300 text-aeon-surface-500 hover:bg-aeon-success-200"
          : "bg-aeon-surface-500 text-aeon-primary-100/62 hover:bg-aeon-surface-400 hover:text-aeon-primary-100"
      }`}
    >
      {label}
    </button>
  );
}

function ManualCookieHelp() {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 p-4"
    >
      <div className="grid grid-cols-1 gap-3 text-sm text-aeon-primary-100/62 sm:grid-cols-2">
        <HelpStep number="1">
          {t("manualCookies.step1BeforeLink")}{" "}
          <button
            type="button"
            onClick={() => openUrl("https://hoyolab.com/")}
            className="font-medium text-aeon-primary-300 underline underline-offset-2 transition-colors hover:text-aeon-primary-500"
          >
            {t("manualCookies.hoyolab")}
          </button>{" "}
          {t("manualCookies.step1AfterLink")}
        </HelpStep>
        <HelpStep number="2">
          {t("manualCookies.step2BeforeTooltip")} {t("manualCookies.devtools")}{t("manualCookies.step2AfterTooltip")}
        </HelpStep>
        <HelpStep number="3">
          {t("manualCookies.step3BeforeTooltip")} {t("manualCookies.storageCookies")} {t("manualCookies.step3AfterTooltip")}
        </HelpStep>
        <HelpStep number="4">{t("manualCookies.step4")}</HelpStep>
      </div>
    </motion.div>
  );
}

function HelpStep({ number, children }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-aeon-surface-300 text-xs font-bold text-aeon-primary-600">
        {number}
      </span>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function SecretInput({ placeholder, value, onChange }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        className="w-full rounded-lg border border-aeon-surface-300 bg-transparent px-3 py-3 pr-10 text-aeon-primary-100 outline-none transition-colors focus:border-aeon-success-300 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        type={visible ? "text" : "password"}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-aeon-primary-100/40 transition-colors hover:text-aeon-primary-100/80"
        title={visible ? t("common.hide") : t("common.show")}
      >
        {visible ? <EyeSlashIcon size={17} /> : <EyeIcon size={17} />}
      </button>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 min-w-40 cursor-pointer items-center justify-center gap-2 rounded-lg border border-aeon-success-300 bg-aeon-success-300 px-5 py-2.5 text-sm font-semibold text-aeon-surface-500 transition-colors duration-200 hover:bg-aeon-success-200 hover:border-aeon-success-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-aeon-surface-300 bg-aeon-surface-500 text-sm font-medium text-aeon-primary-100 transition-colors duration-200 hover:bg-aeon-surface-400 hover:border-aeon-surface-200 ${
        compact ? "h-9 min-w-24 px-3" : "min-h-10 min-w-40 px-5 py-2.5"
      }`}
    >
      {children}
    </button>
  );
}
