use crate::{config::AppConfig, i18n, secure_store};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

const API_URL: &str = "https://aeon-manager.ddnsfree.com:8443";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const POLL_SECONDS: u64 = 5 * 60;
const RETRY_AFTER_SECONDS: i64 = 60 * 60;
const REDEEM_DELAY_MIN_SECONDS: u64 = 7;
const REDEEM_DELAY_MAX_SECONDS: u64 = 16;
const ENDPOINT_RETRY_DELAY_MIN_SECONDS: u64 = 2;
const ENDPOINT_RETRY_DELAY_MAX_SECONDS: u64 = 5;

#[derive(Clone, Deserialize)]
struct ApiCodeEntry {
    code: String,
    game_id: String,
    expires_at: Option<i64>,
    added_at: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeEntry {
    code: String,
    game_id: String,
    expires_at: Option<i64>,
    added_at: i64,
}

#[derive(Clone, Deserialize)]
struct ApiHistoryEntry {
    code: String,
    game_id: String,
    region: String,
    status: String,
    message: Option<String>,
    attempted_at: i64,
    redeemed_at: Option<i64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeRedemptionHistoryEntry {
    code: String,
    game_id: String,
    region: String,
    status: String,
    message: Option<String>,
    attempted_at: i64,
    redeemed_at: Option<i64>,
}

#[derive(Serialize)]
struct RecordCodeAttemptRequest {
    code: String,
    game_id: String,
    region: String,
    status: String,
    message: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeRedemptionState {
    #[serde(default)]
    history: Vec<CodeRedemptionHistoryEntry>,
}

#[derive(Clone, Deserialize)]
struct GameRolesResponse {
    retcode: Option<i64>,
    message: Option<String>,
    data: Option<GameRolesData>,
}

#[derive(Clone, Deserialize)]
struct GameRolesData {
    #[serde(default)]
    list: Vec<GameRole>,
}

#[derive(Clone, Deserialize)]
struct GameRole {
    #[serde(default)]
    game_uid: String,
    #[serde(default)]
    region: String,
    #[serde(default)]
    region_name: String,
}

#[derive(Clone, Copy)]
struct GameRedeemConfig {
    id: &'static str,
    game_biz: &'static str,
    redeem_endpoints: &'static [&'static str],
}

const GI_REDEEM_ENDPOINTS: [&str; 2] = [
    "https://sg-hk4e-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkey",
    "https://sg-hk4e-api.hoyolab.com/common/apicdkey/api/webExchangeCdkey",
];
const HSR_REDEEM_ENDPOINTS: [&str; 3] = [
    "https://sg-hkrpg-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkey",
    "https://sg-public-api.hoyoverse.com/common/apicdkey/api/webExchangeCdkey",
    "https://sg-public-api.hoyolab.com/common/apicdkey/api/webExchangeCdkey",
];
const ZZZ_REDEEM_ENDPOINTS: [&str; 3] = [
    "https://public-operation-nap.hoyoverse.com/common/apicdkey/api/webExchangeCdkey",
    "https://sg-act-nap-api.hoyolab.com/common/apicdkey/api/webExchangeCdkey",
    "https://sg-public-api.hoyolab.com/common/apicdkey/api/webExchangeCdkey",
];

const REDEEM_GAMES: &[GameRedeemConfig] = &[
    GameRedeemConfig {
        id: "gi",
        game_biz: "hk4e_global",
        redeem_endpoints: &GI_REDEEM_ENDPOINTS,
    },
    GameRedeemConfig {
        id: "hsr",
        game_biz: "hkrpg_global",
        redeem_endpoints: &HSR_REDEEM_ENDPOINTS,
    },
    GameRedeemConfig {
        id: "zzz",
        game_biz: "nap_global",
        redeem_endpoints: &ZZZ_REDEEM_ENDPOINTS,
    },
];

impl From<ApiCodeEntry> for CodeEntry {
    fn from(value: ApiCodeEntry) -> Self {
        Self {
            code: value.code,
            game_id: value.game_id,
            expires_at: value.expires_at,
            added_at: value.added_at,
        }
    }
}

impl From<ApiHistoryEntry> for CodeRedemptionHistoryEntry {
    fn from(value: ApiHistoryEntry) -> Self {
        Self {
            code: value.code,
            game_id: value.game_id,
            region: value.region,
            status: value.status,
            message: value.message,
            attempted_at: value.attempted_at,
            redeemed_at: value.redeemed_at,
        }
    }
}

pub async fn start_auto_code_redemption_loop(app: AppHandle) {
    let client = reqwest::Client::new();

    loop {
        if let Err(error) = run_auto_code_redemption_tick(&app, &client).await {
            eprintln!(
                "{}",
                i18n::tr_with("native.logs.autoCodeRedemptionError", &[("error", error)])
            );
        }

        tokio::time::sleep(Duration::from_secs(POLL_SECONDS)).await;
    }
}

#[tauri::command]
pub async fn get_redemption_codes() -> Result<Vec<CodeEntry>, String> {
    fetch_codes(&reqwest::Client::new()).await
}

#[tauri::command]
pub async fn get_code_redemption_history() -> Result<Vec<CodeRedemptionHistoryEntry>, String> {
    let client = reqwest::Client::new();
    let mut history = load_state()?
        .history
        .into_iter()
        .map(normalize_history_entry)
        .collect::<Vec<_>>();

    if let Some(token) = get_token()? {
        if let Ok(server_history) = fetch_server_history(&client, &token).await {
            for entry in server_history {
                upsert_history_entry(&mut history, normalize_history_entry(entry));
            }
        }
    }

    sort_history(&mut history);
    Ok(history)
}

#[tauri::command]
pub async fn run_code_redemption_now(app: AppHandle) -> Result<(), String> {
    run_auto_code_redemption_tick(&app, &reqwest::Client::new()).await?;
    Ok(())
}

#[tauri::command]
pub async fn retry_code_redemption(
    app: AppHandle,
    code: String,
    game_id: String,
    region: String,
) -> Result<CodeRedemptionHistoryEntry, String> {
    retry_code_redemption_entry(&app, &reqwest::Client::new(), code, game_id, region).await
}

async fn run_auto_code_redemption_tick(
    app: &AppHandle,
    client: &reqwest::Client,
) -> Result<(), String> {
    let config = AppConfig::load()?;
    if !is_auto_redeem_enabled(&config) {
        return Ok(());
    }

    let secrets = AppConfig::load_secrets()?;
    let Some(cookie_header) = cookie_header(&secrets.cookies) else {
        return Ok(());
    };

    let codes = fetch_codes(client).await?;
    if codes.is_empty() {
        return Ok(());
    }

    let token = get_token()?;
    let mut state = load_state()?;
    let mut roles_by_game = IndexMap::<String, Result<Vec<GameRole>, String>>::new();
    let mut changed = false;
    let mut successful_entries = Vec::new();

    for code in codes {
        if !is_game_enabled(&config, &code.game_id) || is_expired(code.expires_at) {
            continue;
        }

        let selected_regions = selected_regions_for_game(&config, &code.game_id);
        if selected_regions.is_empty() {
            continue;
        }

        let Some(game) = redeem_config(&code.game_id) else {
            continue;
        };

        if !roles_by_game.contains_key(game.id) {
            let roles = fetch_game_roles(client, game, &cookie_header).await;
            roles_by_game.insert(game.id.to_string(), roles);
        }

        let roles = match roles_by_game.get(game.id) {
            Some(Ok(roles)) => roles.clone(),
            Some(Err(error)) => {
                for region in &selected_regions {
                    if !should_attempt(&state.history, &code, region) {
                        continue;
                    }

                    let entry = history_entry(
                        &code,
                        region,
                        "failed",
                        Some(shorten_error(error)),
                        None,
                    );
                    record_attempt(client, token.as_deref(), &entry).await;
                    upsert_history_entry(&mut state.history, entry);
                    changed = true;
                }
                continue;
            }
            None => continue,
        };

        for region in &selected_regions {
            if !should_attempt(&state.history, &code, region) {
                continue;
            }

            let Some(role) = roles.iter().find(|role| role_matches_region(role, region)).cloned() else {
                let entry = history_entry(
                    &code,
                    region,
                    "missing_role",
                    Some(i18n::tr_with(
                        "errors.codes.missingRoleForRegion",
                        &[("region", region.clone())],
                    )),
                    None,
                );
                record_attempt(client, token.as_deref(), &entry).await;
                upsert_history_entry(&mut state.history, entry);
                changed = true;
                continue;
            };

            let entry = redeem_code(client, game, &code, region, &role, &cookie_header).await;
            if should_notify_code_success(&entry) {
                successful_entries.push(entry.clone());
            }
            record_attempt(client, token.as_deref(), &entry).await;
            upsert_history_entry(&mut state.history, entry);
            changed = true;

            sleep_random_seconds(REDEEM_DELAY_MIN_SECONDS, REDEEM_DELAY_MAX_SECONDS).await;
        }
    }

    if changed {
        sort_history(&mut state.history);
        state.history.truncate(500);
        save_state(&state)?;
        let _ = app.emit("aeon-code-redemption-updated", ());
        send_code_redemption_notification(app, &config, &successful_entries);
    }

    Ok(())
}

async fn retry_code_redemption_entry(
    app: &AppHandle,
    client: &reqwest::Client,
    code: String,
    game_id: String,
    region: String,
) -> Result<CodeRedemptionHistoryEntry, String> {
    let code_value = code.trim();
    let game_id = game_id.trim();
    let region = region.trim();

    if code_value.is_empty() {
        return Err(i18n::tr("errors.codes.codeRequired"));
    }

    if region.is_empty() {
        return Err(i18n::tr("errors.codes.regionRequired"));
    }

    let config = AppConfig::load()?;
    if !is_game_enabled(&config, game_id) {
        return Err(i18n::tr_with(
            "errors.common.unsupportedGameId",
            &[("gameId", game_id.to_string())],
        ));
    }

    let secrets = AppConfig::load_secrets()?;
    let Some(cookie_header) = cookie_header(&secrets.cookies) else {
        return Err(i18n::tr("errors.settings.automationCookiesRequired"));
    };

    let Some(game) = redeem_config(game_id) else {
        return Err(i18n::tr("errors.codes.unsupported"));
    };

    let code_entry = fetch_codes(client)
        .await
        .ok()
        .and_then(|codes| {
            codes
                .into_iter()
                .find(|entry| entry.code == code_value && entry.game_id == game_id)
        })
        .unwrap_or_else(|| CodeEntry {
            code: code_value.to_string(),
            game_id: game_id.to_string(),
            expires_at: None,
            added_at: unix_seconds(),
        });

    let entry = match fetch_game_roles(client, game, &cookie_header).await {
        Ok(roles) => {
            if let Some(role) = roles
                .iter()
                .find(|role| role_matches_region(role, region))
                .cloned()
            {
                redeem_code(client, game, &code_entry, region, &role, &cookie_header).await
            } else {
                history_entry(
                    &code_entry,
                    region,
                    "missing_role",
                    Some(i18n::tr_with(
                        "errors.codes.missingRoleForRegion",
                        &[("region", region.to_string())],
                    )),
                    None,
                )
            }
        }
        Err(error) => history_entry(
            &code_entry,
            region,
            "failed",
            Some(shorten_error(&error)),
            None,
        ),
    };

    let token = get_token()?;
    record_attempt(client, token.as_deref(), &entry).await;

    let mut state = load_state()?;
    upsert_history_entry(&mut state.history, entry.clone());
    sort_history(&mut state.history);
    state.history.truncate(500);
    save_state(&state)?;
    let _ = app.emit("aeon-code-redemption-updated", ());
    if should_notify_code_success(&entry) {
        send_code_redemption_notification(app, &config, std::slice::from_ref(&entry));
    }

    Ok(entry)
}

async fn fetch_codes(client: &reqwest::Client) -> Result<Vec<CodeEntry>, String> {
    let response = client
        .get(format!("{}/codes", API_URL))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.codes.failedFetchCodes")));
    }

    let codes = response
        .json::<Vec<ApiCodeEntry>>()
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(CodeEntry::from)
        .collect::<Vec<_>>();

    Ok(codes)
}

async fn fetch_server_history(
    client: &reqwest::Client,
    token: &str,
) -> Result<Vec<CodeRedemptionHistoryEntry>, String> {
    let response = client
        .get(format!("{}/codes/history", API_URL))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.codes.failedFetchHistory")));
    }

    Ok(response
        .json::<Vec<ApiHistoryEntry>>()
        .await
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(CodeRedemptionHistoryEntry::from)
        .collect())
}

async fn fetch_game_roles(
    client: &reqwest::Client,
    game: GameRedeemConfig,
    cookie_header: &str,
) -> Result<Vec<GameRole>, String> {
    let response = client
        .get(format!(
            "https://api-account-os.hoyolab.com/binding/api/getUserGameRolesByCookie?game_biz={}",
            url_encode(game.game_biz)
        ))
        .header("User-Agent", USER_AGENT)
        .header("Cookie", cookie_header)
        .header("Accept", "application/json")
        .header("x-rpc-lang", "en-us")
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(i18n::tr_with(
            "errors.codes.rolesHttp",
            &[("status", response.status().to_string())],
        ));
    }

    let body = response
        .json::<GameRolesResponse>()
        .await
        .map_err(|error| error.to_string())?;

    if body.retcode.unwrap_or_default() != 0 {
        return Err(body
            .message
            .unwrap_or_else(|| i18n::tr("errors.codes.failedFetchLinkedAccounts")));
    }

    Ok(body.data.map(|data| data.list).unwrap_or_default())
}

async fn redeem_code(
    client: &reqwest::Client,
    game: GameRedeemConfig,
    code: &CodeEntry,
    region_label: &str,
    role: &GameRole,
    cookie_header: &str,
) -> CodeRedemptionHistoryEntry {
    let mut last_message = i18n::tr("errors.codes.allEndpointsFailed");

    for (index, endpoint) in game.redeem_endpoints.iter().enumerate() {
        if index > 0 {
            sleep_random_seconds(ENDPOINT_RETRY_DELAY_MIN_SECONDS, ENDPOINT_RETRY_DELAY_MAX_SECONDS).await;
        }

        let url = format!(
            "{}?{}",
            endpoint,
            query_string(&[
                ("uid", role.game_uid.as_str()),
                ("region", role.region.as_str()),
                ("lang", "en-us"),
                ("cdkey", code.code.as_str()),
                ("game_biz", game.game_biz),
                ("sLangKey", "en-us"),
            ])
        );

        let response = client
            .get(url)
            .header("User-Agent", USER_AGENT)
            .header("Cookie", cookie_header)
            .header("Accept", "application/json")
            .header("x-rpc-lang", "en-us")
            .send()
            .await;

        let response = match response {
            Ok(response) => response,
            Err(error) => {
                last_message = error.to_string();
                continue;
            }
        };

        if !response.status().is_success() {
            last_message = i18n::tr_with(
                "errors.codes.redemptionHttp",
                &[("status", response.status().to_string())],
            );
            continue;
        }

        let body = match response.json::<Value>().await {
            Ok(body) => body,
            Err(error) => {
                last_message = error.to_string();
                continue;
            }
        };

        let (status, message) = redemption_status(&body);
        return history_entry(
            code,
            region_label,
            &status,
            Some(message),
            successful_status(&status).then_some(unix_seconds()),
        );
    }

    history_entry(
        code,
        region_label,
        "failed",
        Some(shorten_error(&last_message)),
        None,
    )
}

async fn record_attempt(
    client: &reqwest::Client,
    token: Option<&str>,
    entry: &CodeRedemptionHistoryEntry,
) {
    let Some(token) = token else {
        return;
    };

    let request = RecordCodeAttemptRequest {
        code: entry.code.clone(),
        game_id: entry.game_id.clone(),
        region: entry.region.clone(),
        status: entry.status.clone(),
        message: entry.message.clone(),
    };

    let response = client
        .post(format!("{}/codes/attempt", API_URL))
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", USER_AGENT)
        .json(&request)
        .send()
        .await;

    if let Err(error) = response {
        eprintln!(
            "{}",
            i18n::tr_with(
                "native.logs.failedRecordCodeAttempt",
                &[("error", error.to_string())],
            )
        );
    }
}

fn history_entry(
    code: &CodeEntry,
    region: &str,
    status: &str,
    message: Option<String>,
    redeemed_at: Option<i64>,
) -> CodeRedemptionHistoryEntry {
    CodeRedemptionHistoryEntry {
        code: code.code.clone(),
        game_id: code.game_id.clone(),
        region: region.to_string(),
        status: status.to_string(),
        message,
        attempted_at: unix_seconds(),
        redeemed_at,
    }
}

fn redemption_status(body: &Value) -> (String, String) {
    let retcode = body.get("retcode").and_then(|value| value.as_i64());
    let message = body
        .get("message")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| i18n::tr("errors.common.unknownResponse"))
        .trim()
        .to_string();
    let lowered = message.to_lowercase();

    match retcode {
        Some(0) => ("redeemed".to_string(), i18n::tr("errors.codes.redeemed")),
        Some(-2017) | Some(-2018) => (
            "already_redeemed".to_string(),
            i18n::tr("errors.codes.alreadyRedeemed"),
        ),
        _ if lowered.contains("already") || lowered.contains("used") => {
            ("already_redeemed".to_string(), message)
        }
        _ if lowered.contains("expired") => ("expired".to_string(), message),
        _ => (
            "failed".to_string(),
            redemption_error_detail(retcode, &message),
        ),
    }
}

fn redemption_error_detail(
    retcode: Option<i64>,
    message: &str,
) -> String {
    let message = match retcode {
        Some(-2001) => i18n::tr("errors.codes.codeUnavailable"),
        _ => readable_error(message),
    };

    match retcode {
        Some(retcode) => i18n::tr_with(
            "errors.codes.redemptionRetcode",
            &[
                ("message", message),
                ("retcode", retcode.to_string()),
            ],
        ),
        None => i18n::tr("errors.codes.redemptionUnknownResponse"),
    }
}

fn readable_error(error: &str) -> String {
    let error = error.trim();
    if error.is_empty() {
        return i18n::tr("errors.common.unknownResponse");
    }

    let mut chars = error.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => i18n::tr("errors.common.unknownResponse"),
    }
}

fn should_notify_code_success(entry: &CodeRedemptionHistoryEntry) -> bool {
    entry.status == "redeemed"
}

fn send_code_redemption_notification(
    app: &AppHandle,
    config: &AppConfig,
    successful_entries: &[CodeRedemptionHistoryEntry],
) {
    let successful_entries = successful_entries
        .iter()
        .filter(|entry| should_notify_code_success(entry))
        .collect::<Vec<_>>();

    if successful_entries.is_empty() || !is_notification_enabled(config) {
        return;
    }

    let title = i18n::tr("native.codes.titleSuccess");
    let body = if successful_entries.len() == 1 {
        let entry = successful_entries[0];
        i18n::tr_with(
            "native.codes.singleSuccess",
            &[
                ("code", entry.code.clone()),
                ("game", game_display_name(&entry.game_id)),
                ("region", entry.region.clone()),
            ],
        )
    } else {
        i18n::tr_with(
            "native.codes.multiSuccess",
            &[("count", successful_entries.len().to_string())],
        )
    };

    if let Err(error) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!(
            "{}",
            i18n::tr_with(
                "native.logs.failedShowCodeRedemptionNotification",
                &[("error", error.to_string())],
            )
        );
    }
}

fn normalize_history_entry(mut entry: CodeRedemptionHistoryEntry) -> CodeRedemptionHistoryEntry {
    if entry.status == "failed" && has_already_redeemed_retcode(entry.message.as_deref()) {
        entry.status = "already_redeemed".to_string();
        entry.message = Some(i18n::tr("errors.codes.alreadyRedeemed"));
        entry.redeemed_at = entry.redeemed_at.or(Some(entry.attempted_at));
    }

    if entry.status == "failed" && has_code_unavailable_retcode(entry.message.as_deref()) {
        entry.message = Some(i18n::tr("errors.codes.codeUnavailable"));
    }

    entry
}

fn has_already_redeemed_retcode(message: Option<&str>) -> bool {
    let Some(message) = message else {
        return false;
    };

    message.contains("retcode -2017")
        || message.contains("\"retcode\":-2017")
        || message.contains("retcode -2018")
        || message.contains("\"retcode\":-2018")
}

fn has_code_unavailable_retcode(message: Option<&str>) -> bool {
    let Some(message) = message else {
        return false;
    };

    message.contains("retcode -2001") || message.contains("\"retcode\":-2001")
}

fn should_attempt(history: &[CodeRedemptionHistoryEntry], code: &CodeEntry, region: &str) -> bool {
    let Some(entry) = history
        .iter()
        .filter(|entry| {
            entry.code == code.code && entry.game_id == code.game_id && entry.region == region
        })
        .max_by_key(|entry| entry.attempted_at)
    else {
        return true;
    };

    if successful_status(&entry.status) || matches!(entry.status.as_str(), "expired" | "unsupported") {
        return false;
    }

    if is_expired(code.expires_at) {
        return false;
    }

    unix_seconds().saturating_sub(entry.attempted_at) >= RETRY_AFTER_SECONDS
}

fn successful_status(status: &str) -> bool {
    matches!(status, "redeemed" | "already_redeemed")
}

fn upsert_history_entry(
    history: &mut Vec<CodeRedemptionHistoryEntry>,
    entry: CodeRedemptionHistoryEntry,
) {
    if let Some(existing) = history.iter_mut().find(|existing| {
        existing.code == entry.code
            && existing.game_id == entry.game_id
            && existing.region == entry.region
    }) {
        let existing_time = existing.redeemed_at.unwrap_or(existing.attempted_at);
        let entry_time = entry.redeemed_at.unwrap_or(entry.attempted_at);
        if entry_time >= existing_time {
            *existing = entry;
        }
    } else {
        history.push(entry);
    }
}

fn sort_history(history: &mut [CodeRedemptionHistoryEntry]) {
    history.sort_by(|a, b| {
        let a_time = a.redeemed_at.unwrap_or(a.attempted_at);
        let b_time = b.redeemed_at.unwrap_or(b.attempted_at);
        b_time.cmp(&a_time)
    });
}

fn is_auto_redeem_enabled(config: &AppConfig) -> bool {
    config
        .settings
        .get("redeemcodes")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn is_game_enabled(config: &AppConfig, game_id: &str) -> bool {
    config
        .enabled_games
        .get(game_id)
        .copied()
        .unwrap_or(false)
}

fn is_notification_enabled(config: &AppConfig) -> bool {
    config
        .settings
        .get("notification")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn selected_regions_for_game(config: &AppConfig, game_id: &str) -> Vec<String> {
    let Some(regions_setting) = config.settings.get("regions") else {
        return Vec::new();
    };

    if let Some(regions) = regions_setting.as_array() {
        return clean_regions(regions);
    }

    regions_setting
        .as_object()
        .and_then(|regions_by_game| regions_by_game.get(game_id))
        .and_then(|regions| regions.as_array())
        .map(|regions| clean_regions(regions))
        .unwrap_or_default()
}

fn clean_regions(regions: &[Value]) -> Vec<String> {
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

fn redeem_config(game_id: &str) -> Option<GameRedeemConfig> {
    REDEEM_GAMES.iter().copied().find(|game| game.id == game_id)
}

fn role_matches_region(role: &GameRole, selected_region: &str) -> bool {
    let normalized_label = normalize_region(selected_region);
    let normalized_name = normalize_region(&role.region_name);
    let normalized_code = normalize_region(&role.region);

    match normalized_label.as_str() {
        "europe" => {
            normalized_name.contains("europe")
                || normalized_code.contains("euro")
                || normalized_code.contains("eur")
                || normalized_code.ends_with("eu")
        }
        "asia" => {
            normalized_name.contains("asia")
                || normalized_code.contains("asia")
                || normalized_code.contains("jp")
                || normalized_code.ends_with("sg")
        }
        "america" => {
            normalized_name.contains("america")
                || normalized_code.contains("usa")
                || normalized_code.ends_with("us")
        }
        "twhkmo" => {
            normalized_name.contains("twhkmo")
                || normalized_code.contains("cht")
                || normalized_code.contains("tw")
        }
        _ => normalized_name.contains(&normalized_label) || normalized_code.contains(&normalized_label),
    }
}

fn normalize_region(region: &str) -> String {
    region
        .chars()
        .filter(|char| char.is_ascii_alphanumeric())
        .flat_map(|char| char.to_lowercase())
        .collect()
}

fn query_string(params: &[(&str, &str)]) -> String {
    params
        .iter()
        .map(|(key, value)| format!("{}={}", url_encode(key), url_encode(value)))
        .collect::<Vec<_>>()
        .join("&")
}

fn url_encode(value: &str) -> String {
    let mut encoded = String::new();

    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }

    encoded
}

fn cookie_header(cookies: &IndexMap<String, String>) -> Option<String> {
    let header = cookies
        .iter()
        .filter(|(_, value)| !value.trim().is_empty())
        .map(|(key, value)| format!("{}={}", key, value))
        .collect::<Vec<_>>()
        .join("; ");

    if header.is_empty() {
        None
    } else {
        Some(header)
    }
}

fn get_token() -> Result<Option<String>, String> {
    secure_store::load_account_token()
}

fn is_expired(expires_at: Option<i64>) -> bool {
    expires_at.is_some_and(|timestamp| timestamp <= unix_seconds())
}

fn load_state() -> Result<CodeRedemptionState, String> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(CodeRedemptionState::default());
    }

    let contents = std::fs::read_to_string(path).unwrap_or_default();
    Ok(serde_json::from_str::<CodeRedemptionState>(&contents).unwrap_or_default())
}

fn save_state(state: &CodeRedemptionState) -> Result<(), String> {
    let path = state_path()?;
    let json = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(path, json).map_err(|error| error.to_string())
}

fn state_path() -> Result<std::path::PathBuf, String> {
    let mut path = AppConfig::get_config_path()?;
    path.set_file_name("code_redemption_state.json");
    Ok(path)
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn shorten_error(error: &str) -> String {
    let error = error.trim();
    if error.is_empty() {
        return i18n::tr("errors.common.unknownError");
    }

    let lowered = error.to_lowercase();
    let reason =
        if lowered.contains("cookie") || lowered.contains("login") || lowered.contains("auth") {
            i18n::tr("errors.common.loginCookiesExpired")
        } else if lowered.contains("network")
            || lowered.contains("request failed")
            || lowered.contains("connection")
            || lowered.contains("timeout")
            || lowered.contains("dns")
        {
            i18n::tr("errors.common.networkError")
        } else if lowered.contains("http 401") || lowered.contains("http 403") {
            i18n::tr("errors.common.accessDenied")
        } else if lowered.contains("http 429") {
            i18n::tr("errors.common.rateLimited")
        } else {
            error.to_string()
        };

    truncate(&reason)
}

fn truncate(text: &str) -> String {
    const MAX_CHARS: usize = 140;

    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_CHARS {
        return trimmed.to_string();
    }

    let mut shortened = trimmed.chars().take(MAX_CHARS - 3).collect::<String>();
    shortened.push_str("...");
    shortened
}

async fn sleep_random_seconds(min_inclusive: u64, max_inclusive: u64) {
    let seconds = random_seconds(min_inclusive, max_inclusive);
    tokio::time::sleep(Duration::from_secs(seconds)).await;
}

fn random_seconds(min_inclusive: u64, max_inclusive: u64) -> u64 {
    if max_inclusive <= min_inclusive {
        return min_inclusive;
    }

    let span = max_inclusive - min_inclusive;
    let value = uuid::Uuid::new_v4().as_u128();
    min_inclusive + (value % (u128::from(span) + 1)) as u64
}

fn game_display_name(game_id: &str) -> String {
    i18n::tr(&format!("gameNames.{}", game_id))
}
