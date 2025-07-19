import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const nextConfig = require('eslint-config-next');

const eslintConfig = [
  {
    ...nextConfig,
    rules: {
      ...nextConfig.rules,
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default eslintConfig;
