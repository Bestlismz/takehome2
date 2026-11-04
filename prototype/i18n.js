import appEnglish from './locales/app-en.js';
import auxEnglish from './locales/aux-en.js';

const english = {...appEnglish,...auxEnglish};
let language = 'th';
try { if (globalThis.window?.localStorage?.getItem('luklaan-language') === 'en') language = 'en'; } catch {}

export const getLanguage = () => language;
export const intlLocale = () => language === 'en' ? 'en-GB' : 'th-TH';
export function setLanguage(value) {
  if (!['th','en'].includes(value)) throw new Error('Unsupported language');
  language = value;
  try { globalThis.window?.localStorage?.setItem('luklaan-language',value); } catch {}
  return language;
}
export function tr(source, englishFallback) {
  if (typeof source !== 'string' || language === 'th') return source;
  const trimmed = source.trim();
  const translated = englishFallback ?? english[trimmed];
  if (translated === undefined) return source;
  return source.replace(trimmed,translated);
}
export function translateStatic(source) {
  if (language === 'th') return source;
  return source.replace(/[\u0e00-\u0e7f][^<>"=]*?(?=[<>"]|$)/g, value => tr(value));
}
export function html(strings, ...values) {
  return strings.reduce((result,part,index) => result + translateStatic(part) + (index < values.length ? String(values[index]) : ''),'');
}
