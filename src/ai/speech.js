// Diktování (Web Speech API, čeština).
export function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Spustí rozpoznávání řeči; vrací funkci pro zastavení.
 * onText(text, isFinal) – průběžný přepis; onEnd(finalText)
 */
export function listen({ onText, onEnd, onError, lang = 'cs-CZ' }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError?.('Diktování není v tomto prohlížeči podporováno (použijte Chrome nebo Edge).');
    return () => {};
  }
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  let finalText = '';
  let silence = null;
  const armSilence = () => {
    clearTimeout(silence);
    silence = setTimeout(() => rec.stop(), 2600);
  };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onText?.((finalText + interim).trim(), !interim);
    armSilence();
  };
  rec.onerror = (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') onError?.(e.error === 'not-allowed' ? 'Přístup k mikrofonu byl zamítnut.' : `Chyba rozpoznávání: ${e.error}`);
  };
  rec.onend = () => {
    clearTimeout(silence);
    onEnd?.(finalText.trim());
  };
  try {
    rec.start();
    armSilence();
  } catch (e) {
    onError?.(String(e));
  }
  return () => {
    try {
      rec.stop();
    } catch {
      /* už zastaveno */
    }
  };
}
