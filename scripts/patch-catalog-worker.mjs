import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const visibilityImport = 'import { parseSponsorHidden, publicProviderCatalog } from "./sponsor-visibility.mjs";';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) {
    throw new Error(`Catalog Worker has changed; review integration point: ${before}`);
  }
  return source.replace(before, after);
}

// The companion Worker was deployed separately from the wall. Apply this small
// source integration to a fresh download, preserving its Access checks and assets.
export function integrateVisibility(source) {
  if (source.includes(visibilityImport)) return source;
  source = replaceOnce(source, '    sponsor.order = item.order;',
    '    sponsor.order = item.order;\n    sponsor.hidden = parseSponsorHidden(item.hidden);');
  source = replaceOnce(source, 'const body = JSON.stringify(catalog);',
    'const body = JSON.stringify(publicProviderCatalog(catalog));');
  return `${visibilityImport}\n${source}`;
}

export async function patchCatalogWorker(inputDirectory, outputDirectory) {
  const source = await readFile(resolve(inputDirectory, 'index.js'), 'utf8');
  const assetName = variable => {
    const match = source.match(new RegExp(`import ${variable} from "\\./([^"/]+)";`));
    if (!match) throw new Error(`Missing catalog ${variable} asset`);
    return match[1];
  };
  const script = assetName('script');
  const css = assetName('css');
  // Validate every integration point before writing any output.
  const updated = integrateVisibility(source);
  const assets = new Map(await Promise.all((await readdir(inputDirectory)).map(async name =>
    [name, await readFile(resolve(inputDirectory, name))])));
  const cssMarker = '/* Temporary model-provider visibility */';
  const originalCss = assets.get(css).toString().split(cssMarker)[0].trimEnd();
  assets.set('index.js', updated);
  assets.set(script, await readFile(new URL('catalog/app.js', root)));
  assets.set(css, `${originalCss}\n\n${cssMarker}\n${await readFile(new URL('catalog/visibility.css', root), 'utf8')}`);
  assets.set('sponsor-visibility.mjs', await readFile(new URL('catalog/visibility.mjs', root)));
  await mkdir(outputDirectory, {recursive: true});
  for (const [name, contents] of assets) {
    await writeFile(resolve(outputDirectory, name), contents);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , input, output] = process.argv;
  if (!input || !output || resolve(input) === resolve(output)) {
    throw new Error('Usage: node scripts/patch-catalog-worker.mjs <downloaded-module-directory> <output-directory>');
  }
  await patchCatalogWorker(resolve(input), resolve(output));
  console.log(`Prepared catalog Worker: ${resolve(output)}`);
}
