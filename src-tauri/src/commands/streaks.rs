use crate::{config::AppConfig, i18n, secure_store};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const API_URL: &str = "https://aeon-manager.ddnsfree.com:8443";
const UTC8_OFFSET_SECONDS: i64 = 8 * 60 * 60;
const DAY_SECONDS: i64 = 24 * 60 * 60;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakEntry {
    pub game_id: String,
    pub current_streak: i64,
    pub last_checkin_day: Option<i64>,
    pub last_checkin_date: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct StreakState {
    #[serde(default)]
    streaks: IndexMap<String, StreakEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordStreakRequest {
    game_id: String,
}

#[tauri::command]
pub async fn get_streaks() -> Result<IndexMap<String, StreakEntry>, String> {
    let mut state = load_state()?;

    if let Some(token) = get_token()? {
        if let Ok(remote_streaks) = fetch_remote_streaks(&token).await {
            for entry in remote_streaks {
                state.streaks.insert(entry.game_id.clone(), entry);
            }
            save_state(&state)?;
        }
    }

    Ok(state.streaks)
}

#[tauri::command]
pub async fn record_checkin_streak(app: AppHandle, game_id: String) -> Result<StreakEntry, String> {
    validate_game_id(&game_id)?;
    record_checkin_streak_for_game(&app, &game_id).await
}

pub async fn record_checkin_streak_for_game(
    app: &AppHandle,
    game_id: &str,
) -> Result<StreakEntry, String> {
    let local_entry = record_local_checkin_streak(game_id)?;
    let mut updated = local_entry.clone();

    if let Some(token) = get_token()? {
        match record_remote_checkin_streak(&token, game_id).await {
            Ok(remote_entry) => {
                save_streak_entry(&remote_entry)?;
                updated = remote_entry;
            }
            Err(error) => {
                eprintln!(
                    "{}",
                    i18n::tr_with(
                        "native.logs.failedSyncStreak",
                        &[
                            ("gameId", game_id.to_string()),
                            ("error", error),
                        ],
                    )
                );
            }
        }
    }

    let _ = app.emit("aeon-streaks-updated", &updated);
    Ok(updated)
}

fn record_local_checkin_streak(game_id: &str) -> Result<StreakEntry, String> {
    let mut state = load_state()?;
    let today = current_utc8_day();
    let entry = state
        .streaks
        .entry(game_id.to_string())
        .or_insert_with(|| StreakEntry {
            game_id: game_id.to_string(),
            current_streak: 0,
            last_checkin_day: None,
            last_checkin_date: None,
        });

    let next_streak = next_streak_value(entry.current_streak, entry.last_checkin_day, today);
    entry.current_streak = next_streak;
    entry.last_checkin_day = Some(today);
    entry.last_checkin_date = Some(utc8_day_to_date(today));

    let updated = entry.clone();
    save_state(&state)?;
    Ok(updated)
}

fn save_streak_entry(entry: &StreakEntry) -> Result<(), String> {
    let mut state = load_state()?;
    state.streaks.insert(entry.game_id.clone(), entry.clone());
    save_state(&state)
}

async fn fetch_remote_streaks(token: &str) -> Result<Vec<StreakEntry>, String> {
    let response = reqwest::Client::new()
        .get(format!("{}/streaks", API_URL))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.streaks.failedFetch")));
    }

    response.json::<Vec<StreakEntry>>().await.map_err(|error| error.to_string())
}

async fn record_remote_checkin_streak(token: &str, game_id: &str) -> Result<StreakEntry, String> {
    let response = reqwest::Client::new()
        .post(format!("{}/streaks/checkin", API_URL))
        .header("Authorization", format!("Bearer {}", token))
        .json(&RecordStreakRequest {
            game_id: game_id.to_string(),
        })
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(response
            .text()
            .await
            .unwrap_or_else(|_| i18n::tr("errors.streaks.failedRecord")));
    }

    response.json::<StreakEntry>().await.map_err(|error| error.to_string())
}

fn get_token() -> Result<Option<String>, String> {
    secure_store::load_account_token()
}

fn next_streak_value(current_streak: i64, last_checkin_day: Option<i64>, today: i64) -> i64 {
    match last_checkin_day {
        Some(day) if day == today => current_streak.max(1),
        Some(day) if day == today - 1 => current_streak.max(0) + 1,
        _ => 1,
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

fn load_state() -> Result<StreakState, String> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(StreakState::default());
    }

    let contents = std::fs::read_to_string(path).unwrap_or_default();
    Ok(serde_json::from_str::<StreakState>(&contents).unwrap_or_default())
}

fn save_state(state: &StreakState) -> Result<(), String> {
    let path = state_path()?;
    let json = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    std::fs::write(path, json).map_err(|error| error.to_string())
}

fn state_path() -> Result<std::path::PathBuf, String> {
    let mut path = AppConfig::get_config_path()?;
    path.set_file_name("streaks_state.json");
    Ok(path)
}

fn current_utc8_day() -> i64 {
    (unix_seconds() + UTC8_OFFSET_SECONDS).div_euclid(DAY_SECONDS)
}

fn utc8_day_to_date(day: i64) -> String {
    let seconds = day * DAY_SECONDS - UTC8_OFFSET_SECONDS;
    let days = seconds.div_euclid(DAY_SECONDS);
    civil_from_days(days)
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn civil_from_days(days_since_epoch: i64) -> String {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096).div_euclid(365);
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2).div_euclid(153);
    let day = doy - (153 * mp + 2).div_euclid(5) + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };

    format!("{:04}-{:02}-{:02}", year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increments_when_previous_checkin_was_yesterday() {
        assert_eq!(next_streak_value(7, Some(41), 42), 8);
    }

    #[test]
    fn does_not_increment_twice_on_same_day() {
        assert_eq!(next_streak_value(7, Some(42), 42), 7);
    }

    #[test]
    fn resets_after_a_missed_day() {
        assert_eq!(next_streak_value(7, Some(40), 42), 1);
    }
}
