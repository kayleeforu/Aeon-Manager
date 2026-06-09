use crate::{config::AppConfig, i18n, secure_store};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const API_URL: &str = "https://aeon-manager.ddnsfree.com:8443";
const REQUEST_TIMEOUT_SECONDS: u64 = 20;

fn get_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

async fn get_token() -> Result<String, String> {
    if let Some(token) = secure_store::load_account_token()? {
        return Ok(token);
    }

    refresh_account_token().await
}

async fn refresh_account_token() -> Result<String, String> {
    let account = get_account_identity()?;
    let restored = fetch_restore_token(&account.username, &account.uuid).await?;
    persist_account_state(&restored.uuid, &account.username, &restored.token)?;
    Ok(restored.token)
}

async fn send_authenticated<F>(mut build: F) -> Result<reqwest::Response, String>
where
    F: FnMut(&reqwest::Client, &str) -> reqwest::RequestBuilder,
{
    let client = get_client();
    let token = get_token().await?;
    let response = build(&client, &token)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if response.status() != StatusCode::UNAUTHORIZED {
        return Ok(response);
    }

    secure_store::remove_account_token()?;
    let token = refresh_account_token().await?;
    build(&client, &token)
        .send()
        .await
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
struct CreateAccountRequest {
    username: String,
}

#[derive(Deserialize)]
struct CreateAccountResponse {
    uuid: String,
    token: Option<String>,
}

#[derive(Serialize)]
struct RestoreAccountRequest {
    username: String,
    uuid: String,
}

#[derive(Deserialize)]
struct RestoreAccountResponse {
    uuid: String,
    token: String,
}

#[derive(Serialize)]
struct UpdateUsernameRequest {
    new_username: String,
}

#[derive(Deserialize)]
struct RecoveryCodeResponse {
    recovery_uuid: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct RegenerateUuidResponse {
    uuid: String,
}

#[derive(Deserialize)]
struct RegenerateUuidServerResponse {
    uuid: String,
    token: String,
}

struct AccountIdentity {
    username: String,
    uuid: String,
}

fn get_account_identity() -> Result<AccountIdentity, String> {
    let config = AppConfig::load().map_err(|e| e.to_string())?;
    let username = config
        .settings
        .get("username")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| i18n::tr("errors.account.notLoggedIn"))?;
    let uuid = config
        .settings
        .get("uuid")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| i18n::tr("errors.account.notLoggedIn"))?;

    if uuid::Uuid::parse_str(uuid).is_err() {
        return Err(i18n::tr("errors.account.notLoggedIn"));
    }

    Ok(AccountIdentity {
        username: username.to_string(),
        uuid: uuid.to_string(),
    })
}

fn validate_username(username: &str) -> Result<(), String> {
    if username.is_empty() {
        return Err(i18n::tr("errors.account.usernameEmpty"));
    }

    if username.chars().count() > 16 {
        return Err(i18n::tr("errors.account.usernameTooLong"));
    }

    if username.chars().any(|char| char.is_control() || char == ':') {
        return Err(i18n::tr("errors.account.usernameInvalid"));
    }

    Ok(())
}

fn persist_account_state(uuid: &str, username: &str, token: &str) -> Result<(), String> {
    let path = AppConfig::get_config_path()?;
    let mut config = if path.exists() {
        let contents = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str::<AppConfig>(&contents).unwrap_or_default()
    } else {
        AppConfig::default()
    };

    config.settings.insert("uuid".to_string(), serde_json::json!(uuid));
    config.settings.insert("username".to_string(), serde_json::json!(username));
    config.settings.insert("token".to_string(), serde_json::json!(null));
    secure_store::save_account_token(token)?;

    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

async fn fetch_restore_token(username: &str, uuid: &str) -> Result<RestoreAccountResponse, String> {
    let res = get_client()
        .post(format!("{}/account/restore", API_URL))
        .json(&RestoreAccountRequest {
            username: username.to_string(),
            uuid: uuid.to_string(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = res.status();
    let response_text = res
        .text()
        .await
        .map_err(|_| i18n::tr("errors.account.unreadableServerResponse"))?;

    if !status.is_success() {
        let message = response_text.trim();
        return Err(if message.is_empty() {
            i18n::tr("errors.account.accountNotFound")
        } else {
            message.to_string()
        });
    }

    parse_restore_response(username, uuid, &response_text)
}

fn parse_restore_response(
    username: &str,
    uuid: &str,
    response_text: &str,
) -> Result<RestoreAccountResponse, String> {
    let trimmed = response_text.trim();

    if trimmed.is_empty() {
        return Err(i18n::tr("errors.account.emptyServerResponse"));
    }

    if let Ok(body) = serde_json::from_str::<RestoreAccountResponse>(trimmed) {
        return Ok(body);
    }

    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(token) = value
            .get("token")
            .or_else(|| value.get("access_token"))
            .or_else(|| value.get("authToken"))
            .and_then(|value| value.as_str())
            .filter(|token| !token.trim().is_empty())
        {
            let restored_uuid = value
                .get("uuid")
                .or_else(|| value.get("recovery_uuid"))
                .and_then(|value| value.as_str())
                .unwrap_or(uuid);

            return Ok(RestoreAccountResponse {
                uuid: restored_uuid.to_string(),
                token: token.to_string(),
            });
        }

        if let Some(token) = value.as_str().filter(|token| !token.trim().is_empty()) {
            return Ok(RestoreAccountResponse {
                uuid: uuid.to_string(),
                token: token.to_string(),
            });
        }
    }

    if !trimmed.contains('{') && !trimmed.contains('}') && !trimmed.contains(char::is_whitespace) {
        return Ok(RestoreAccountResponse {
            uuid: uuid.to_string(),
            token: trimmed.trim_matches('"').to_string(),
        });
    }

    Err(i18n::tr_with(
        "errors.account.unexpectedServerResponse",
        &[
            ("username", username.to_string()),
            ("response", response_text.to_string()),
        ],
    ))
}

#[tauri::command]
pub async fn create_account(username: String) -> Result<String, String> {
    let username = username.trim().to_string();
    validate_username(&username)?;

    let res = get_client()
        .post(format!("{}/account/create", API_URL))
        .json(&CreateAccountRequest { username: username.clone() })
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.common.unknownError")));
    }

    let response_text = res
        .text()
        .await
        .map_err(|_| i18n::tr("errors.account.unreadableServerResponse"))?;
    let body: CreateAccountResponse =
        serde_json::from_str(&response_text).map_err(|error| error.to_string())?;

    let restored = match body.token.filter(|token| !token.trim().is_empty()) {
        Some(token) => RestoreAccountResponse {
            uuid: body.uuid,
            token,
        },
        None => fetch_restore_token(&username, &body.uuid).await?,
    };
    persist_account_state(&restored.uuid, &username, &restored.token)?;

    Ok(restored.uuid)
}

#[tauri::command]
pub async fn restore_account(username: String, uuid: String) -> Result<String, String> {
    let username = username.trim().to_string();
    let uuid = uuid.trim().to_string();
    validate_username(&username)?;
    uuid::Uuid::parse_str(&uuid).map_err(|_| i18n::tr("errors.account.invalidUuid"))?;

    let restored = fetch_restore_token(&username, &uuid).await?;
    persist_account_state(&restored.uuid, &username, &restored.token)?;

    Ok(restored.uuid)
}

#[tauri::command]
pub async fn generate_secondary_code() -> Result<String, String> {
    let res = send_authenticated(|client, token| {
        client
            .post(format!("{}/account/recovery/generate", API_URL))
            .header("Authorization", format!("Bearer {}", token))
    })
    .await?;

    if !res.status().is_success() {
        return Err(res
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.common.unknownError")));
    }

    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_secondary_code() -> Result<(), String> {
    let res = send_authenticated(|client, token| {
        client
            .delete(format!("{}/account/recovery", API_URL))
            .header("Authorization", format!("Bearer {}", token))
    })
    .await?;

    if !res.status().is_success() {
        return Err(res
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.common.unknownError")));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_secondary_code() -> Result<Option<String>, String> {
    let res = send_authenticated(|client, token| {
        client
            .get(format!("{}/account/recovery", API_URL))
            .header("Authorization", format!("Bearer {}", token))
    })
    .await?;

    if !res.status().is_success() {
        return Err(res
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.common.unknownError")));
    }

    let body: RecoveryCodeResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(body.recovery_uuid)
}

#[tauri::command]
pub async fn update_username(new_username: String) -> Result<(), String> {
    let new_username = new_username.trim().to_string();
    validate_username(&new_username)?;

    let res = send_authenticated(|client, token| {
        client
            .patch(format!("{}/account/username", API_URL))
            .header("Authorization", format!("Bearer {}", token))
            .json(&UpdateUsernameRequest {
                new_username: new_username.clone(),
            })
    })
    .await?;

    if !res.status().is_success() {
        return Err(res
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.common.unknownError")));
    }

    let path = AppConfig::get_config_path()?;
    let mut config = if path.exists() {
        let contents = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str::<AppConfig>(&contents).unwrap_or_default()
    } else {
        AppConfig::default()
    };

    config.settings.insert("username".to_string(), serde_json::json!(new_username));

    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn regenerate_uuid() -> Result<RegenerateUuidResponse, String> {
    let account = get_account_identity()?;

    let res = send_authenticated(|client, token| {
        client
            .patch(format!("{}/account/uuid", API_URL))
            .header("Authorization", format!("Bearer {}", token))
    })
    .await?;

    if !res.status().is_success() {
        return Err(res
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.common.unknownError")));
    }

    let response_text = res.text().await.map_err(|e| e.to_string())?;

    if let Ok(body) = serde_json::from_str::<RegenerateUuidServerResponse>(&response_text) {
        persist_account_state(&body.uuid, &account.username, &body.token)?;
        return Ok(RegenerateUuidResponse { uuid: body.uuid });
    }

    let fallback_uuid = response_text.trim().trim_matches('"').to_string();
    if uuid::Uuid::parse_str(&fallback_uuid).is_err() {
        return Err(i18n::tr_with(
            "errors.account.unexpectedServerResponse",
            &[("response", response_text)],
        ));
    }

    let restored = fetch_restore_token(&account.username, &fallback_uuid).await?;
    persist_account_state(&restored.uuid, &account.username, &restored.token)?;

    Ok(RegenerateUuidResponse {
        uuid: restored.uuid,
    })
}
