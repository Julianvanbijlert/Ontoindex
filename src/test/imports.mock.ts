const importers = import.meta.glob([
  "../**/*.{ts,tsx}",
  "!../**/*.{test,spec}.{ts,tsx}",
  "!../test/**",
  "!../main.tsx",
  "!../vite-env.d.ts",
]);

export const projectModulePaths = Object.keys(importers).sort();

export async function importAllProjectModules(modulePaths = projectModulePaths) {
  const importedModules: Array<{ modulePath: string; module: unknown }> = [];
  const batchSize = 8;

  for (let index = 0; index < modulePaths.length; index += batchSize) {
    const batchPaths = modulePaths.slice(index, index + batchSize);
    const batchResults = await Promise.all(
      batchPaths.map(async (modulePath) => {
        const module = await importers[modulePath]();

        return {
          modulePath,
          module,
        };
      }),
    );

    importedModules.push(...batchResults);
  }

  return importedModules;
}
