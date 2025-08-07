#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import inquirer from "inquirer";

interface ClaudeMessage {
  message: {
    role: "user" | "assistant";
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
  };
  timestamp: string;
  uuid: string;
  type: "user" | "assistant";
  cwd?: string;
  isSidechain?: boolean;
  userType?: string;
}

interface SearchResult {
  conversationId: string;
  conversationName: string;
  matchingLine: string;
  timestamp: string;
  messageRole: "user" | "assistant";
  filePath: string;
}

const CLAUDE_PROJECTS_PATH = "/Users/orta/.claude/projects";
const ADIUM_THEMES_PATH = "/Applications/Adium.app/Contents/Resources/Message Styles";
const USER_ADIUM_THEMES_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Adium 2.0/Message Styles"
);

function getAvailableProjects() {
  const projects = fs
    .readdirSync(CLAUDE_PROJECTS_PATH, { withFileTypes: true })
    .filter((dirent: any) => dirent.isDirectory())
    .map((dirent: any) => {
      const projectPath = path.join(CLAUDE_PROJECTS_PATH, dirent.name);

      // Find the most recently modified conversation file in this project
      let lastTouched = 0;
      try {
        const files = fs
          .readdirSync(projectPath)
          .filter((file: string) => file.endsWith(".jsonl"));

        for (const file of files) {
          const filePath = path.join(projectPath, file);
          const stats = fs.statSync(filePath);
          if (stats.mtime.getTime() > lastTouched) {
            lastTouched = stats.mtime.getTime();
          }
        }
      } catch (error) {
        lastTouched = 0;
      }

      return {
        displayName: dirent.name.replace(/^-/, "").replace(/-/g, "/"),
        originalName: dirent.name,
        path: projectPath,
        lastTouched,
      };
    })
    .sort((a, b) => b.lastTouched - a.lastTouched);

  return projects;
}

function getFirstAvailableTheme(): string {
  const themes: Array<{ name: string; path: string }> = [];

  // Check system themes
  try {
    const systemThemes = fs
      .readdirSync(ADIUM_THEMES_PATH, { withFileTypes: true })
      .filter(
        (dirent: any) =>
          dirent.isDirectory() && dirent.name.endsWith(".AdiumMessageStyle")
      )
      .map((dirent: any) => ({
        name: dirent.name.replace(".AdiumMessageStyle", ""),
        path: path.join(ADIUM_THEMES_PATH, dirent.name),
      }));
    themes.push(...systemThemes);
  } catch {
    // System themes not found
  }

  // Check user themes
  try {
    if (fs.existsSync(USER_ADIUM_THEMES_PATH)) {
      const userThemes = fs
        .readdirSync(USER_ADIUM_THEMES_PATH, { withFileTypes: true })
        .filter(
          (dirent: any) =>
            dirent.isDirectory() && dirent.name.endsWith(".AdiumMessageStyle")
        )
        .map((dirent: any) => ({
          name: dirent.name.replace(".AdiumMessageStyle", ""),
          path: path.join(USER_ADIUM_THEMES_PATH, dirent.name),
        }));
      themes.push(...userThemes);
    }
  } catch {
    // User themes not found
  }

  // Always return Renkoo as default
  return "Renkoo";
}

function formatTimeAgo(timestamp: number): string {
  if (timestamp === 0) return "";

  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

function extractMessageContent(
  content: string | Array<{ type: string; text?: string; thinking?: string }>
): string {
  if (typeof content === "string") {
    return content;
  } else if (Array.isArray(content)) {
    return content
      .filter((item: any) => item.type === "text" && item.text)
      .map((item: any) => item.text)
      .join("");
  }
  return "";
}

function getConversationName(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const firstLine = content.split("\n")[0];

    if (firstLine.trim()) {
      const firstMessage: ClaudeMessage = JSON.parse(firstLine);
      if (firstMessage.type === "user" && firstMessage.message.content) {
        const messageText = extractMessageContent(firstMessage.message.content);
        const name =
          messageText.slice(0, 60) + (messageText.length > 60 ? "..." : "");
        return name || path.basename(filePath, ".jsonl");
      }
    }
  } catch (_e) {
    // Fall back to filename if parsing fails
  }
  return path.basename(filePath, ".jsonl");
}

function searchConversations(
  projectPath: string,
  query: string
): SearchResult[] {
  const results: SearchResult[] = [];

  if (!query.trim()) {
    return results;
  }

  const conversationFiles = fs
    .readdirSync(projectPath)
    .filter((file: string) => file.endsWith(".jsonl"));

  const searchRegex = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi"
  );

  for (const file of conversationFiles) {
    const filePath = path.join(projectPath, file);
    const conversationName = getConversationName(filePath);

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      for (const line of lines) {
        try {
          const message: ClaudeMessage = JSON.parse(line);

          if (message.message && message.message.content) {
            const messageText = extractMessageContent(message.message.content);

            if (searchRegex.test(messageText)) {
              // Find the specific line that matches and create a preview
              const messageLines = messageText.split("\n");
              let matchingLine =
                messageText.slice(0, 100) +
                (messageText.length > 100 ? "..." : "");

              // Try to find the specific line with the match
              for (const msgLine of messageLines) {
                if (searchRegex.test(msgLine)) {
                  matchingLine =
                    msgLine.slice(0, 100) + (msgLine.length > 100 ? "..." : "");
                  break;
                }
              }

              results.push({
                conversationId: path.basename(file, ".jsonl"),
                conversationName,
                matchingLine,
                timestamp: message.timestamp,
                messageRole: message.message.role,
                filePath,
              });

              // Only show first match per conversation to avoid spam
              break;
            }
          }
        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }
    } catch (readError) {
      // Skip files that can't be read
      continue;
    }
  }

  // Sort by timestamp (most recent first)
  return results.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text;

  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  return text.replace(regex, "\x1b[33m$1\x1b[0m"); // Yellow highlight
}

async function startRealtimeSearch(projectPath: string, projectName: string) {
  console.clear();
  console.log(
    `\x1b[1m\x1b[36mSearching conversations in project: ${projectName}\x1b[0m`
  );
  console.log(`\x1b[90mType to search, use ↑/↓ to select, Enter to get command, Esc to clear/exit\x1b[0m\n`);

  let currentQuery = "";
  let searchResults: SearchResult[] = [];
  let selectedIndex = 0;

  const displayResults = () => {
    // Clear from current cursor position down
    process.stdout.write("\x1b[0J");

    if (currentQuery.trim()) {
      console.log(`\x1b[1mSearch: "${currentQuery}"\x1b[0m`);
      console.log(
        `\x1b[90mFound ${searchResults.length} result${
          searchResults.length !== 1 ? "s" : ""
        }\x1b[0m\n`
      );

      if (searchResults.length === 0) {
        console.log("\x1b[31mNo matches found\x1b[0m");
        selectedIndex = 0;
      } else {
        searchResults.slice(0, 10).forEach((result, index) => {
          const roleColor =
            result.messageRole === "user" ? "\x1b[34m" : "\x1b[32m";
          const timestamp = new Date(result.timestamp).toLocaleDateString();
          const isSelected = index === selectedIndex;
          const selectionPrefix = isSelected ? "\x1b[47m\x1b[30m" : ""; // White background, black text
          const selectionSuffix = isSelected ? "\x1b[0m" : "";

          console.log(
            `${selectionPrefix}\x1b[1m${index + 1}. ${
              result.conversationName
            }\x1b[0m${selectionPrefix} \x1b[90m(${timestamp})\x1b[0m${selectionSuffix}`
          );
          console.log(
            `${selectionPrefix}   ${roleColor}${result.messageRole}:\x1b[0m${selectionPrefix} ${highlightMatches(
              result.matchingLine,
              currentQuery
            )}${selectionSuffix}`
          );
          console.log("");
        });

        if (searchResults.length > 10) {
          console.log(
            `\x1b[90m... and ${searchResults.length - 10} more results\x1b[0m`
          );
        }
      }
    } else {
      console.log("\x1b[90mStart typing to search...\x1b[0m");
      selectedIndex = 0;
    }

    // Move cursor back to search input line
    const linesToMove = currentQuery.trim()
      ? searchResults.length === 0
        ? 4
        : Math.min(searchResults.length * 3 + 5, 35)
      : 2;
    process.stdout.write(`\x1b[${linesToMove}A`);
    process.stdout.write("\x1b[2K"); // Clear current line
    process.stdout.write(`Search: ${currentQuery}`);
  };

  const generateCommand = (result: SearchResult): string => {
    // Extract project name from path
    const projectFolderName = path.basename(path.dirname(result.filePath));
    
    // Always use Renkoo as default theme
    return `claude-to-adium "${projectFolderName}" "${result.conversationId}" "Renkoo"`;
  };

  const showCommandDialog = (result: SearchResult) => {
    const command = generateCommand(result);
    
    // Clear screen and show command
    console.clear();
    console.log(`\x1b[1m\x1b[36mGenerate HTML for: ${result.conversationName}\x1b[0m`);
    console.log("=".repeat(50) + "\n");
    
    console.log(`\x1b[1mCopy and paste this command:\x1b[0m`);
    console.log(`\x1b[32m${command}\x1b[0m\n`);
    
    console.log(`\x1b[90mPress any key to return to search...\x1b[0m`);
    
    // Wait for any key press to return
    const waitForKey = () => {
      process.stdin.once("data", () => {
        // Return to search
        console.clear();
        console.log(
          `\x1b[1m\x1b[36mSearching conversations in project: ${projectName}\x1b[0m`
        );
        console.log(`\x1b[90mType to search, use ↑/↓ to select, Enter to get command, Esc to clear/exit\x1b[0m\n`);
        displayResults();
      });
    };
    
    waitForKey();
  };

  // Set up raw mode for real-time input
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdout.write("Search: ");

  process.stdin.on("data", (key) => {
    const char = key.toString();

    if (char === "\u0003") {
      // Ctrl+C
      console.log("\n\nExiting search...");
      process.stdin.setRawMode(false);
      process.exit(0);
    } else if (char === "\u001b") {
      // Escape key
      if (currentQuery.trim()) {
        // Clear the search query if there's text
        currentQuery = "";
        searchResults = [];
        selectedIndex = 0;
        displayResults();
      } else {
        // Exit if query is already empty
        console.log("\n\nExiting search...");
        process.stdin.setRawMode(false);
        process.exit(0);
      }
    } else if (char === "\r" || char === "\n") {
      // Enter - show command for selected result
      if (searchResults.length > 0 && selectedIndex < searchResults.length) {
        showCommandDialog(searchResults[selectedIndex]);
      }
      return;
    } else if (char === "\u001b[A") {
      // Up arrow
      if (searchResults.length > 0) {
        selectedIndex = Math.max(0, selectedIndex - 1);
        displayResults();
      }
    } else if (char === "\u001b[B") {
      // Down arrow
      if (searchResults.length > 0) {
        selectedIndex = Math.min(Math.min(searchResults.length - 1, 9), selectedIndex + 1);
        displayResults();
      }
    } else if (char === "\u007f" || char === "\b") {
      // Backspace
      if (currentQuery.length > 0) {
        currentQuery = currentQuery.slice(0, -1);
        searchResults = searchConversations(projectPath, currentQuery);
        selectedIndex = 0; // Reset selection when query changes
        displayResults();
      }
    } else if (char >= " " && char <= "~") {
      // Printable ASCII characters
      currentQuery += char;
      searchResults = searchConversations(projectPath, currentQuery);
      selectedIndex = 0; // Reset selection when query changes
      displayResults();
    }
  });

  // Initial display
  displayResults();
}

export async function findConversations() {
  console.log(`\x1b[1m\x1b[36mClaude Conversation Search\x1b[0m`);
  console.log("=".repeat(30) + "\n");

  // Step 1: Choose project
  const projects = getAvailableProjects();

  if (projects.length === 0) {
    console.error("No Claude projects found in ~/.claude/projects");
    process.exit(1);
  }

  const { selectedProject } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedProject",
      message: "Choose a Claude project to search:",
      choices: projects.map((p: any) => {
        const timeAgo = formatTimeAgo(p.lastTouched);
        const displayName = timeAgo
          ? `${p.displayName} (${timeAgo})`
          : p.displayName;
        return {
          name: displayName,
          value: p,
        };
      }),
    },
  ]);

  // Step 2: Start realtime search
  await startRealtimeSearch(selectedProject.path, selectedProject.displayName);
}

// Allow this to be called directly
if (require.main === module) {
  findConversations().catch(console.error);
}
