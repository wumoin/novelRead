const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * 把 esbuild 的错误打印成 VS Code 的问题匹配器（tasks.json 中的 $esbuild-watch）
 * 能识别的格式，同时输出 watch 的起止标记。
 * @type {import('esbuild').Plugin}
 */
const problemMatcherPlugin = {
  name: 'problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      // 输出成 `✘ [ERROR] 文件:行:列: 说明`，与 tasks.json 里内联的 problemMatcher
      // 一一对应，这样 VS Code 能把报错直接挂到源码行上。
      for (const error of result.errors) {
        const file = error.location?.file ?? 'src/extension.ts';
        const line = error.location?.line ?? 1;
        const column = error.location?.column ?? 1;
        console.error(`✘ [ERROR] ${file}:${line}:${column}: ${error.text}`);
      }
      for (const warning of result.warnings) {
        const where = warning.location
          ? `${warning.location.file}:${warning.location.line}:${warning.location.column}: `
          : '';
        console.warn(`▲ [WARNING] ${where}${warning.text}`);
      }
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/extension.js',
    // vscode 模块由扩展宿主在运行时提供，不能打进产物
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [problemMatcherPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
