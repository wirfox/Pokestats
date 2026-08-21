#!/usr/bin/env node
/*
 * test/mobile.test.mjs — Aucune page ne doit déborder horizontalement.
 * ====================================================================
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * Un seul élément trop large suffit à élargir la page entière : sur téléphone,
 * le navigateur agrandit alors le viewport et TOUT le contenu part vers la
 * droite, en-tête compris. C'est exactement ce qui est arrivé après l'ajout du
 * sélecteur de jeu — la barre de navigation réclamait 501 px sur un écran de
 * 390, et le test de débordement n'avait pas été rejoué.
 *
 * Ce test rejoue la vérification sur toutes les pages et à plusieurs largeurs,
 * et nomme l'élément fautif quand il en trouve un.
 *
 * USAGE
 *   npm run test:mobile
 *
 * Nécessite Playwright et un accès à PokéAPI (les pages chargent leurs
 * données au démarrage). Le test s'abstient proprement si l'un manque.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8299;
const PAGES = ['index.html', 'pokedex.html', 'types.html'];
const LARGEURS = [320, 360, 390, 430, 768];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png'
};

/*
 * Playwright peut venir des dépendances du projet ou d'une installation
 * globale. Importé dynamiquement, un module CommonJS arrive parfois enveloppé
 * dans `default` : on accepte les deux formes plutôt que de planter.
 */
async function chargerPlaywright() {
  const sources = ['playwright', process.env.PLAYWRIGHT_PATH]
    .concat(['/opt/node22/lib/node_modules/playwright/index.js'])
    .filter(Boolean);
  for (const source of sources) {
    try {
      const mod = await import(source);
      const api = mod.chromium ? mod : (mod.default || {});
      if (api.chromium) return api.chromium;
    } catch { /* source suivante */ }
  }
  return null;
}

const chromium = await chargerPlaywright();
if (!chromium) {
  console.log('⚠ Playwright absent — test ignoré. Installe-le avec : npm i -D playwright');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

await new Promise((r) => server.listen(PORT, r));

const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined
}).catch(() => null);

if (!navigateur) {
  console.log('⚠ Chromium introuvable — test ignoré.');
  server.close();
  process.exit(0);
}

let echecs = 0;
let controles = 0;

for (const largeur of LARGEURS) {
  /* isMobile: false garde le viewport à la largeur demandée. Avec l'émulation
   * mobile, le navigateur élargit lui-même le viewport quand le contenu
   * déborde — et le débordement devient indétectable. */
  const page = await navigateur.newPage({ viewport: { width: largeur, height: 844 } });

  for (const nom of PAGES) {
    try {
      await page.goto(`http://127.0.0.1:${PORT}/${nom}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#data-status.is-ready', { timeout: 60000 });
      await page.waitForTimeout(700);
    } catch {
      console.log(`  ⚠ ${nom} @ ${largeur}px : données indisponibles, page ignorée`);
      continue;
    }

    const resultat = await page.evaluate((vue) => {
      const de = document.documentElement;
      const debordement = de.scrollWidth - vue;
      const coupables = [];
      if (debordement > 0) {
        document.querySelectorAll('body *').forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width > vue + 1) {
            coupables.push(
              `${el.tagName}.${String(el.className || '').split(' ')[0]} (${Math.round(rect.width)}px)`
            );
          }
        });
      }
      return { debordement, coupables: [...new Set(coupables)].slice(0, 4) };
    }, largeur);

    controles += 1;
    if (resultat.debordement > 0) {
      echecs += 1;
      console.log(`  ✗ ${nom} @ ${largeur}px déborde de ${resultat.debordement}px`);
      resultat.coupables.forEach((c) => console.log(`      ↳ ${c}`));
    } else {
      console.log(`  ✓ ${nom} @ ${largeur}px`);
    }
  }
  await page.close();
}

await navigateur.close();
server.close();

console.log('\n' + '-'.repeat(60));
if (echecs) {
  console.log(`${controles - echecs} contrôle(s) réussi(s), ${echecs} débordement(s).`);
  process.exitCode = 1;
} else {
  console.log(`Aucun débordement horizontal (${controles} contrôles).`);
}
