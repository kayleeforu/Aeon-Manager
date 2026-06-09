use crate::{i18n, secure_store};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::json;

const GAME_IDS: [&str; 5] = ["tot", "hi3", "zzz", "hsr", "gi"];

#[derive(Serialize, Deserialize, Debug)]
pub struct AppConfig {
    #[serde(default, skip_serializing)]
    pub cookies: IndexMap<String, String>,
    #[serde(rename = "enabledGames")]
    pub enabled_games: IndexMap<String, bool>,
    pub settings: IndexMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Default)]
pub struct SecretsConfig {
    pub cookies: IndexMap<String, String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut games = IndexMap::new();
        for game_id in GAME_IDS {
            games.insert(game_id.to_string(), false);
        }

        let mut settings: IndexMap<String, serde_json::Value> = IndexMap::new();
        settings.insert("checkin".to_string(), json!(false));
        settings.insert("redeemcodes".to_string(), json!(false));
        settings.insert("startup".to_string(), json!(false));
        settings.insert("background".to_string(), json!(false));
        settings.insert("minimizetotray".to_string(), json!(false));
        settings.insert("notification".to_string(), json!(false));
        settings.insert("regions".to_string(), json!({}));
        settings.insert("language".to_string(), json!("English"));
        settings.insert("sidebarcollapsed".to_string(), json!(false));
        settings.insert("discordactivity".to_string(), json!(true));
        settings.insert("onboardingcomplete".to_string(), json!(false));
        settings.insert("uuid".to_string(), json!(null));
        settings.insert("username".to_string(), json!(null));
        settings.insert("token".to_string(), json!(null));

        AppConfig {
            cookies: IndexMap::new(),
            enabled_games: games,
            settings,
        }
    }
}

impl AppConfig {
    fn get_app_dir() -> Result<std::path::PathBuf, String> {
        let mut path =
            dirs::config_dir().ok_or_else(|| i18n::tr("errors.config.configDirMissing"))?;
        path.push("AeonManager");
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        Ok(path)
    }

    pub fn get_config_path() -> Result<std::path::PathBuf, String> {
        let mut path = Self::get_app_dir()?;
        path.push("config.json");
        Ok(path)
    }

    pub fn get_secrets_path() -> Result<std::path::PathBuf, String> {
        let mut path = Self::get_app_dir()?;
        path.push("secrets.json");
        Ok(path)
    }

    pub fn load_secrets() -> Result<SecretsConfig, String> {
        load_file_secrets()
    }

    pub fn save_secrets(secrets: &SecretsConfig) -> Result<(), String> {
        save_file_secrets(secrets)
    }

    pub fn cookies_exist() -> Result<bool, String> {
        Ok(!Self::load_secrets()?.cookies.is_empty())
    }

    pub fn load() -> Result<Self, String> {
        let path = Self::get_config_path()?;
        let default = Self::default();

        if !path.exists() {
            return Ok(default);
        }

        let contents = std::fs::read_to_string(&path).unwrap_or_default();
        let mut config = serde_json::from_str::<AppConfig>(&contents).unwrap_or_default();
        let has_onboarding_setting = config.settings.contains_key("onboardingcomplete");

        migrate_legacy_secrets(&mut config)?;

        config.settings.retain(|key, _| default.settings.contains_key(key));
        for (key, value) in default.settings {
            config.settings.entry(key).or_insert(value);
        }
        if !has_onboarding_setting {
            config.settings.insert("onboardingcomplete".to_string(), json!(true));
        }
        normalize_regions_setting(&mut config.settings);
        if !Self::cookies_exist()? {
            config.settings.insert("checkin".to_string(), json!(false));
            config.settings.insert("redeemcodes".to_string(), json!(false));
        }

        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        std::fs::write(&path, json).map_err(|e| e.to_string())?;

        Ok(config)
    }
}

fn clean_region_array(regions: &[serde_json::Value]) -> Vec<String> {
    regions
        .iter()
        .filter_map(|region| region.as_str())
        .map(str::trim)
        .filter(|region| !region.is_empty())
        .fold(Vec::<String>::new(), |mut cleaned, region| {
            if !cleaned.iter().any(|current| current == region) {
                cleaned.push(region.to_string());
            }
            cleaned
        })
}

fn normalize_regions_setting(settings: &mut IndexMap<String, serde_json::Value>) {
    let Some(regions) = settings.get("regions").cloned() else {
        settings.insert("regions".to_string(), json!({}));
        return;
    };

    if let Some(legacy_regions) = regions.as_array() {
        let cleaned = clean_region_array(legacy_regions);
        let regions_by_game = if cleaned.is_empty() {
            json!({})
        } else {
            let mut mapped = serde_json::Map::new();
            for game_id in GAME_IDS {
                mapped.insert(game_id.to_string(), json!(cleaned));
            }
            serde_json::Value::Object(mapped)
        };

        settings.insert("regions".to_string(), regions_by_game);
        return;
    }

    let Some(regions_by_game) = regions.as_object() else {
        settings.insert("regions".to_string(), json!({}));
        return;
    };

    let mut cleaned_regions = serde_json::Map::new();
    for game_id in GAME_IDS {
        let Some(regions) = regions_by_game.get(game_id).and_then(|value| value.as_array()) else {
            continue;
        };

        let cleaned = clean_region_array(regions);
        if !cleaned.is_empty() {
            cleaned_regions.insert(game_id.to_string(), json!(cleaned));
        }
    }

    settings.insert("regions".to_string(), serde_json::Value::Object(cleaned_regions));
}

fn load_file_secrets() -> Result<SecretsConfig, String> {
    let path = AppConfig::get_secrets_path()?;
    if !path.exists() {
        return Ok(SecretsConfig::default());
    }

    let contents = std::fs::read_to_string(path).unwrap_or_default();
    Ok(serde_json::from_str::<SecretsConfig>(&contents).unwrap_or_default())
}

fn save_file_secrets(secrets: &SecretsConfig) -> Result<(), String> {
    let path = AppConfig::get_secrets_path()?;
    if secrets.cookies.is_empty() {
        match std::fs::remove_file(path) {
            Ok(_) => return Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.to_string()),
        }
    }

    let json = serde_json::to_string_pretty(secrets).map_err(|error| error.to_string())?;
    std::fs::write(path, json).map_err(|error| error.to_string())
}

fn migrate_legacy_secrets(config: &mut AppConfig) -> Result<(), String> {
    if !config.cookies.is_empty() {
        save_file_secrets(&SecretsConfig {
            cookies: config.cookies.clone(),
        })?;
        config.cookies.clear();
    }

    if let Some(token) = config
        .settings
        .get("token")
        .and_then(|value| value.as_str())
        .filter(|token| !token.trim().is_empty())
    {
        if secure_store::load_account_token()?.is_none() {
            secure_store::save_account_token(token)?;
        }
    }
    config.settings.insert("token".to_string(), json!(null));

    Ok(())
}
