import { SupportedLanguage } from '../types';

export function resolveLocale(param: string | null): SupportedLanguage {
  const value = (param || 'zh-CN').toLowerCase();
  const mapping: Record<string, SupportedLanguage> = {
    'zh': 'zh-cn', 'zh-cn': 'zh-cn', 'zh_cn': 'zh-cn',
    'zh-tw': 'zh-tw', 'zh_tw': 'zh-tw',
    'es': 'es', 'fr': 'fr', 'de': 'de', 'ru': 'ru'
  };
  return mapping[value] || 'zh-cn';
}


