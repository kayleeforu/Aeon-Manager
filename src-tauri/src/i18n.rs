use serde_json::Value;
use std::sync::OnceLock;

const EN_LOCALE: &str = include_str!("../../src/i18n/locales/en.json");
static EN_DICTIONARY: OnceLock<Value> = OnceLock::new();

fn dictionary() -> &'static Value {
    EN_DICTIONARY.get_or_init(|| serde_json::from_str(EN_LOCALE).unwrap_or(Value::Null))
}

fn lookup<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    key.split('.')
        .try_fold(value, |current, segment| current.get(segment))
        .and_then(Value::as_str)
}

pub fn tr(key: &str) -> String {
    tr_with(key, &[])
}

pub fn tr_with(key: &str, params: &[(&str, String)]) -> String {
    let mut text = lookup(dictionary(), key).unwrap_or(key).to_string();

    for (name, value) in params {
        text = text
            .replace(&format!("{{{{{}}}}}", name), value)
            .replace(&format!("{{{{ {} }}}}", name), value);
    }

    text
}
