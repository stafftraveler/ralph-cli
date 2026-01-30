import { execa } from "execa";
import { debugLog } from "./utils.js";

/**
 * Service name for storing the API key in the macOS Keychain
 */
const KEYCHAIN_SERVICE = "ralph-cli";

/**
 * Account name for the Anthropic API key entry
 */
const KEYCHAIN_ACCOUNT = "anthropic-api-key";

/**
 * Account name for the Linear API key entry
 */
const LINEAR_KEYCHAIN_ACCOUNT = "linear-api-key";

/**
 * Saves the Anthropic API key to the macOS Keychain
 *
 * Uses the `security` command to store the key securely.
 * The -U flag updates if the entry already exists.
 *
 * @param apiKey - The API key to store
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function saveApiKeyToKeychain(apiKey: string): Promise<boolean> {
  try {
    // First, try to delete any existing entry (ignore errors if not found)
    await execa("security", [
      "delete-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
    ]).catch(() => {
      // Ignore "item not found" errors
    });

    // Add the new password
    await execa("security", [
      "add-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
      apiKey,
    ]);

    return true;
  } catch (error) {
    // Log error in debug mode with helpful context
    debugLog("[keychain] Failed to save API key:", error);
    debugLog(
      "[keychain] Tip: Check keychain access with: security find-generic-password -s ralph-cli",
    );
    debugLog("[keychain] Or manually set: export ANTHROPIC_API_KEY='your-key'");
    return false;
  }
}

/**
 * Retrieves the Anthropic API key from the macOS Keychain
 *
 * @returns Promise resolving to the API key if found, null otherwise
 */
export async function getApiKeyFromKeychain(): Promise<string | null> {
  try {
    const result = await execa("security", [
      "find-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
      "-w", // Output only the password
    ]);

    const apiKey = result.stdout.trim();
    if (apiKey?.startsWith("sk-ant-")) {
      return apiKey;
    }

    return null;
  } catch {
    // Item not found or other error
    return null;
  }
}

/**
 * Saves the Linear API key to the macOS Keychain
 *
 * Uses the `security` command to store the key securely.
 *
 * @param apiKey - The Linear API key to store
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function saveLinearTokenToKeychain(apiKey: string): Promise<boolean> {
  try {
    // First, try to delete any existing entry (ignore errors if not found)
    await execa("security", [
      "delete-generic-password",
      "-a",
      LINEAR_KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
    ]).catch(() => {
      // Ignore "item not found" errors
    });

    // Add the new password
    await execa("security", [
      "add-generic-password",
      "-a",
      LINEAR_KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
      apiKey,
    ]);

    return true;
  } catch (error) {
    debugLog("[keychain] Failed to save Linear API key:", error);
    return false;
  }
}

/**
 * Retrieves the Linear API key from the macOS Keychain
 *
 * @returns Promise resolving to the API key if found, null otherwise
 */
export async function getLinearTokenFromKeychain(): Promise<string | null> {
  try {
    const result = await execa("security", [
      "find-generic-password",
      "-a",
      LINEAR_KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
      "-w", // Output only the password
    ]);

    const apiKey = result.stdout.trim();
    // Linear API keys start with "lin_api_"
    if (apiKey?.startsWith("lin_api_")) {
      return apiKey;
    }

    return null;
  } catch {
    // Item not found or other error
    return null;
  }
}
