import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { t } from "../i18n";

const CHECK_TIMEOUT_MS = 15000;

export async function checkForUpdates({ setNotification, manual = false } = {}) {
  try {
    const update = await check({ timeout: CHECK_TIMEOUT_MS });

    if (!update) {
      if (manual) {
        setNotification?.({
          visible: true,
          message: t("updates.none"),
          type: "success",
        });
      }

      return null;
    }

    setNotification?.({
      visible: true,
      message: t("updates.available", { version: update.version }),
      type: "info",
      button: (
        <button
          type="button"
          onClick={() => installUpdate(update, setNotification)}
          className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-lg border border-aeon-success-300 bg-aeon-success-300 px-3 text-sm font-semibold text-aeon-surface-500 transition-colors duration-200 hover:border-aeon-success-200 hover:bg-aeon-success-200"
        >
          {t("updates.install")}
        </button>
      ),
    });

    return update;
  } catch (error) {
    if (manual) {
      setNotification?.({
        visible: true,
        message: t("updates.failed", { error }),
        type: "error",
      });
    }

    return null;
  }
}

async function installUpdate(update, setNotification) {
  try {
    setNotification?.({
      visible: true,
      message: t("updates.installing"),
      type: "info",
    });

    await update.downloadAndInstall();
    await invoke("restart_app");
  } catch (error) {
    setNotification?.({
      visible: true,
      message: t("updates.installFailed", { error }),
      type: "error",
    });
  }
}
