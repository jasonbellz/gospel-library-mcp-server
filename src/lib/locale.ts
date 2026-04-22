/**
 * locale.ts — Gospel Library language code constants.
 *
 * For the hosted server we default to English. Clients may override per
 * request via the `lang` argument on tools that accept it.
 */

export const DEFAULT_LANG = "eng";

/** Supported Gospel Library language codes (subset). */
export const SUPPORTED_LANGS = new Set([
  "eng",
  "spa",
  "por",
  "fra",
  "deu",
  "ita",
  "jpn",
  "kor",
  "zhs",
  "zht",
  "rus",
]);
