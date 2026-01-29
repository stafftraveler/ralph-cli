import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { IterationContext, PluginContext, RalphPlugin } from "../types.js";

/**
 * Plugin hook names
 */
export type PluginHook =
  | "beforeRun"
  | "beforeIteration"
  | "afterIteration"
  | "done"
  | "onError";

/**
 * Plugin configuration in .ralph/config or separate plugin config
 */
export interface PluginConfig {
  /** List of plugin names or paths to enable */
  plugins?: string[];
  /** Plugin-specific options keyed by plugin name */
  options?: Record<string, Record<string, unknown>>;
}

/**
 * Load plugins from .ralph/plugins/ directory and config
 * @param ralphDir Path to .ralph directory
 * @returns Array of loaded plugins
 */
export async function loadPlugins(ralphDir: string): Promise<RalphPlugin[]> {
  const plugins: RalphPlugin[] = [];
  const pluginsDir = join(ralphDir, "plugins");

  // Load plugins from .ralph/plugins/ directory
  try {
    const dirStat = await stat(pluginsDir);
    if (dirStat.isDirectory()) {
      const entries = await readdir(pluginsDir);

      for (const entry of entries) {
        // Only load .js or .ts files (not directories)
        if (!entry.endsWith(".js") && !entry.endsWith(".ts")) {
          continue;
        }

        const pluginPath = join(pluginsDir, entry);
        const plugin = await loadPluginFromFile(pluginPath);
        if (plugin) {
          plugins.push(plugin);
        }
      }
    }
  } catch (error) {
    // Plugins directory doesn't exist - that's fine
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`Error loading plugins from ${pluginsDir}:`, error);
    }
  }

  // Load plugin config from .ralph/plugins.json if it exists
  const configPath = join(ralphDir, "plugins.json");
  try {
    const configContent = await readFile(configPath, "utf-8");
    const config: PluginConfig = JSON.parse(configContent);

    if (config.plugins) {
      for (const pluginRef of config.plugins) {
        // Skip if already loaded from plugins directory
        if (plugins.some((p) => p.name === pluginRef)) {
          continue;
        }

        // Try to load by path (absolute or relative to .ralph/)
        const pluginPath = pluginRef.startsWith("/")
          ? pluginRef
          : join(ralphDir, pluginRef);

        const plugin = await loadPluginFromFile(pluginPath);
        if (plugin) {
          plugins.push(plugin);
        }
      }
    }
  } catch (error) {
    // plugins.json doesn't exist - that's fine
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // Only warn about parse errors, not missing file
      if (error instanceof SyntaxError) {
        console.error(`Invalid plugins.json: ${error.message}`);
      }
    }
  }

  return plugins;
}

/**
 * Load a single plugin from a file path
 */
async function loadPluginFromFile(
  filePath: string,
): Promise<RalphPlugin | null> {
  try {
    // Convert to file URL for ESM import
    const fileUrl = pathToFileURL(filePath).href;
    const module = await import(fileUrl);

    // Plugin can be default export or named 'plugin' export
    const plugin: RalphPlugin = module.default ?? module.plugin;

    if (!plugin || typeof plugin !== "object") {
      console.warn(`Plugin at ${filePath} has no valid export`);
      return null;
    }

    // Validate plugin has required name property
    if (!plugin.name || typeof plugin.name !== "string") {
      // Use filename as name if not provided
      const name =
        filePath
          .split("/")
          .pop()
          ?.replace(/\.(js|ts)$/, "") ?? "unknown";
      plugin.name = name;
    }

    return plugin;
  } catch (error) {
    console.error(`Failed to load plugin from ${filePath}:`, error);
    return null;
  }
}

/**
 * Run a specific hook on all plugins
 * @param plugins Array of loaded plugins
 * @param hookName Name of the hook to run
 * @param context Context to pass to the hook
 * @param error Optional error for onError hook
 */
export async function runHook(
  plugins: RalphPlugin[],
  hookName: PluginHook,
  context: PluginContext | IterationContext,
  error?: Error,
): Promise<void> {
  for (const plugin of plugins) {
    const hook = plugin[hookName];
    if (typeof hook !== "function") {
      continue;
    }

    try {
      if (hookName === "onError" && error) {
        await (hook as (ctx: PluginContext, err: Error) => Promise<void>)(
          context as PluginContext,
          error,
        );
      } else if (
        hookName === "beforeIteration" ||
        hookName === "afterIteration"
      ) {
        await (hook as (ctx: IterationContext) => Promise<void>)(
          context as IterationContext,
        );
      } else {
        await (hook as (ctx: PluginContext) => Promise<void>)(
          context as PluginContext,
        );
      }
    } catch (hookError) {
      // Log but don't fail on plugin errors
      console.error(`Plugin "${plugin.name}" error in ${hookName}:`, hookError);
    }
  }
}

/**
 * Run beforeRun hook on all plugins
 */
export async function runBeforeRun(
  plugins: RalphPlugin[],
  context: PluginContext,
): Promise<void> {
  await runHook(plugins, "beforeRun", context);
}

/**
 * Run beforeIteration hook on all plugins
 */
export async function runBeforeIteration(
  plugins: RalphPlugin[],
  context: IterationContext,
): Promise<void> {
  await runHook(plugins, "beforeIteration", context);
}

/**
 * Run afterIteration hook on all plugins
 */
export async function runAfterIteration(
  plugins: RalphPlugin[],
  context: IterationContext,
): Promise<void> {
  await runHook(plugins, "afterIteration", context);
}

/**
 * Run done hook on all plugins
 */
export async function runDone(
  plugins: RalphPlugin[],
  context: PluginContext,
): Promise<void> {
  await runHook(plugins, "done", context);
}

/**
 * Run onError hook on all plugins
 */
export async function runOnError(
  plugins: RalphPlugin[],
  context: PluginContext,
  error: Error,
): Promise<void> {
  await runHook(plugins, "onError", context, error);
}
