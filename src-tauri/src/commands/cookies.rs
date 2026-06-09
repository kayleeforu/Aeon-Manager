use crate::{
    config::{AppConfig, SecretsConfig},
    i18n,
};
use rookie::common::enums::Cookie;

#[tauri::command]
pub fn import_cookies() -> Result<(), String> {
    let domains = Some(vec!["hoyolab.com".to_string()]);
    let mut cookies = Vec::new();

    let browsers: Vec<(&str, fn(Option<Vec<String>>) -> Result<_, _>)> = vec![
        ("Arc",       rookie::arc),
        ("Brave",     rookie::brave),
        ("Chrome",    rookie::chrome),
        ("Chromium",  rookie::chromium),
        ("Edge",      rookie::edge),
        ("Firefox",   rookie::firefox),
        ("Librewolf", rookie::librewolf),
        ("Opera",     rookie::opera),
        ("OperaGX",   rookie::opera_gx),
        ("Vivaldi",   rookie::vivaldi),
        ("Zen",       rookie::zen),
    ];

    for (_, load) in browsers {
        if let Ok(found) = load(domains.clone()) {
            if !found.is_empty() {
                cookies = found;
                break;
            }
        }
    }

    let account_cookies: Vec<&Cookie> = cookies
        .iter()
        .filter(|c| matches!(c.name.as_str(), "account_id_v2" | "cookie_token_v2"))
        .collect();

    if account_cookies.is_empty() {
        return Err(i18n::tr("errors.cookies.importMissing"));
    }

    let mut secrets = SecretsConfig::default();
    for cookie in account_cookies {
        secrets.cookies.insert(cookie.name.clone(), cookie.value.clone());
    }

    AppConfig::save_secrets(&secrets)?;
    if !AppConfig::cookies_exist()? {
        return Err(i18n::tr("errors.cookies.saveFailedAfterImport"));
    }
    Ok(())
}

#[tauri::command]
pub fn check_cookies_existance() -> Result<bool, String> {
    AppConfig::cookies_exist()
}

#[tauri::command]
pub fn import_cookies_manual(cookie_token: String, account_id: String) -> Result<(), String> {
    let cookie_token = cookie_token.trim();
    let account_id = account_id.trim();
    if cookie_token.is_empty() || account_id.is_empty() {
        return Err(i18n::tr("errors.cookies.manualRequired"));
    }

    let mut secrets = SecretsConfig::default();
    secrets.cookies.insert("cookie_token_v2".to_string(), cookie_token.to_string());
    secrets.cookies.insert("account_id_v2".to_string(), account_id.to_string());
    AppConfig::save_secrets(&secrets)?;
    if !AppConfig::cookies_exist()? {
        return Err(i18n::tr("errors.cookies.saveFailed"));
    }
    Ok(())
}

#[tauri::command]
pub fn remove_cookies() -> Result<(), String> {
    AppConfig::save_secrets(&SecretsConfig::default())?;
    let path = AppConfig::get_config_path()?;
    let mut config = AppConfig::load()?;
    config.settings.insert("checkin".to_string(), serde_json::json!(false));
    config.settings.insert("redeemcodes".to_string(), serde_json::json!(false));
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}
