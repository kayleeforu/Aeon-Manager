use crate::i18n;

#[tauri::command]
pub async fn fetch_checkin_rewards(game_id: String) -> Result<String, String> {
    let (home_endpoint, act_id, sign_game) = match game_id.as_str() {
        "gi" => ("https://sg-hk4e-api.hoyolab.com/event/sol/home", "e202102251931481", None),
        "hsr" => ("https://sg-public-api.hoyolab.com/event/luna/os/home", "e202303301540311", None),
        "zzz" => ("https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/home", "e202406031448091", Some("zzz")),
        "hi3" => ("https://sg-public-api.hoyolab.com/event/mani/home", "e202110291205111", None),
        "tot" => ("https://sg-public-api.hoyolab.com/event/luna/os/home", "e202202281857121", None),
        _ => {
            return Err(i18n::tr_with(
                "errors.common.unsupportedGameId",
                &[("gameId", game_id)],
            ))
        }
    };

    let url = format!("{}?lang=en-us&act_id={}", home_endpoint, act_id);

    let client = reqwest::Client::new();
    let mut req = client.get(&url).header("User-Agent", "Mozilla/5.0");

    if let Some(game) = sign_game {
        req = req.header("x-rpc-signgame", game);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}
