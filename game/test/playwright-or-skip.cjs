// Общая проверка необязательной зависимости до создания файлов, серверов и сборки.
module.exports = function playwrightOrSkip(testFile) {
  try {
    require.resolve('playwright');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    console.log(`Пропуск ${require('node:path').basename(testFile)}: playwright не установлен; нужен для npm run test:browser.`);
    process.exit(0);
  }
  return require('playwright');
};
