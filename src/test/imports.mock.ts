const importers = import.meta.glob([
  "../**/*.{ts,tsx}",
  "!../**/*.{test,spec}.{ts,tsx}",
  "!../test/**",
  "!../main.tsx",
  "!../vite-env.d.ts",
]);

export const projectModulePaths = Object.keys(importers).sort();

export async function importAllProjectModules() {
  return Promise.all(
    projectModulePaths.map(async (modulePath) => {
      const module = await importers[modulePath]();

      return {
        modulePath,
        module,
      };
    }),
  );
}

