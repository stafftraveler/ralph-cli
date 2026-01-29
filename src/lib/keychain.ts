import { execa } from "execa";

/**
 * Service name for storing the API key in the macOS Keychain
 */
const KEYCHAIN_SERVICE = "ralph-cli";

/**
 * Account name for the API key entry
 */
const KEYCHAIN_ACCOUNT = "anthropic-api-key";

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
    // Log error in debug mode but don't expose to user
    if (process.env.DEBUG) {
      console.error("[keychain] Failed to save API key:", error);
    }
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
