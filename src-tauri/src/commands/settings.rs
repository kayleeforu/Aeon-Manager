use crate::{config::AppConfig, i18n, secure_store};
use indexmap::IndexMap;
use serde::Serialize;
use tauri_plugin_autostart::ManagerExt;

#[derive(Serialize)]
struct SafeConfig {
    cookies: bool,
    #[serde(rename = "enabledGames")]
    enabled_games: IndexMap<String, bool>,
    settings: IndexMap<String, serde_json::Value>,
}

fn validate_setting(option: &str, value: &serde_json::Value) -> Result<(), String> {
    match option {
        "checkin" | "redeemcodes" | "startup" | "background" | "minimizetotray" | "notification" | "discordactivity" | "onboardingcomplete" => {
            value.as_bool().map(|_| ()).ok_or_else(|| {
                i18n::tr_with("errors.settings.settingBoolean", &[("option", option.to_string())])
            })
        }
        "regions" => {
            let regions_by_game = value
                .as_object()
                .ok_or_else(|| i18n::tr("errors.settings.regionsType"))?;

            for game_id in regions_by_game.keys() {
                validate_game_id(game_id)?;
            }

            let valid = regions_by_game.values().all(|regions| {
                regions.as_array().is_some_and(|regions| {
                    regions
                        .iter()
                        .all(|region| region.as_str().is_some_and(|value| !value.trim().is_empty()))
                })
            });

            if valid {
                Ok(())
            } else {
                Err(i18n::tr("errors.settings.emptyRegions"))
            }
        }
        "language" => value
            .as_str()
            .map(|_| ())
            .ok_or_else(|| i18n::tr("errors.settings.languageType")),
        "sidebarcollapsed" => value
            .as_bool()
            .map(|_| ())
            .ok_or_else(|| i18n::tr("errors.settings.sidebarType")),
        "uuid" | "username" => {
            if value.is_null() || value.as_str().is_some() {
                Ok(())
            } else {
                Err(i18n::tr_with(
                    "errors.settings.settingStringOrNull",
                    &[("option", option.to_string())],
                ))
            }
        }
        _ => Err(i18n::tr_with(
            "errors.settings.unsupportedSetting",
            &[("option", option.to_string())],
        )),
    }
}

fn validate_game_id(game_id: &str) -> Result<(), String> {
    match game_id {
        "gi" | "hsr" | "zzz" | "hi3" | "tot" => Ok(()),
        _ => Err(i18n::tr_with(
            "errors.common.unsupportedGameId",
            &[("gameId", game_id.to_string())],
        )),
    }
}

#[tauri::command]
pub fn get_config() -> Result<String, String> {
    let config = AppConfig::load()?;
    let mut settings = config.settings;
    settings.shift_remove("token");

    let safe = SafeConfig {
        cookies: AppConfig::cookies_exist()?,
        enabled_games: config.enabled_games,
        settings,
    };

    serde_json::to_string(&safe).map_err(|e| {
        i18n::tr_with(
            "errors.settings.failedStringifyConfig",
            &[("error", e.to_string())],
        )
    })
}

#[tauri::command]
pub fn update_config(option: String, value: serde_json::Value) -> Result<bool, String> {
    validate_setting(&option, &value)?;
    if matches!(option.as_str(), "checkin" | "redeemcodes")
        && value.as_bool().unwrap_or(false)
        && !AppConfig::cookies_exist()?
    {
        return Err(i18n::tr("errors.settings.automationCookiesRequired"));
    }

    let path = AppConfig::get_config_path()?;
    let mut config = AppConfig::load()?;

    config.settings.insert(option, value);
    if config.settings.get("uuid").and_then(|v| v.as_str()).is_none()
        || config.settings.get("username").and_then(|v| v.as_str()).is_none()
    {
        config.settings.insert("token".to_string(), serde_json::json!(null));
        secure_store::remove_account_token()?;
    }

    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn set_startup_enabled(app: tauri::AppHandle, enabled: bool) -> Result<bool, String> {
    let autostart_manager = app.autolaunch();
    if enabled {
        autostart_manager.enable().map_err(|e| e.to_string())?;
    } else {
        autostart_manager.disable().map_err(|e| e.to_string())?;
    }

    update_config("startup".to_string(), serde_json::json!(enabled))
}

#[tauri::command]
pub fn update_game(game_id: String, enabled: bool) -> Result<bool, String> {
    validate_game_id(&game_id)?;
    let path = AppConfig::get_config_path()?;
    let mut config = AppConfig::load()?;

    config.enabled_games.insert(game_id, enabled);

    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}
