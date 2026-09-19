import {
  SCRIPT_TEMPLATES,
  SUPPORTED_LOCALES,
  SUPPORTED_MARKETS,
  type ContentLocale,
  type ScriptTemplate,
  type TargetMarket,
} from "@/lib/ugc/constants";

/**
 * Content locales and target markets are separate settings: the same language
 * is written differently for Mexico and for Spain, so the UI never collapses
 * one into the other.
 */
export function contentLocaleKey(locale: string): string {
  return `ugc_locale_${locale.replace("-", "_")}`;
}

export function marketKey(market: string): string {
  return `ugc_market_${market.toLowerCase()}`;
}

export function templateKey(template: string): string {
  return `ugc_template_${template}`;
}

export function templateDescriptionKey(template: string): string {
  return `ugc_template_${template}_description`;
}

export function videoModeKey(videoMode: string): string {
  return `ugc_video_mode_${videoMode}`;
}

export function videoModelKey(videoModel: string): string {
  return `ugc_video_model_${videoModel.replaceAll(".", "_").replaceAll("-", "_")}`;
}

export const LOCALE_OPTIONS: readonly ContentLocale[] = SUPPORTED_LOCALES;
export const MARKET_OPTIONS: readonly TargetMarket[] = SUPPORTED_MARKETS;
export const TEMPLATE_OPTIONS: readonly ScriptTemplate[] = SCRIPT_TEMPLATES;
