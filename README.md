<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src-tauri/github-logo/aeon-manager-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="src-tauri/github-logo/aeon-manager-light.png">
    <img src="src-tauri/github-logo/aeon-manager-light.png" alt="Aeon Manager" width="360">
  </picture>
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-early%20release-8b5cf6">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.x-24c8db">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-powered-f97316">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

Aeon Manager is a desktop app for managing HoYoLAB daily check ins and redemption codes for supported HoYoverse games.

Built with Tauri, React, and Rust.

## Important Disclaimer
Aeon Manager is an unofficial community project and is not affiliated with HoYoverse, HoYoLAB, Cognosphere, or miHoYo. Use it at your own risk and follow the terms that apply to your accounts.

## Installation Note
Aeon Manager is not a signed app. The certificate to sign it costs a lot, and since it is a small open-source project made by one person, it is not possible to get it
These warnings are expected for unsigned community apps. If you are unsure, you are welcome to review the source code or build the app yourself using the instructions below.

Windows — Microsoft Defender SmartScreen shows a "Windows protected your PC" warning. Click More info → Run anyway to proceed.
macOS — Gatekeeper blocks the app entirely with a "application is damaged and can't be opened" message. Go to Terminal and type `sudo xattr -rd com.apple.quarantine "/Applications/Aeon Manager.app"`.

## Features
- First-run onboarding for choosing language, cookie mode, games, account regions, and app preferences.
- Choose games that you play and want to automate for routine tasks.
- Use Aeon Manager without cookies by opening official check in and redemption links from the app.
- Import HoYoLAB cookies automatically from a supported browser or manually from DevTools if you want automation.
- Automate your HoYoLAB check ins if cookies are imported.
- Track check in streaks locally, with account sync if signed in.
- View active redemption codes and open official redemption pages. `Automated insertion of redemption codes to the database is in the process`
- Automatically redeem supported codes for selected games and account regions.
- Create an Aeon Manager account for recovery codes and redemption history sync between your devices.
- Optional startup launch, background launch, minimize-to-tray, notifications, and Discord Rich Presence.

## Onboarding
On first launch, Aeon Manager walks through the basic setup: language selection, cookie import or links-only mode, enabled games, account regions, and app preferences. These choices are saved to the local app config and can be changed later from Settings or Games.

## Cookie-Free Use
Cookies are optional.

If you do not want to give Aeon Manager your HoYoLAB cookies, you can still use the app as a hub for routine links:
- Open each game's official HoYoLAB check in page.
- View active redemption codes.
- Copy codes or open official redemption pages directly.

Automation requires cookies, so if you don't want to import cookies, you can simply skip automation.

## Road Map
- Automatic insertion of newly found redemption codes into the code database.
- Create an expired code check.
- New images for games on home page.
- Store redemption history in DB for cross-device sync.
- Store streaks in DB for cross-device sync.
- Calendar page with events for the games users have enabled.
- Monthly check in calendar showing the current month's rewards for every supported game.
- News page with Aeon Manager app news.
- News page with game news for enabled games.
- Color palettes and custom background options in the app.
- More polish for public releases, including an app logo and branded README header.

## Supported Games
- Genshin Impact
- Honkai: Star Rail
- Zenless Zone Zero
- Honkai Impact 3rd
- Tears of Themis

## Privacy And Security
Aeon Manager needs HoYoLAB cookies only for automated check ins and automated code redemption. You can use official links and code lists without importing cookies.

- Aeon Manager account tokens are stored through the operating system credential store.
- HoYoLAB cookies are only stored locally in `secrets.json` inside the app config directory.
- Non-secret settings are stored in the app config directory.
- The app does not intentionally expose cookies or account tokens to the React UI.

Only import cookies if you understand what session cookies are and trust the app you are running.

See [Privacy Policy](PRIVACY.md) for more detail.

## License
Aeon Manager is licensed under the [MIT License](LICENSE).

## Backend
Aeon Manager uses a backend API for account recovery, redemption-code history, and synced streaks. The desktop app keeps local information for settings, cookies and streaks, but account-backed features require the API to be available.

## Updates
Aeon Manager includes Tauri updater support. On startup, the app can check for a newer signed release, and users can also check manually from Settings.

## Project Status
This project is in early release development. Core check in, account, streak, and redemption-code flows are implemented, but public release polish is still in progress.

## Running app locally
Install dependencies:
```bash
npm install
```

Run the frontend dev server:
```bash
npm run dev
```

Run the Tauri app in development:
```bash
npm run tauri dev
```

Build the frontend:
```bash
npm run build
```

Build the desktop app:
```bash
npm run tauri build
```

Run Rust tests for the Tauri app:
```bash
cd src-tauri
cargo test
```
