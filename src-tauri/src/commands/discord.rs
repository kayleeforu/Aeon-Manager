use std::time::Duration;
use tauri::{Manager, State};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use crate::{config::AppConfig, i18n, DiscordState};

pub fn connect() -> Result<DiscordIpcClient, String> {
    let mut client = DiscordIpcClient::new("1509608134963105882");
    client.connect().map_err(|e| e.to_string())?;
    client.set_activity(
        activity::Activity::new()
            .state(i18n::tr("native.discord.state"))
            .details(i18n::tr("native.discord.details"))
            .assets(
                activity::Assets::new()
                    .large_image("aeon_manager_icon")
                    .large_text(i18n::tr("app.name")),
            ),
    ).map_err(|e| e.to_string())?;
    Ok(client)
}

pub fn initial_connect() -> Option<DiscordIpcClient> {
    match connect() {
        Ok(client) => Some(client),
        Err(e) => {
            eprintln!(
                "{}",
                i18n::tr_with("native.logs.initialDiscordConnectionFailed", &[("error", e)])
            );
            None
        }
    }
}

pub async fn start_retry_loop(app_handle: tauri::AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_secs(15)).await;

        let config = AppConfig::load().unwrap_or_default();
        let enabled = config.settings
            .get("discordactivity")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let state = app_handle.state::<DiscordState>();
        let mut guard = state.0.lock().unwrap();

        if !enabled {
            if let Some(mut client) = guard.take() {
                let _ = client.close();
            }
            continue;
        }

        if guard.is_none() {
            if let Ok(client) = connect() {
                *guard = Some(client);
            }
        }
    }
}

#[tauri::command]
pub async fn enable_discord(state: State<'_, DiscordState>) -> Result<(), String> {
    {
        let guard = state.0.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
    }

    let client = tokio::task::spawn_blocking(connect)
        .await
        .map_err(|e| e.to_string())??;

    let mut guard = state.0.lock().unwrap();
    *guard = Some(client);
    Ok(())
}

#[tauri::command]
pub fn disable_discord(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut client) = guard.take() {
        let _ = client.close();
    }
    Ok(())
}
