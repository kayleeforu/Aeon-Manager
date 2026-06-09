use keyring::Entry;

const SERVICE: &str = "AeonManager";
const ACCOUNT_TOKEN_KEY: &str = "account_token";

pub fn load_account_token() -> Result<Option<String>, String> {
    match entry(ACCOUNT_TOKEN_KEY)?.get_password() {
        Ok(token) => {
            let Some(normalized) = normalize_token(&token) else {
                return Ok(None);
            };

            if normalized != token {
                save_account_token(&normalized)?;
            }

            Ok(Some(normalized))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_account_token(token: &str) -> Result<(), String> {
    let Some(token) = normalize_token(token) else {
        return remove_account_token();
    };

    entry(ACCOUNT_TOKEN_KEY)?
        .set_password(&token)
        .map_err(|error| error.to_string())
}

pub fn remove_account_token() -> Result<(), String> {
    match entry(ACCOUNT_TOKEN_KEY)?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|error| error.to_string())
}

fn normalize_token(token: &str) -> Option<String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some((scheme, value)) = trimmed.split_once(char::is_whitespace) {
        if scheme.eq_ignore_ascii_case("Bearer") {
            let token = value.trim();
            if !token.is_empty() {
                return Some(token.to_string());
            }
            return None;
        }
    }

    Some(trimmed.to_string())
}
