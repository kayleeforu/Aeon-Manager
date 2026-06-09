import en from "./locales/en.json";

export const DEFAULT_LANGUAGE = "en";

const dictionaries = {
  en,
};

function getValue(dictionary, key) {
  return key.split(".").reduce((value, part) => value?.[part], dictionary);
}

export function t(key, params = {}, language = DEFAULT_LANGUAGE) {
  const dictionary = dictionaries[language] ?? dictionaries[DEFAULT_LANGUAGE];
  const fallbackDictionary = dictionaries[DEFAULT_LANGUAGE];
  const value = getValue(dictionary, key) ?? getValue(fallbackDictionary, key);
  const template = typeof value === "string" ? value : key;

  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const replacement = params[name];
    return replacement === undefined || replacement === null ? "" : String(replacement);
  });
}

export function gameName(gameId, fallback = gameId, language = DEFAULT_LANGUAGE) {
  const key = `gameNames.${gameId}`;
  const value = t(key, {}, language);
  return value === key ? fallback : value;
}
