import { type IssueLabel, type IssueSearchResult, LinearClient, type Team } from "@linear/sdk";
import type { FetchIssuesResult, LinearIssue, LinearTeam } from "../types.js";
import { getLinearTokenFromKeychain, saveLinearTokenToKeychain } from "./keychain.js";

/**
 * Priority labels for Linear issues (0 = none, 1 = urgent, 4 = low)
 */
const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

/**
 * Check if a Linear API token is available (env var or keychain)
 */
export async function hasLinearToken(): Promise<boolean> {
  if (process.env.LINEAR_API_KEY) {
    return true;
  }
  const token = await getLinearTokenFromKeychain();
  return token !== null;
}

/**
 * Get the Linear API token from env var or keychain
 */
export async function getLinearToken(): Promise<string | null> {
  if (process.env.LINEAR_API_KEY) {
    return process.env.LINEAR_API_KEY;
  }
  return getLinearTokenFromKeychain();
}

/**
 * Save the Linear API token to env var and keychain
 */
export async function setLinearToken(token: string, persist = true): Promise<boolean> {
  process.env.LINEAR_API_KEY = token;
  if (persist) {
    return saveLinearTokenToKeychain(token);
  }
  return true;
}

/**
 * Create a Linear client instance using the stored token
 */
export async function createLinearClient(): Promise<LinearClient | null> {
  const token = await getLinearToken();
  if (!token) {
    return null;
  }
  return new LinearClient({ apiKey: token });
}

/**
 * Test the Linear connection and return the viewer's name
 */
export async function testLinearConnection(
  token: string,
): Promise<{ success: boolean; userName?: string; error?: string }> {
  try {
    const client = new LinearClient({ apiKey: token });
    const viewer = await client.viewer;
    return { success: true, userName: viewer.name };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Fetch all teams the user has access to
 */
export async function fetchTeams(): Promise<LinearTeam[]> {
  const client = await createLinearClient();
  if (!client) {
    return [];
  }

  try {
    const teamsResult = await client.teams();
    return teamsResult.nodes.map((team: Team) => ({
      id: team.id,
      name: team.name,
      key: team.key,
    }));
  } catch (error) {
    if (process.env.DEBUG) {
      console.error("[linear] Failed to fetch teams:", error);
    }
    return [];
  }
}

/**
 * Fetch issues for a team, optionally filtered by search query.
 * Optimized for speed - skips fetching labels (use fetchIssuesFull for PRD generation).
 */
export async function fetchIssues(
  teamId: string,
  options: { query?: string; limit?: number } = {},
): Promise<LinearIssue[]> {
  const client = await createLinearClient();
  if (!client) {
    return [];
  }

  const { query, limit = 20 } = options;

  try {
    if (query) {
      // Search issues with the query - use search result data directly for speed
      const searchResult = await client.searchIssues(query, {
        first: limit * 2, // Fetch more since we'll filter by team
      });

      // Map search results directly - IssueSearchResult has most fields we need
      const mappedIssues: LinearIssue[] = [];
      // Get team info once
      const team = await client.team(teamId);

      for (const hit of searchResult.nodes) {
        // Check team by identifier prefix (e.g., "ABC-123" starts with team key)
        if (!hit.identifier.startsWith(`${team.key}-`)) {
          continue;
        }

        mappedIssues.push({
          id: hit.id,
          identifier: hit.identifier,
          title: hit.title,
          description: hit.description ?? undefined,
          priority: hit.priority,
          priorityLabel: PRIORITY_LABELS[hit.priority] ?? "Unknown",
          stateName: "", // Skip state for speed - not needed for selection UI
          labels: [], // Skip labels for speed - only needed for PRD generation
          url: hit.url,
          teamKey: team.key,
        });

        if (mappedIssues.length >= limit) {
          break;
        }
      }

      return mappedIssues;
    }

    // No query - fetch issues for the team directly
    const team = await client.team(teamId);
    const issuesResult = await team.issues({
      first: limit,
      orderBy: { updatedAt: "Descending" } as never,
    });

    // Map issues - fetch state in parallel for all issues
    const mappedIssues: LinearIssue[] = await Promise.all(
      issuesResult.nodes.map(async (issue) => {
        const state = await issue.state;
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? undefined,
          priority: issue.priority,
          priorityLabel: PRIORITY_LABELS[issue.priority] ?? "Unknown",
          stateName: state?.name ?? "Unknown",
          labels: [], // Skip labels for speed
          url: issue.url,
          teamKey: team.key,
        };
      }),
    );

    return mappedIssues;
  } catch (error) {
    if (process.env.DEBUG) {
      console.error("[linear] Failed to fetch issues:", error);
    }
    return [];
  }
}

/**
 * Fetch recent open issues for a team (not in progress or completed).
 * Used as the default view when no search query is entered.
 * Filters to only show issues in "backlog" or "unstarted" workflow states.
 *
 * @param teamId - The team ID to fetch issues for
 * @param limit - Maximum number of issues to fetch
 * @param after - Cursor for pagination (fetch issues after this cursor)
 * @returns Object containing issues, hasMore flag, and endCursor for pagination
 */
export async function fetchRecentIssues(
  teamId: string,
  limit = 5,
  after?: string,
): Promise<FetchIssuesResult> {
  const client = await createLinearClient();
  if (!client) {
    return { issues: [], hasMore: false, endCursor: null };
  }

  try {
    const team = await client.team(teamId);

    // Get workflow states that are "backlog" or "unstarted" (not in progress or completed)
    const states = await team.states();
    const openStateIds = states.nodes
      .filter((s) => s.type === "backlog" || s.type === "unstarted")
      .map((s) => s.id);

    if (openStateIds.length === 0) {
      return { issues: [], hasMore: false, endCursor: null };
    }

    // Fetch issues in open states, ordered by updated date
    const issuesResult = await client.issues({
      first: limit,
      after,
      filter: {
        team: { id: { eq: teamId } },
        state: { id: { in: openStateIds } },
      },
      orderBy: "updatedAt" as never, // PaginationOrderBy enum
    });

    // Map issues directly - skip state name for speed (we already know they're open)
    const mappedIssues: LinearIssue[] = issuesResult.nodes.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      priority: issue.priority,
      priorityLabel: PRIORITY_LABELS[issue.priority] ?? "Unknown",
      stateName: "", // Skip state name for speed
      labels: [], // Skip labels for speed - only needed for PRD generation
      url: issue.url,
      teamKey: team.key,
    }));

    return {
      issues: mappedIssues,
      hasMore: issuesResult.pageInfo.hasNextPage,
      endCursor: issuesResult.pageInfo.endCursor ?? null,
    };
  } catch (error) {
    if (process.env.DEBUG) {
      console.error("[linear] Failed to fetch recent issues:", error);
    }
    return { issues: [], hasMore: false, endCursor: null };
  }
}

/**
 * Parse a Linear URL to extract the issue identifier
 * Supports formats like:
 * - https://linear.app/team/issue/ABC-123
 * - https://linear.app/team/issue/ABC-123/issue-title
 */
export function parseLinearUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("linear.app")) {
      return null;
    }

    // Path format: /workspace/issue/IDENTIFIER/optional-title
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const issueIndex = pathParts.indexOf("issue");
    if (issueIndex === -1 || issueIndex + 1 >= pathParts.length) {
      return null;
    }

    return pathParts[issueIndex + 1];
  } catch {
    return null;
  }
}

/**
 * Fetch a single issue by its identifier (e.g., "ABC-123").
 * Fast version - skips labels.
 */
export async function fetchIssueByIdentifier(identifier: string): Promise<LinearIssue | null> {
  const client = await createLinearClient();
  if (!client) {
    return null;
  }

  try {
    // Search for the exact identifier - use search result directly
    const searchResult = await client.searchIssues(identifier, { first: 10 });
    const hit = searchResult.nodes.find((i: IssueSearchResult) => i.identifier === identifier);

    if (!hit) {
      return null;
    }

    return {
      id: hit.id,
      identifier: hit.identifier,
      title: hit.title,
      description: hit.description ?? undefined,
      priority: hit.priority,
      priorityLabel: PRIORITY_LABELS[hit.priority] ?? "Unknown",
      stateName: "", // Skip state for speed - not needed for selection UI
      labels: [], // Skip labels for speed
      url: hit.url,
      teamKey: hit.identifier.split("-")[0] ?? "",
    };
  } catch (error) {
    if (process.env.DEBUG) {
      console.error("[linear] Failed to fetch issue by identifier:", error);
    }
    return null;
  }
}

/**
 * Fetch full issue details including labels for a list of issues.
 * Used when generating PRD to get complete issue data.
 */
export async function fetchIssuesFull(issues: LinearIssue[]): Promise<LinearIssue[]> {
  const client = await createLinearClient();
  if (!client) {
    return issues;
  }

  try {
    // Fetch full details in parallel
    const fullIssues = await Promise.all(
      issues.map(async (issue) => {
        const fullIssue = await client.issue(issue.id);
        const [state, labels, team] = await Promise.all([
          fullIssue.state,
          fullIssue.labels(),
          fullIssue.team,
        ]);

        return {
          ...issue,
          description: fullIssue.description ?? undefined,
          stateName: state?.name ?? issue.stateName,
          labels: labels.nodes.map((l: IssueLabel) => l.name),
          teamKey: team?.key ?? issue.teamKey,
        };
      }),
    );

    return fullIssues;
  } catch (error) {
    if (process.env.DEBUG) {
      console.error("[linear] Failed to fetch full issue details:", error);
    }
    return issues;
  }
}

/**
 * Generate a PRD.md content from selected Linear issues
 */
export function generatePrdFromIssues(issues: LinearIssue[]): string {
  const sections: string[] = [];

  sections.push("# Linear Issues\n");
  sections.push("Selected issues imported from Linear.\n");

  // Sort by priority (1 = urgent is highest, 0 = none is lowest)
  const sorted = [...issues].sort((a, b) => {
    // Handle "no priority" (0) - treat it as lowest
    const priorityA = a.priority === 0 ? 5 : a.priority;
    const priorityB = b.priority === 0 ? 5 : b.priority;
    return priorityA - priorityB;
  });

  for (const issue of sorted) {
    sections.push(`## ${issue.identifier}: ${issue.title}`);
    sections.push("");

    // Metadata line
    const metaParts: string[] = [];
    metaParts.push(`**Priority:** ${issue.priorityLabel}`);
    if (issue.labels.length > 0) {
      metaParts.push(`**Labels:** ${issue.labels.join(", ")}`);
    }
    metaParts.push(`**State:** ${issue.stateName}`);
    sections.push(metaParts.join(" | "));
    sections.push("");

    sections.push(`**URL:** ${issue.url}`);
    sections.push("");

    if (issue.description) {
      sections.push("### Description");
      sections.push("");
      sections.push(issue.description);
      sections.push("");
    }

    // Generate acceptance criteria as checkboxes
    sections.push("### Acceptance Criteria");
    sections.push("");

    // Try to extract existing checkboxes from description
    const existingCheckboxes = extractCheckboxes(issue.description ?? "");
    if (existingCheckboxes.length > 0) {
      for (const checkbox of existingCheckboxes) {
        sections.push(checkbox);
      }
    } else {
      // Generate a default checkbox based on the title
      sections.push(`- [ ] Implement: ${issue.title}`);
    }
    sections.push("");

    sections.push("---");
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Extract checkbox items from markdown content
 */
function extractCheckboxes(markdown: string): string[] {
  const checkboxPattern = /^[\s]*[-*]\s*\[[ x]\]\s+.+$/gim;
  const matches = markdown.match(checkboxPattern);
  if (!matches) {
    return [];
  }
  // Reset to unchecked state
  return matches.map((line) => line.replace(/\[x\]/gi, "[ ]").trim());
}
