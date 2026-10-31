export default {
  '*': 'eslint --quiet --fix --no-warn-ignored',
  '*.{ts,tsx,cts,mts,vue}': () => 'tsc -p tsconfig.json --noEmit',
};
