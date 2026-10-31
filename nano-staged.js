export default {
  '*.{js,jsx,cjs,mjs,ts,tsx,cts,mts,vue}': 'eslint --quiet --fix',
  '*.{ts,tsx,cts,mts,vue}': () => 'tsc -p tsconfig.json --noEmit',
};
