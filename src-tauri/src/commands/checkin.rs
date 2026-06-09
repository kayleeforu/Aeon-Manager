use crate::{config::AppConfig, i18n};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

const UTC8_OFFSET_SECONDS: i64 = 8 * 60 * 60;
const DAY_SECONDS: i64 = 24 * 60 * 60;
const DAILY_JITTER_MAX_SECONDS: u64 = 10 * 60;
const REQUEST_DELAY_MAX_SECONDS: u64 = 10;
const IDLE_POLL_SECONDS: u64 = 60;
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Clone, Copy)]
struct Game {
    id: &'static str,
    act_id: &'static str,
    api_endpoints: &'static [&'static str],
    sign_endpoint: &'static str,
    check_in_url: &'static str,
    sign_game: Option<&'static str>,
}

const GI_ENDPOINTS: [&str; 3] = [
    "https://sg-hk4e-api.hoyoverse.com",
    "https://sg-hk4e-api.hoyolab.com",
    "https://hk4e-api-os.hoyoverse.com",
];
const HSR_ENDPOINTS: [&str; 3] = [
    "https://sg-public-api.hoyolab.com",
    "https://sg-hk4e-api.hoyolab.com",
    "https://api-os-takumi.mihoyo.com",
];
const ZZZ_ENDPOINTS: [&str; 1] = ["https://sg-public-api.hoyolab.com"];
const HI3_ENDPOINTS: [&str; 3] = [
    "https://sg-public-api.hoyolab.com",
    "https://api-os-takumi.mihoyo.com",
    "https://sg-hk4e-api.hoyolab.com",
];
const TOT_ENDPOINTS: [&str; 1] = ["https://sg-public-api.hoyolab.com"];

const GAMES: &[Game] = &[
    Game {
        id: "gi",
        act_id: "e202102251931481",
        api_endpoints: &GI_ENDPOINTS,
        sign_endpoint: "/event/sol/sign",
        check_in_url: "https://act.hoyolab.com/ys/event/signin-sea-v3/index.html?act_id=e202102251931481",
        sign_game: None,
    },
    Game {
        id: "hsr",
        act_id: "e202303301540311",
        api_endpoints: &HSR_ENDPOINTS,
        sign_endpoint: "/event/luna/sign",
        check_in_url: "https://act.hoyolab.com/bbs/event/signin/hkrpg/index.html?act_id=e202303301540311",
        sign_game: None,
    },
    Game {
        id: "zzz",
        act_id: "e202406031448091",
        api_endpoints: &ZZZ_ENDPOINTS,
        sign_endpoint: "/event/luna/zzz/os/sign",
        check_in_url: "https://act.hoyolab.com/bbs/event/signin/zzz/e202406031448091.html?act_id=e202406031448091",
        sign_game: Some("zzz"),
    },
    Game {
        id: "hi3",
        act_id: "e202110291205111",
        api_endpoints: &HI3_ENDPOINTS,
        sign_endpoint: "/event/mani/sign",
        check_in_url: "https://act.hoyolab.com/bbs/event/signin-bh3/index.html?act_id=e202110291205111",
        sign_game: None,
    },
    Game {
        id: "tot",
        act_id: "e202202281857121",
        api_endpoints: &TOT_ENDPOINTS,
        sign_endpoint: "/event/luna/os/sign",
        check_in_url: "https://act.hoyolab.com/bbs/event/signin/nxx/index.html?act_id=e202202281857121",
        sign_game: None,
    },
];

#[derive(Default, Serialize, Deserialize)]
struct CheckInState {
    #[serde(default)]
    last_claimed_days: IndexMap<String, i64>,
    #[serde(default)]
    last_attempted_days: IndexMap<String, i64>,
    #[serde(default)]
    last_notified_day: Option<i64>,
    #[serde(default)]
    last_manual_reminder_day: Option<i64>,
    #[serde(default)]
    scheduled_utc8_day: Option<i64>,
    #[serde(default)]
    scheduled_delay_seconds: Option<u64>,
}

struct CheckInAttempt {
    game_name: String,
    status: CheckInAttemptStatus,
    message: String,
}

enum CheckInAttemptStatus {
    Claimed,
    AlreadyClaimed,
    Failed,
}

pub async fn start_auto_checkin_loop(app: AppHandle) {
    let client = reqwest::Client::new();

    loop {
        let next_sleep = match run_auto_checkin_tick(&app, &client).await {
            Ok(duration) => duration,
            Err(error) => {
                eprintln!(
                    "{}",
                    i18n::tr_with("native.logs.autoCheckinTickError", &[("error", error)])
                );
                Duration::from_secs(IDLE_POLL_SECONDS)
            }
        };

        tokio::time::sleep(next_sleep).await;
    }
}

async fn run_auto_checkin_tick(
    app: &AppHandle,
    client: &reqwest::Client,
) -> Result<Duration, String> {
    let config = AppConfig::load()?;
    if !is_auto_checkin_enabled(&config) {
        send_manual_checkin_reminder_if_due(app, &config)?;
        return Ok(idle_poll_duration());
    }

    let secrets = AppConfig::load_secrets()?;
    if secrets.cookies.is_empty() {
        return Ok(idle_poll_duration());
    }

    let state = load_state()?;
    let utc8_day = current_utc8_day();
    let due_games = due_enabled_games(&config, &state, utc8_day);
    if due_games.is_empty() {
        return Ok(idle_poll_duration());
    }

    let seconds_since_reset = seconds_since_utc8_midnight();
    let scheduled_delay = if seconds_since_reset <= DAILY_JITTER_MAX_SECONDS as i64 {
        scheduled_delay_for_day(state, utc8_day)?
    } else {
        0
    };
    if scheduled_delay > 0 && seconds_since_reset < scheduled_delay as i64 {
        return Ok(Duration::from_secs(
            (scheduled_delay as i64 - seconds_since_reset).max(1) as u64,
        ));
    }

    let config = AppConfig::load()?;
    let secrets = AppConfig::load_secrets()?;
    if !is_auto_checkin_enabled(&config) {
        return Ok(idle_poll_duration());
    }

    let Some(cookie_header) = cookie_header(&secrets.cookies) else {
        return Ok(idle_poll_duration());
    };

    let mut state = load_state()?;
    let utc8_day = current_utc8_day();
    let due_games = due_enabled_games(&config, &state, utc8_day);
    if due_games.is_empty() {
        return Ok(idle_poll_duration());
    }

    let should_notify =
        is_notification_enabled(&config) && state.last_notified_day != Some(utc8_day);
    let mut attempts = Vec::with_capacity(due_games.len());

    for (index, game) in due_games.iter().enumerate() {
        match claim_checkin_reward(client, game, &cookie_header).await {
            Ok(response) => {
                let attempt = checkin_attempt_from_response(game, &response);
                eprintln!("{}", format_checkin_result(&attempt));

                if matches!(
                    attempt.status,
                    CheckInAttemptStatus::Claimed | CheckInAttemptStatus::AlreadyClaimed
                ) {
                    if let Err(error) =
                        crate::commands::streaks::record_checkin_streak_for_game(app, game.id)
                            .await
                    {
                        eprintln!(
                            "{}",
                            i18n::tr_with(
                                "native.logs.failedUpdateStreak",
                                &[
                                    ("game", game_display_name(game.id)),
                                    ("error", error),
                                ],
                            )
                        );
                    }

                    state
                        .last_claimed_days
                        .insert(game.id.to_string(), utc8_day);
                }

                state
                    .last_attempted_days
                    .insert(game.id.to_string(), utc8_day);
                save_state(&state)?;
                attempts.push(attempt);
            }
            Err(error) => {
                eprintln!(
                    "{}",
                    i18n::tr_with(
                        "native.logs.autoCheckinFailed",
                        &[
                            ("game", game_display_name(game.id)),
                            ("error", error.clone()),
                        ],
                    )
                );
                state
                    .last_attempted_days
                    .insert(game.id.to_string(), utc8_day);
                save_state(&state)?;
                attempts.push(CheckInAttempt {
                    game_name: game_display_name(game.id),
                    status: CheckInAttemptStatus::Failed,
                    message: shorten_error(&error),
                });
            }
        }

        if index + 1 < due_games.len() {
            sleep_random_seconds(REQUEST_DELAY_MAX_SECONDS).await;
        }
    }

    if should_notify && !attempts.is_empty() {
        send_checkin_notification(app, &attempts);
        state.last_notified_day = Some(utc8_day);
        save_state(&state)?;
    }

    Ok(idle_poll_duration())
}

async fn claim_checkin_reward(
    client: &reqwest::Client,
    game: &Game,
    cookie_header: &str,
) -> Result<Value, String> {
    let mut last_error = None;

    for (index, base_url) in game.api_endpoints.iter().enumerate() {
        if index > 0 {
            sleep_random_seconds(REQUEST_DELAY_MAX_SECONDS).await;
        }

        let url = format!("{}{}", base_url, game.sign_endpoint);
        let mut request = client
            .post(&url)
            .header("User-Agent", USER_AGENT)
            .header("Cookie", cookie_header)
            .header("Accept", "application/json")
            .header("x-rpc-lang", "en-us")
            .header("x-rpc-client_type", "5")
            .header("x-rpc-platform", "4")
            .header("Content-type", "application/json; charset=utf-8")
            .header("Referer", game.check_in_url)
            .json(&json!({
                "act_id": game.act_id,
                "lang": "en-us"
            }));

        if let Some(sign_game) = game.sign_game {
            request = request.header("x-rpc-signgame", sign_game);
        }

        match request.send().await {
            Ok(response) => {
                let status = response.status();
                if !status.is_success() {
                    last_error = Some(format!("{} returned HTTP {}", url, status));
                    continue;
                }

                return response.json::<Value>().await.map_err(|e| e.to_string());
            }
            Err(error) => {
                last_error = Some(format!("{} request failed: {}", url, error));
            }
        }
    }

    Err(last_error.unwrap_or_else(|| i18n::tr("errors.common.allRequestsFailed")))
}

fn due_enabled_games(config: &AppConfig, state: &CheckInState, utc8_day: i64) -> Vec<Game> {
    GAMES
        .iter()
        .copied()
        .filter(|game| {
            config
                .enabled_games
                .get(game.id)
                .copied()
                .unwrap_or(false)
                && state
                    .last_claimed_days
                    .get(game.id)
                    .copied()
                    .unwrap_or_default()
                    != utc8_day
        })
        .collect()
}

fn is_auto_checkin_enabled(config: &AppConfig) -> bool {
    config
        .settings
        .get("checkin")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn is_notification_enabled(config: &AppConfig) -> bool {
    config
        .settings
        .get("notification")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn send_manual_checkin_reminder_if_due(
    app: &AppHandle,
    config: &AppConfig,
) -> Result<(), String> {
    if !is_notification_enabled(config) || enabled_games(config).is_empty() {
        return Ok(());
    }

    let utc8_day = current_utc8_day();
    let mut state = load_state()?;
    if state.last_manual_reminder_day == Some(utc8_day) {
        return Ok(());
    }

    let title = i18n::tr("native.checkin.manualReminderTitle");
    let body = i18n::tr("native.checkin.manualReminderBody");
    if let Err(error) = send_native_checkin_notification(app, &title, &body) {
        eprintln!(
            "{}",
            i18n::tr_with(
                "native.logs.failedShowCheckinNotification",
                &[("error", error)],
            )
        );
        return Ok(());
    }

    state.last_manual_reminder_day = Some(utc8_day);
    save_state(&state)
}

fn enabled_games(config: &AppConfig) -> Vec<Game> {
    GAMES
        .iter()
        .copied()
        .filter(|game| {
            config
                .enabled_games
                .get(game.id)
                .copied()
                .unwrap_or(false)
        })
        .collect()
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

fn checkin_attempt_from_response(game: &Game, response: &Value) -> CheckInAttempt {
    let retcode = response.get("retcode").and_then(|value| value.as_i64());
    let message = response
        .get("message")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| i18n::tr("errors.common.unknownResponse"));

    let (status, message) = match retcode {
        Some(0) => (
            CheckInAttemptStatus::Claimed,
            i18n::tr("native.checkin.claimed"),
        ),
        Some(-5003) => (
            CheckInAttemptStatus::AlreadyClaimed,
            i18n::tr("native.checkin.alreadyClaimed"),
        ),
        Some(-500012) => (
            CheckInAttemptStatus::Failed,
            i18n::tr("native.checkin.unavailable"),
        ),
        Some(code) => (
            CheckInAttemptStatus::Failed,
            shorten_error(&format!("{} ({})", message, code)),
        ),
        None => (
            CheckInAttemptStatus::Failed,
            shorten_error(&response.to_string()),
        ),
    };

    CheckInAttempt {
        game_name: game_display_name(game.id),
        status,
        message,
    }
}

fn format_checkin_result(attempt: &CheckInAttempt) -> String {
    match attempt.status {
        CheckInAttemptStatus::Claimed => i18n::tr_with(
            "native.checkin.resultSucceeded",
            &[("game", attempt.game_name.clone())],
        ),
        CheckInAttemptStatus::AlreadyClaimed => i18n::tr_with(
            "native.checkin.resultSkipped",
            &[
                ("game", attempt.game_name.clone()),
                ("message", attempt.message.clone()),
            ],
        ),
        CheckInAttemptStatus::Failed => i18n::tr_with(
            "native.checkin.resultFailed",
            &[
                ("game", attempt.game_name.clone()),
                ("message", attempt.message.clone()),
            ],
        ),
    }
}

fn send_checkin_notification(app: &AppHandle, attempts: &[CheckInAttempt]) {
    let claimed = attempts
        .iter()
        .filter(|attempt| {
            matches!(
                attempt.status,
                CheckInAttemptStatus::Claimed | CheckInAttemptStatus::AlreadyClaimed
            )
        })
        .count();
    let failed = attempts.len().saturating_sub(claimed);

    let title = if failed == 0 {
        i18n::tr("native.checkin.titleSuccess")
    } else {
        i18n::tr("native.checkin.titleFailed")
    };

    let body = if failed == 0 {
        if attempts.len() == 1 {
            i18n::tr_with(
                "native.checkin.singleSuccess",
                &[("game", attempts[0].game_name.clone())],
            )
        } else {
            i18n::tr_with("native.checkin.multiSuccess", &[("count", attempts.len().to_string())])
        }
    } else {
        let failed_games = attempts
            .iter()
            .filter(|attempt| matches!(attempt.status, CheckInAttemptStatus::Failed))
            .map(|attempt| format!("{}: {}", attempt.game_name, attempt.message))
            .collect::<Vec<_>>()
            .join("; ");

        if claimed > 0 {
            truncate_notification_body(&i18n::tr_with(
                "native.checkin.partialFailure",
                &[
                    ("claimed", claimed.to_string()),
                    ("total", attempts.len().to_string()),
                    ("failedGames", failed_games),
                ],
            ))
        } else {
            truncate_notification_body(&i18n::tr_with(
                "native.checkin.failure",
                &[("failedGames", failed_games)],
            ))
        }
    };

    if let Err(error) = send_native_checkin_notification(app, &title, &body) {
        eprintln!(
            "{}",
            i18n::tr_with(
                "native.logs.failedShowCheckinNotification",
                &[("error", error)],
            )
        );
    }
}

fn send_native_checkin_notification(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())?;

    let _ = app.emit("aeon-checkin-notification-sent", ());
    Ok(())
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

    truncate_notification_body(&reason)
}

fn truncate_notification_body(text: &str) -> String {
    const MAX_CHARS: usize = 140;

    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_CHARS {
        return trimmed.to_string();
    }

    let mut shortened = trimmed.chars().take(MAX_CHARS - 3).collect::<String>();
    shortened.push_str("...");
    shortened
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortens_common_network_errors() {
        let reason = shorten_error("https://example.test request failed: connection timed out");
        assert_eq!(reason, i18n::tr("errors.common.networkError"));
    }

    #[test]
    fn notification_body_stays_compact() {
        let long_text = "x".repeat(200);
        assert_eq!(truncate_notification_body(&long_text).chars().count(), 140);
    }

    #[test]
    fn due_games_ignore_failed_attempts_from_today() {
        let mut config = AppConfig::default();
        config.enabled_games.insert("gi".to_string(), true);
        let mut state = CheckInState::default();
        state.last_attempted_days.insert("gi".to_string(), 42);

        let due_games = due_enabled_games(&config, &state, 42);

        assert_eq!(due_games.len(), 1);
        assert_eq!(due_games[0].id, "gi");
    }

    #[test]
    fn due_games_skip_claimed_games_from_today() {
        let mut config = AppConfig::default();
        config.enabled_games.insert("gi".to_string(), true);
        let mut state = CheckInState::default();
        state.last_claimed_days.insert("gi".to_string(), 42);

        let due_games = due_enabled_games(&config, &state, 42);

        assert!(due_games.is_empty());
    }
}

fn load_state() -> Result<CheckInState, String> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(CheckInState::default());
    }

    let contents = std::fs::read_to_string(path).unwrap_or_default();
    Ok(serde_json::from_str::<CheckInState>(&contents).unwrap_or_default())
}

fn save_state(state: &CheckInState) -> Result<(), String> {
    let path = state_path()?;
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

fn scheduled_delay_for_day(mut state: CheckInState, utc8_day: i64) -> Result<u64, String> {
    if state.scheduled_utc8_day == Some(utc8_day) {
        if let Some(delay) = state.scheduled_delay_seconds {
            return Ok(delay.min(DAILY_JITTER_MAX_SECONDS));
        }
    }

    let delay = random_seconds(DAILY_JITTER_MAX_SECONDS);
    state.scheduled_utc8_day = Some(utc8_day);
    state.scheduled_delay_seconds = Some(delay);
    save_state(&state)?;
    Ok(delay)
}

fn state_path() -> Result<std::path::PathBuf, String> {
    let mut path = AppConfig::get_config_path()?;
    path.set_file_name("checkin_state.json");
    Ok(path)
}

fn current_utc8_day() -> i64 {
    (unix_seconds() + UTC8_OFFSET_SECONDS).div_euclid(DAY_SECONDS)
}

fn idle_poll_duration() -> Duration {
    let seconds = seconds_until_next_utc8_day()
        .max(1)
        .min(IDLE_POLL_SECONDS as i64) as u64;
    Duration::from_secs(seconds)
}

fn seconds_until_next_utc8_day() -> i64 {
    let now = unix_seconds();
    let current_day = (now + UTC8_OFFSET_SECONDS).div_euclid(DAY_SECONDS);
    ((current_day + 1) * DAY_SECONDS - UTC8_OFFSET_SECONDS) - now
}

fn seconds_since_utc8_midnight() -> i64 {
    (unix_seconds() + UTC8_OFFSET_SECONDS).rem_euclid(DAY_SECONDS)
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

async fn sleep_random_seconds(max_inclusive: u64) {
    let seconds = random_seconds(max_inclusive);
    if seconds > 0 {
        tokio::time::sleep(Duration::from_secs(seconds)).await;
    }
}

fn random_seconds(max_inclusive: u64) -> u64 {
    if max_inclusive == 0 {
        return 0;
    }

    let value = uuid::Uuid::new_v4().as_u128();
    (value % (u128::from(max_inclusive) + 1)) as u64
}

fn game_display_name(game_id: &str) -> String {
    i18n::tr(&format!("gameNames.{}", game_id))
}
