mod config;
mod commands;
mod i18n;
mod secure_store;

use std::sync::Mutex;
use discord_rich_presence::{DiscordIpcClient};
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
#[cfg(not(target_os = "macos"))]
use tauri::menu::{MenuBuilder, MenuItemBuilder};
#[cfg(not(target_os = "macos"))]
use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use config::AppConfig;

pub struct DiscordState(pub Mutex<Option<DiscordIpcClient>>);

#[cfg(target_os = "macos")]
fn quit_shortcut() -> &'static str {
    "Command+Q"
}

#[cfg(not(target_os = "macos"))]
fn quit_shortcut() -> &'static str {
    "Ctrl+Q"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = AppConfig::load().unwrap_or_default();

    let discord_enabled = config.settings
        .get("discordactivity")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let discord_client = if discord_enabled {
        commands::discord::initial_connect()
    } else {
        None
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(DiscordState(Mutex::new(discord_client)))
        .invoke_handler(tauri::generate_handler![
            commands::cookies::import_cookies,
            commands::cookies::check_cookies_existance,
            commands::settings::get_config,
            commands::settings::update_config,
            commands::settings::set_startup_enabled,
            commands::settings::update_game,
            commands::settings::restart_app,
            commands::settings::exit_app,
            commands::network::fetch_checkin_rewards,
            commands::account::create_account,
            commands::account::restore_account,
            commands::account::generate_secondary_code,
            commands::account::delete_secondary_code,
            commands::account::get_secondary_code,
            commands::account::update_username,
            commands::account::regenerate_uuid,
            commands::discord::enable_discord,
            commands::discord::disable_discord,
            commands::codes::get_redemption_codes,
            commands::codes::get_code_redemption_history,
            commands::codes::run_code_redemption_now,
            commands::codes::retry_code_redemption,
            commands::cookies::import_cookies_manual,
            commands::cookies::remove_cookies,
            commands::streaks::get_streaks,
            commands::streaks::record_checkin_streak,
        ])
        .setup(|app| {
            if let Err(error) = app.global_shortcut().on_shortcut(
                quit_shortcut(),
                |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        app.exit(0);
                    }
                },
            ) {
                eprintln!("Failed to register quit shortcut: {error}");
            }

            let config = AppConfig::load().unwrap_or_default();
            let background = config.settings
                .get("background")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let window = app.get_webview_window("main").unwrap();
            if background {
                window.hide()?;
            } else {
                window.unminimize()?;
                window.show()?;
                window.set_focus()?;
            }

            #[cfg(not(target_os = "macos"))]
            {
                let show = MenuItemBuilder::new(crate::i18n::tr("native.tray.show")).id("show").build(app)?;
                let exit = MenuItemBuilder::new(crate::i18n::tr("native.tray.exit")).id("exit").build(app)?;
                let menu = MenuBuilder::new(app).items(&[&show, &exit]).build()?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip(crate::i18n::tr("app.name"))
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                            "exit" => app.exit(0),
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(commands::discord::start_retry_loop(app_handle.clone()));
            tauri::async_runtime::spawn(commands::checkin::start_auto_checkin_loop(app_handle.clone()));
            tauri::async_runtime::spawn(commands::codes::start_auto_code_redemption_loop(app_handle));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
