import fs from 'fs';
const PKG = JSON.parse(fs.readFileSync('../../package.json', { encoding: 'utf-8' }));
export function resolve(specifier, parent, defaultResolve) {
  if (specifier === PKG.name) {
    specifier = new URL('../index.mjs', import.meta.url).toString();
  }
  return defaultResolve(specifier, parent);
}
