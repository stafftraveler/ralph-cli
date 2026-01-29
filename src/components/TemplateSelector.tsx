import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { useCallback, useEffect, useState } from "react";
import { listTemplates, prdHasTasks } from "../lib/prd.js";
import type { PrdTemplate } from "../types.js";

/**
 * Props for the TemplateSelector component
 */
export interface TemplateSelectorProps {
  /** Path to .ralph directory */
  ralphDir: string;
  /** Called when template is selected and PRD is valid */
  onComplete: () => void;
  /** Called if user wants to cancel */
  onCancel?: () => void;
}

type Phase = "loading" | "select" | "copying" | "waiting-for-edit" | "validating" | "error";

interface SelectItem {
  label: string;
  value: string;
  template?: PrdTemplate;
}

/**
 * TemplateSelector component for choosing a PRD template.
 *
 * Flow:
 * 1. Select a template from the list
 * 2. Copy template to PRD.md
 * 3. Show PRD path and wait for user to edit and press Enter
 * 4. Validate PRD has tasks
 */
export function TemplateSelector({ ralphDir, onComplete, onCancel }: TemplateSelectorProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [templates, setTemplates] = useState<PrdTemplate[]>([]);
  const [_selectedTemplate, setSelectedTemplate] = useState<PrdTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prdPath = join(ralphDir, "PRD.md");
  const templatesDir = join(ralphDir, "prd");

  // Load templates on mount
  useEffect(() => {
    async function loadTemplates() {
      const loaded = await listTemplates(templatesDir);
      setTemplates(loaded);
      setPhase("select");
    }
    void loadTemplates();
  }, [templatesDir]);

  // Handle template selection
  const handleSelect = useCallback(
    async (item: SelectItem) => {
      if (!item.template) {
        // "Cancel" option selected
        onCancel?.();
        return;
      }

      setSelectedTemplate(item.template);
      setPhase("copying");

      try {
        // Copy template to PRD.md
        await copyFile(item.template.path, prdPath);
        // Show path and wait for user to edit manually
        setPhase("waiting-for-edit");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to copy template");
        setPhase("error");
      }
    },
    [prdPath, onCancel],
  );

  /** Validate PRD and proceed or show error */
  const validateAndProceed = useCallback(async () => {
    setPhase("validating");
    const hasTasks = await prdHasTasks(prdPath);
    if (hasTasks) {
      onComplete();
    } else {
      setError("PRD still has no tasks. Please add tasks and try again.");
      setPhase("error");
    }
  }, [prdPath, onComplete]);

  // Handle keyboard input for waiting-for-edit and error phases
  useInput(
    (input, key) => {
      if (phase === "waiting-for-edit") {
        if (key.return) {
          // User pressed Enter - validate the PRD
          void validateAndProceed();
        } else if (input === "q" || key.escape) {
          onCancel?.();
        }
      } else if (phase === "error") {
        if (input === "r" || key.return) {
          // Retry - go back to waiting for edit
          setError(null);
          setPhase("waiting-for-edit");
        } else if (input === "q" || key.escape) {
          onCancel?.();
        }
      }
    },
    { isActive: phase === "waiting-for-edit" || phase === "error" },
  );

  // Build select items
  const items: SelectItem[] = templates.map((t) => ({
    label: `${t.name}${t.description ? ` - ${t.description}` : ""}`,
    value: t.name,
    template: t,
  }));

  // Add cancel option
  items.push({
    label: "Cancel",
    value: "cancel",
  });

  // Render based on phase
  if (phase === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading templates...</Text>
      </Box>
    );
  }

  if (phase === "select") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text bold>Select a PRD template:</Text>
        </Box>
        {templates.length === 0 ? (
          <Box flexDirection="column">
            <Text color="yellow">No templates found in {templatesDir}</Text>
            <Text color="gray">Create template files in .ralph/prd/</Text>
          </Box>
        ) : (
          <SelectInput items={items} onSelect={handleSelect} />
        )}
      </Box>
    );
  }

  if (phase === "copying") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Copying template to PRD.md...</Text>
      </Box>
    );
  }

  if (phase === "waiting-for-edit") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text color="green">✓ Template copied to PRD.md</Text>
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Text>Edit the PRD file to add your tasks:</Text>
          <Text color="cyan" bold>
            {prdPath}
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text color="gray">Press [Enter] when done editing</Text>
          <Text color="gray">Press [q] or [Esc] to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "validating") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Validating PRD...</Text>
      </Box>
    );
  }

  if (phase === "error") {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
        <Box flexDirection="column">
          <Text color="gray">Press [r] or [Enter] to edit again</Text>
          <Text color="gray">Press [q] or [Esc] to cancel</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
