// Po buildu zkopíruje soběstačný soubor do kořene projektu pod přívětivým názvem.
import { copyFileSync, statSync } from 'node:fs';

const src = new URL('../dist/index.html', import.meta.url);
const dst = new URL('../Prihoda-AI-Air-Studio.html', import.meta.url);
copyFileSync(src, dst);
console.log(`✓ Prihoda-AI-Air-Studio.html (${(statSync(dst).size / 1024 / 1024).toFixed(2)} MB) – otevřete dvojklikem`);
