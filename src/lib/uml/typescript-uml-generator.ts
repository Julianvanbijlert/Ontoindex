import {
  createStandardsModel,
  type StandardsAssociation,
  type StandardsAttribute,
  type StandardsClass,
  type StandardsModel,
} from "@/lib/standards/model";

interface ParsedTypeScriptAttribute {
  name: string;
  type?: string;
}

interface ParsedTypeScriptClass {
  id: string;
  name: string;
  superClassIds: string[];
  attributes: ParsedTypeScriptAttribute[];
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return normalized || "model.ts";
}

function canUseNodeRuntime() {
  const runtime = globalThis as { process?: { versions?: { node?: string } } };
  return typeof runtime.process?.versions?.node === "string";
}

async function dynamicImport(specifier: string) {
  return import(/* @vite-ignore */ specifier);
}

function stripTypeScriptComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function findMatchingBraceIndex(source: string, openingBraceIndex: number) {
  let depth = 1;
  let index = openingBraceIndex + 1;

  while (index < source.length) {
    const value = source[index];

    if (value === "{") {
      depth += 1;
    } else if (value === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return -1;
}

function extractClassAttributes(classBody: string) {
  const propertyMatcher =
    /(?:^|\n)\s*(?:(?:public|private|protected|readonly|static)\s+)*([A-Za-z_$][\w$]*)\??\s*:\s*([^;=\n]+)\s*(?:[;=])/g;
  const attributes: ParsedTypeScriptAttribute[] = [];
  let match: RegExpExecArray | null = propertyMatcher.exec(classBody);

  while (match) {
    const [, rawName, rawType] = match;
    const name = rawName.trim();
    const type = rawType.trim();

    if (name) {
      attributes.push({
        name,
        type: type || undefined,
      });
    }

    match = propertyMatcher.exec(classBody);
  }

  return attributes;
}

function parseTypeScriptClassesFallback(source: string) {
  const sourceWithoutComments = stripTypeScriptComments(source);
  const classHeaderMatcher = /(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?\s*{/g;
  const parsedClasses: ParsedTypeScriptClass[] = [];
  let match: RegExpExecArray | null = classHeaderMatcher.exec(sourceWithoutComments);

  while (match) {
    const className = match[1];
    const superClassName = match[2];
    const openingBraceIndex = match.index + match[0].length - 1;
    const closingBraceIndex = findMatchingBraceIndex(sourceWithoutComments, openingBraceIndex);

    if (closingBraceIndex < 0) {
      break;
    }

    const body = sourceWithoutComments.slice(openingBraceIndex + 1, closingBraceIndex);
    parsedClasses.push({
      id: className,
      name: className,
      superClassIds: superClassName ? [superClassName] : [],
      attributes: extractClassAttributes(body),
    });

    classHeaderMatcher.lastIndex = closingBraceIndex + 1;
    match = classHeaderMatcher.exec(sourceWithoutComments);
  }

  return parsedClasses;
}

function normalizeTypeToken(value: string) {
  return value
    .replace(/[[\]{}()<>,|&?]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAssociationsFromAttributes(classes: ParsedTypeScriptClass[]) {
  const knownClassIds = new Set(classes.map((item) => item.id));
  const byId = new Map<string, StandardsAssociation>();

  for (const item of classes) {
    for (const attribute of item.attributes) {
      if (!attribute.type) {
        continue;
      }

      const targetId = normalizeTypeToken(attribute.type).find((token) => knownClassIds.has(token));

      if (!targetId) {
        continue;
      }

      const associationId = `${item.id}::attribute::${attribute.name}::${targetId}`;

      if (byId.has(associationId)) {
        continue;
      }

      byId.set(associationId, {
        id: associationId,
        label: attribute.name,
        source: {
          classId: item.id,
        },
        target: {
          classId: targetId,
        },
        trace: {
          sourceIds: [associationId],
          sourceFormat: "typescript-source",
        },
      });
    }
  }

  return [...byId.values()];
}

function toStandardsClassAttributes(classId: string, attributes: ParsedTypeScriptAttribute[]) {
  return attributes.map((attribute, index) => ({
    id: `${classId}-attribute-${index + 1}`,
    name: attribute.name,
    datatypeId: attribute.type,
  } satisfies StandardsAttribute));
}

function toStandardsClasses(classes: ParsedTypeScriptClass[], sourceFormat: string) {
  return classes.map((item) => ({
    id: item.id,
    label: item.name,
    superClassIds: [...new Set(item.superClassIds)].sort((left, right) => left.localeCompare(right)),
    attributes: toStandardsClassAttributes(item.id, item.attributes),
    trace: {
      sourceIds: [item.id],
      sourceFormat,
    },
  } satisfies StandardsClass));
}

function toStandardsModelFromParsedClasses(
  classes: ParsedTypeScriptClass[],
  sourceFormat: string,
): StandardsModel {
  return createStandardsModel({
    profiles: ["mim"],
    classes: toStandardsClasses(classes, sourceFormat),
    associations: buildAssociationsFromAttributes(classes),
    metadata: {
      sourceFormat,
    },
  });
}

function mapTsUml2DeclarationsToParsedClasses(declarations: unknown[]) {
  const rawClasses = declarations
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const value = (item as { classes?: unknown }).classes;
      return Array.isArray(value) ? value : [];
    })
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);

  return rawClasses.map((item) => {
    const id = typeof item.name === "string" && item.name.trim()
      ? item.name.trim()
      : typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : "";
    const attributes = Array.isArray(item.properties)
      ? item.properties
          .filter((property): property is Record<string, unknown> => typeof property === "object" && property !== null)
          .map((property) => ({
            name: typeof property.name === "string" ? property.name.trim() : "",
            type: typeof property.type === "string" && property.type.trim() ? property.type.trim() : undefined,
          }))
          .filter((property) => property.name)
      : [];
    const superClassIds = Array.isArray(item.heritageClauses)
      ? item.heritageClauses
          .filter((heritage): heritage is Record<string, unknown> => typeof heritage === "object" && heritage !== null)
          .filter((heritage) => heritage.type === 0)
          .map((heritage) => {
            if (typeof heritage.clause === "string" && heritage.clause.trim()) {
              return heritage.clause.trim();
            }

            if (typeof heritage.className === "string" && heritage.className.trim()) {
              return heritage.className.trim();
            }

            return "";
          })
          .filter(Boolean)
      : [];

    return {
      id,
      name: id,
      superClassIds,
      attributes,
    } satisfies ParsedTypeScriptClass;
  }).filter((item) => !!item.id);
}

async function tryGenerateWithTsUml2(input: { source: string; fileName: string }) {
  if (!canUseNodeRuntime()) {
    return null;
  }

  let tempDirectoryPath: string | null = null;

  try {
    const fs = await dynamicImport("node:fs/promises") as {
      mkdtemp: (prefix: string) => Promise<string>;
      mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
      writeFile: (path: string, data: string) => Promise<void>;
      rm: (path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>;
    };
    const os = await dynamicImport("node:os") as { tmpdir: () => string };
    const path = await dynamicImport("node:path") as {
      join: (...paths: string[]) => string;
      extname: (value: string) => string;
    };
    const tsuml2 = await dynamicImport("tsuml2") as {
      TsUML2Settings?: new () => {
        glob: string;
        tsconfig?: string;
        outFile: string;
      };
      parseProject?: (settings: unknown) => unknown[];
    };

    if (!tsuml2.TsUML2Settings || typeof tsuml2.parseProject !== "function") {
      return null;
    }

    tempDirectoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "tsuml2-import-"));
    const extension = path.extname(input.fileName).toLowerCase() === ".tsx" ? ".tsx" : ".ts";
    const sourceFileName = sanitizeFileName(input.fileName).replace(/\.[^.]+$/, extension);
    const sourcePath = path.join(tempDirectoryPath, sourceFileName);
    const tsconfigPath = path.join(tempDirectoryPath, "tsconfig.json");

    await fs.mkdir(path.join(tempDirectoryPath, "src"), { recursive: true });
    await fs.writeFile(sourcePath, input.source);
    await fs.writeFile(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          strict: false,
          skipLibCheck: true,
        },
        include: [sourceFileName],
      }),
    );

    const settings = new tsuml2.TsUML2Settings();
    settings.glob = sourcePath;
    settings.tsconfig = tsconfigPath;
    settings.outFile = path.join(tempDirectoryPath, "uml.svg");
    const declarations = tsuml2.parseProject(settings);
    const parsedClasses = mapTsUml2DeclarationsToParsedClasses(declarations);

    if (parsedClasses.length === 0) {
      return null;
    }

    return toStandardsModelFromParsedClasses(parsedClasses, "typescript-tsuml2");
  } catch {
    return null;
  } finally {
    if (tempDirectoryPath) {
      try {
        const fs = await dynamicImport("node:fs/promises") as {
          rm: (path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>;
        };
        await fs.rm(tempDirectoryPath, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

export async function generateStandardsModelFromTypeScriptSource(input: {
  source: string;
  fileName: string;
}) {
  const tsuml2Model = await tryGenerateWithTsUml2(input);

  if (tsuml2Model) {
    return {
      standardsModel: tsuml2Model,
      warnings: [],
    };
  }

  const parsedClasses = parseTypeScriptClassesFallback(input.source);

  if (parsedClasses.length === 0) {
    throw new Error("No class declarations were found for automatic UML generation.");
  }

  return {
    standardsModel: toStandardsModelFromParsedClasses(parsedClasses, "typescript-source"),
    warnings: canUseNodeRuntime()
      ? ["TsUML2 generation was unavailable, so a built-in TypeScript UML parser was used."]
      : ["TsUML2 requires a server/runtime file system; used built-in TypeScript UML parser in the browser flow."],
  };
}
