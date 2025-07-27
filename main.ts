#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import inquirer from "inquirer";
import { marked } from "marked";

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

interface AdiumTheme {
  name: string;
  path: string;
  incomingTemplate: string;
  outgoingTemplate: string;
  incomingNextTemplate?: string;
  outgoingNextTemplate?: string;
  headerTemplate?: string;
  statusTemplate?: string;
  mainCSS?: string;
  variantCSS?: string;
}

const CLAUDE_PROJECTS_PATH = "/Users/orta/.claude/projects";
const ADIUM_THEMES_PATH =
  "/Applications/Adium.app/Contents/Resources/Message Styles";
const USER_ADIUM_THEMES_PATH = path.join(
  os.homedir(),
  "Library/Application Support/Adium 2.0/Message Styles"
);

function copyDirectory(source: string, target: string) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const items = fs.readdirSync(source, { withFileTypes: true });

  for (const item of items) {
    const sourcePath = path.join(source, item.name);
    const targetPath = path.join(target, item.name);

    if (item.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check for --all flag
  if (args.includes("--all")) {
    const allIndex = args.indexOf("--all");
    args.splice(allIndex, 1); // Remove --all from args

    if (args.length === 2) {
      // --all mode: process all conversations in a project
      const [projectName, themeName] = args;
      await processAllConversations(projectName, themeName);
    } else if (args.length === 0) {
      // Interactive mode with --all flag
      await interactiveModeAll();
    } else {
      console.error("Usage with --all: claude-to-adium --all");
      console.error('Or: claude-to-adium "project-name" "theme-name" --all');
      process.exit(1);
    }
  } else if (args.length === 3) {
    // Non-interactive mode with provided arguments
    const [projectName, conversationFile, themeName] = args;
    const projectPath = path.join(CLAUDE_PROJECTS_PATH, projectName);
    const conversationPath = path.join(
      projectPath,
      conversationFile + ".jsonl"
    );
    const isDevMode = process.argv0.includes("node");
    await generateHTML(
      projectName,
      conversationPath,
      themeName,
      undefined,
      isDevMode
    );
  } else {
    // Interactive mode
    await interactiveMode();
  }
}

async function interactiveMode() {
  // Read version from package.json
  let version = "unknown";

  // Try multiple locations for package.json
  const possiblePaths = [
    path.resolve(__dirname, "package.json"), // Same dir as compiled code
    path.resolve(__dirname, "..", "package.json"), // Parent dir (dev)
    path.resolve(process.cwd(), "package.json"), // Current working dir
    path.resolve(__dirname, "..", "..", "package.json"), // npm package root
  ];

  for (const packagePath of possiblePaths) {
    try {
      const packageContent = fs.readFileSync(packagePath, "utf8");
      const packageData = JSON.parse(packageContent);
      if (packageData.name === "claude-code-to-adium") {
        version = packageData.version;
        break;
      }
    } catch {
      // Continue to next path
    }
  }

  console.log(`Claude Code to Adium HTML Converter v${version}`);
  console.log("=".repeat(40 + version.length) + "\n");

  // Step 1: Choose project
  const projects = getAvailableProjects();
  const { selectedProject } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedProject",
      message: "Choose a Claude project:",
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

  // Step 2: Choose conversation
  const conversations = getConversationsForProject(selectedProject.path);
  const conversationChoices = [
    { name: "🔄 All conversations", value: "ALL" },
    ...conversations.map((c: any) => {
      const timeAgo = formatTimeAgo(c.lastTouched);
      const displayName = timeAgo ? `${c.name} (${timeAgo})` : c.name;
      return { name: displayName, value: c.file };
    }),
  ];

  const { selectedConversation } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedConversation",
      message: "Choose a conversation:",
      choices: conversationChoices,
    },
  ]);

  // Step 3: Choose theme
  const themes = getAvailableThemes();
  const { selectedTheme } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedTheme",
      message: "Choose an Adium theme:",
      choices: themes.map((t: any) => ({ name: t.name, value: t.name })),
    },
  ]);

  // Handle "All conversations" selection
  if (selectedConversation === "ALL") {
    // Generate command for future use
    const projectName = selectedProject.originalName;
    console.log(
      `\nFor future use, run: claude-to-adium "${projectName}" "${selectedTheme}" --all\n`
    );

    // Process all conversations
    await processAllConversations(projectName, selectedTheme);
  } else {
    // Generate command for future use
    const projectName = selectedProject.originalName;
    const conversationName = path.basename(selectedConversation, ".jsonl");
    console.log(
      `\nFor future use, run: claude-to-adium "${projectName}" "${conversationName}" "${selectedTheme}"\n`
    );

    // Generate HTML for single conversation
    const isDevMode = process.argv0.includes("node");
    await generateHTML(
      projectName,
      selectedConversation,
      selectedTheme,
      undefined,
      isDevMode
    );
  }
}

async function interactiveModeAll() {
  // Read version from package.json
  let version = "unknown";

  // Try multiple locations for package.json
  const possiblePaths = [
    path.resolve(__dirname, "package.json"), // Same dir as compiled code
    path.resolve(__dirname, "..", "package.json"), // Parent dir (dev)
    path.resolve(process.cwd(), "package.json"), // Current working dir
    path.resolve(__dirname, "..", "..", "package.json"), // npm package root
  ];

  for (const packagePath of possiblePaths) {
    try {
      const packageContent = fs.readFileSync(packagePath, "utf8");
      const packageData = JSON.parse(packageContent);
      if (packageData.name === "claude-code-to-adium") {
        version = packageData.version;
        break;
      }
    } catch {
      // Continue to next path
    }
  }

  console.log(
    `Claude Code to Adium HTML Converter v${version} - ALL CONVERSATIONS MODE`
  );
  console.log("=".repeat(60 + version.length) + "\n");

  // Step 1: Choose project
  const projects = getAvailableProjects();
  const { selectedProject } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedProject",
      message: "Choose a Claude project (ALL conversations will be processed):",
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

  // Step 2: Choose theme
  const themes = getAvailableThemes();
  const { selectedTheme } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedTheme",
      message: "Choose an Adium theme:",
      choices: themes.map((t: any) => ({ name: t.name, value: t.name })),
    },
  ]);

  // Generate command for future use
  const projectName = selectedProject.originalName;
  console.log(
    `\nFor future use, run: claude-to-adium "${projectName}" "${selectedTheme}" --all\n`
  );

  // Process all conversations
  await processAllConversations(projectName, selectedTheme);
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
        // If we can't read the directory, use 0 as fallback
        lastTouched = 0;
      }

      return {
        displayName: dirent.name.replace(/^-/, "").replace(/-/g, "/"),
        originalName: dirent.name,
        path: projectPath,
        lastTouched,
      };
    })
    .sort((a, b) => b.lastTouched - a.lastTouched); // Sort by most recently touched first

  return projects;
}

function getConversationsForProject(projectPath: string) {
  const files = fs
    .readdirSync(projectPath)
    .filter((file: string) => file.endsWith(".jsonl"))
    .map((file: string) => {
      const filePath = path.join(projectPath, file);
      const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0];

      let name = file;
      let lastTouched = 0;

      // Get file modification time
      try {
        const stats = fs.statSync(filePath);
        lastTouched = stats.mtime.getTime();
      } catch (_e) {
        // Use 0 as fallback
      }

      try {
        const firstMessage: ClaudeMessage = JSON.parse(firstLine);
        if (firstMessage.type === "user" && firstMessage.message.content) {
          const content =
            typeof firstMessage.message.content === "string"
              ? firstMessage.message.content
              : firstMessage.message.content.find((c) => c.text)?.text || "";
          name = content.slice(0, 60) + (content.length > 60 ? "..." : "");
        }
      } catch (_e) {
        // Use filename if parsing fails
      }

      return { name, file: filePath, lastTouched };
    })
    .sort((a, b) => b.lastTouched - a.lastTouched); // Sort by most recently touched first

  return files;
}

async function processAllConversations(projectName: string, themeName: string) {
  console.log(
    `Processing all conversations in project "${projectName}" with theme "${themeName}"...`
  );

  const projectPath = path.join(CLAUDE_PROJECTS_PATH, projectName);

  // Check if project exists
  if (!fs.existsSync(projectPath)) {
    console.error(
      `Project "${projectName}" not found in ${CLAUDE_PROJECTS_PATH}`
    );
    process.exit(1);
  }

  // Get all conversations
  const conversations = getConversationsForProject(projectPath);

  if (conversations.length === 0) {
    console.error(`No conversations found in project "${projectName}"`);
    process.exit(1);
  }

  // Create main output directory
  const mainOutputDir = "claude-conversations";
  if (!fs.existsSync(mainOutputDir)) {
    fs.mkdirSync(mainOutputDir, { recursive: true });
  }

  console.log(`Found ${conversations.length} conversations to process...`);

  // Process each conversation
  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i];
    console.log(
      `\n[${i + 1}/${conversations.length}] Processing: ${conversation.name}`
    );

    try {
      const isDevMode = process.argv0.includes("node");
      await generateHTML(
        projectName,
        conversation.file,
        themeName,
        mainOutputDir,
        isDevMode
      );
    } catch (error) {
      console.error(`Error processing conversation: ${error}`);
      // Continue with next conversation
    }
  }

  console.log(
    `\nAll conversations processed! Output saved in: ${mainOutputDir}/`
  );
}

function getAvailableThemes() {
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

  if (themes.length === 0) {
    console.error("Could not find any Adium themes. Is Adium installed?");
    process.exit(1);
  }

  // Remove duplicates (prefer user themes over system themes)
  const uniqueThemes = themes.reduce((acc, theme) => {
    if (!acc.find((t) => t.name === theme.name)) {
      acc.push(theme);
    }
    return acc;
  }, [] as Array<{ name: string; path: string }>);

  return uniqueThemes;
}

function loadAdiumTheme(themeName: string): AdiumTheme {
  // Try to find theme in user directory first, then system directory
  let themePath = path.join(
    USER_ADIUM_THEMES_PATH,
    `${themeName}.AdiumMessageStyle`
  );
  if (!fs.existsSync(themePath)) {
    themePath = path.join(ADIUM_THEMES_PATH, `${themeName}.AdiumMessageStyle`);
  }
  const resourcesPath = path.join(themePath, "Contents", "Resources");

  // Load templates
  const incomingPath = path.join(resourcesPath, "Incoming", "Content.html");
  const outgoingPath = path.join(resourcesPath, "Outgoing", "Content.html");
  const incomingNextPath = path.join(
    resourcesPath,
    "Incoming",
    "NextContent.html"
  );
  const outgoingNextPath = path.join(
    resourcesPath,
    "Outgoing",
    "NextContent.html"
  );
  const fallbackPath = path.join(resourcesPath, "Content.html");

  let incomingTemplate = "";
  let outgoingTemplate = "";
  let incomingNextTemplate = "";
  let outgoingNextTemplate = "";

  if (fs.existsSync(incomingPath)) {
    incomingTemplate = fs.readFileSync(incomingPath, "utf8");
  } else if (fs.existsSync(fallbackPath)) {
    incomingTemplate = fs.readFileSync(fallbackPath, "utf8");
  }

  if (fs.existsSync(outgoingPath)) {
    outgoingTemplate = fs.readFileSync(outgoingPath, "utf8");
  } else {
    outgoingTemplate = incomingTemplate;
  }

  // Load NextContent templates (fallback to regular templates if not available)
  if (fs.existsSync(incomingNextPath)) {
    incomingNextTemplate = fs.readFileSync(incomingNextPath, "utf8");
  } else {
    incomingNextTemplate = incomingTemplate;
  }

  if (fs.existsSync(outgoingNextPath)) {
    outgoingNextTemplate = fs.readFileSync(outgoingNextPath, "utf8");
  } else {
    outgoingNextTemplate = outgoingTemplate;
  }

  // Load header template
  const headerPath = path.join(resourcesPath, "Header.html");
  let headerTemplate = "";
  if (fs.existsSync(headerPath)) {
    headerTemplate = fs.readFileSync(headerPath, "utf8");
  }

  // Load status template
  const statusPath = path.join(resourcesPath, "Status.html");
  let statusTemplate = "";
  if (fs.existsSync(statusPath)) {
    statusTemplate = fs.readFileSync(statusPath, "utf8");
  }

  // Load main CSS
  const mainCSSPath = path.join(resourcesPath, "Styles", "main.css");
  let mainCSS = "";
  if (fs.existsSync(mainCSSPath)) {
    mainCSS = fs.readFileSync(mainCSSPath, "utf8");
  }

  // Load variant CSS (try some common ones)
  const variantPaths = [
    "Variants/Blue on Green.css",
    "Variants/Red on Blue.css",
    "Variants/Green on Blue.css",
    "Variants/Steel on Blue.css",
  ];

  let variantCSS = "";
  for (const variantPath of variantPaths) {
    const fullVariantPath = path.join(resourcesPath, variantPath);
    if (fs.existsSync(fullVariantPath)) {
      variantCSS = variantPath;
      break;
    }
  }

  return {
    name: themeName,
    path: themePath,
    incomingTemplate,
    outgoingTemplate,
    incomingNextTemplate,
    outgoingNextTemplate,
    headerTemplate,
    statusTemplate,
    mainCSS,
    variantCSS,
  };
}

function parseConversation(filePath: string): {
  messages: ClaudeMessage[];
  chatName: string;
} {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());

  const messages = lines.map(
    (line: string) => JSON.parse(line) as ClaudeMessage
  );

  // Extract a meaningful chat name from the conversation
  let chatName = "Claude Conversation";

  if (messages.length > 0) {
    const firstMessage = messages[0];

    // Try to use the working directory name as chat context
    if (firstMessage.cwd) {
      const dirName = path.basename(firstMessage.cwd);
      if (dirName && dirName !== "." && dirName.length > 0) {
        chatName = `Claude - ${dirName}`;
      }
    }

    // Fallback to first user message preview if no good directory name
    if (
      chatName === "Claude Conversation" &&
      firstMessage.type === "user" &&
      firstMessage.message.content
    ) {
      const content =
        typeof firstMessage.message.content === "string"
          ? firstMessage.message.content
          : firstMessage.message.content.find((c: any) => c.text)?.text || "";

      // Create a short title from the first message
      const shortTitle = content
        .replace(/[\n\r]/g, " ")
        .slice(0, 40)
        .trim();

      if (shortTitle.length > 0) {
        chatName = `Claude - ${shortTitle}${content.length > 40 ? "..." : ""}`;
      }
    }
  }

  return { messages, chatName };
}

function isCancellationMessage(message: ClaudeMessage): boolean {
  if (!message.message.content) return false;

  let content = "";
  if (typeof message.message.content === "string") {
    content = message.message.content;
  } else if (Array.isArray(message.message.content)) {
    content = message.message.content
      .filter((item: any) => item.type === "text" && item.text)
      .map((item: any) => item.text)
      .join("");
  }

  return (
    content.includes("Request cancelled") ||
    content.includes("Request canceled") ||
    content.includes("Request interrupted") ||
    content.includes("request was cancelled") ||
    content.includes("request was canceled")
  );
}

function isSystemMessage(message: ClaudeMessage): string | null {
  if (!message.message.content) return null;

  // Check if userType indicates a system message
  if (message.userType && message.userType !== "external") {
    return `System message (${message.userType})`;
  }

  let content = "";
  if (typeof message.message.content === "string") {
    content = message.message.content;
  } else if (Array.isArray(message.message.content)) {
    content = message.message.content
      .filter((item: any) => item.type === "text" && item.text)
      .map((item: any) => item.text)
      .join("");
  }

  // Check for system continuation messages
  if (
    content.includes(
      "This session is being continued from a previous conversation"
    )
  ) {
    return "Session continued from previous conversation";
  }

  // Check for context limit messages
  if (
    content.includes("ran out of context") ||
    content.includes("context limit")
  ) {
    return "Context limit reached";
  }

  // Check for system reminders
  if (content.includes("<system-reminder>")) {
    return "System reminder";
  }

  return null;
}

function cleanMessageContent(content: string): string {
  if (!content) return content;

  return (
    content
      // Remove [Request interrupted by user] artifacts
      .replace(/\[Request interrupted by user\]/gi, "")
      // Remove system messages about user-generated content
      .replace(/^t:\s*The messages below were generated by the user.*$/gim, "")
      .replace(/The messages below were generated by the user.*$/gim, "")
      // Remove standalone quotation marks at the beginning/end of lines
      .replace(/^["'`]$/gm, "")
      // Remove standalone quotation marks with just whitespace
      .replace(/^\s*["'`]\s*$/gm, "")
      // Remove multiple consecutive newlines that might be left after cleaning
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      // Fix escaped <br> tags
      .replace(/\\<br>/g, "<br>")
      .trim()
  );
}

function renderStatusMessage(
  statusText: string,
  theme: AdiumTheme,
  timestamp: string,
  showTimestamp: boolean = true
): string {
  // Use status template if available, otherwise create a simple status message
  const template =
    theme.statusTemplate || '<div class="status">%message%</div>';

  const date = new Date(timestamp);
  const timeString = showTimestamp
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateString = showTimestamp ? date.toLocaleDateString() : "";

  return template
    .replace(/%message%/g, statusText)
    .replace(/%time%/g, timeString)
    .replace(/%time\{[^}]*\}%/g, dateString)
    .replace(/%status%/g, statusText)
    .replace(/%messageClasses%/g, "status");
}

function renderMessage(
  message: ClaudeMessage,
  theme: AdiumTheme,
  isIncoming: boolean,
  showTimestamp: boolean = true,
  consecutiveMessages: ClaudeMessage[] = []
): string {
  const template = isIncoming ? theme.incomingTemplate : theme.outgoingTemplate;

  // Extract text content
  let messageContent = "";

  if (typeof message.message.content === "string") {
    messageContent = message.message.content;
  } else if (Array.isArray(message.message.content)) {
    messageContent = message.message.content
      .filter((item: any) => item.type === "text" && item.text)
      .map((item: any) => item.text)
      .join("");
  }

  // Clean up message content - remove artifacts
  messageContent = cleanMessageContent(messageContent);

  // Process markdown for Claude messages (assistant role)
  if (message.message.role === "assistant" && messageContent.trim()) {
    try {
      // Configure marked for better chat formatting
      marked.setOptions({
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub flavored markdown
      });
      messageContent = marked.parse(messageContent) as string;
      // Remove empty paragraphs and clean up wrapping
      messageContent = messageContent
        .replace(/<p>\s*<\/p>/g, "") // Remove empty paragraphs
        .replace(/(^|[^>])<\/p>/g, "$1") // Remove orphaned </p> tags anywhere in text
        .replace(/^<p>|<\/p>$/g, "") // Remove wrapping <p> tags for single paragraphs
        .trim();
    } catch (error) {
      // Fallback to plain text with line breaks
      messageContent = messageContent.replace(/\n/g, "<br>");
    }
  } else if (message.message.role === "user") {
    // For user messages only, handle escaped backslash-n from JSON (\\n) and actual newlines
    messageContent = messageContent
      .replace(/\/$/gm, "<br>") // Replace "/" at end of lines with newlines
      .replace(/\\\\n/g, "<br>") // Handle \\n from JSON
      .replace(/\n/g, "<br>"); // Handle actual newlines
  }

  // Format timestamps like Adium
  const date = new Date(message.timestamp);
  // Hide timestamp on first message if there are consecutive messages (timestamp will show on last consecutive message instead)
  const shouldShowTimestamp = showTimestamp && consecutiveMessages.length === 0;
  const timeString = shouldShowTimestamp
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateString = shouldShowTimestamp ? date.toLocaleDateString() : "";

  // Determine sender info
  const userName = os.userInfo().username || "User";
  const senderName = message.message.role === "user" ? userName : "Claude";
  const iconPath = isIncoming ? "claude-icon.png" : "Outgoing/buddy_icon.png";

  // Generate message classes like Adium
  const messageClasses = [
    isIncoming ? "incoming" : "outgoing",
    "message",
    "autoresize",
  ].join(" ");

  // Process consecutive messages if any
  let consecutiveContent = "";
  if (consecutiveMessages.length > 0) {
    const nextTemplate = isIncoming
      ? theme.incomingNextTemplate || theme.incomingTemplate
      : theme.outgoingNextTemplate || theme.outgoingTemplate;

    for (let i = 0; i < consecutiveMessages.length; i++) {
      const nextMsg = consecutiveMessages[i];
      const isLastConsecutive = i === consecutiveMessages.length - 1;

      let nextMessageContent = "";

      if (typeof nextMsg.message.content === "string") {
        nextMessageContent = nextMsg.message.content;
      } else if (Array.isArray(nextMsg.message.content)) {
        nextMessageContent = nextMsg.message.content
          .filter((item: any) => item.type === "text" && item.text)
          .map((item: any) => item.text)
          .join("");
      }

      // Clean up consecutive message content too
      nextMessageContent = cleanMessageContent(nextMessageContent);

      // Process markdown for Claude messages
      if (nextMsg.message.role === "assistant" && nextMessageContent.trim()) {
        try {
          marked.setOptions({
            breaks: true,
            gfm: true,
          });
          nextMessageContent = marked.parse(nextMessageContent) as string;
          // Remove empty paragraphs and clean up wrapping
          nextMessageContent = nextMessageContent
            .replace(/<p>\s*<\/p>/g, "") // Remove empty paragraphs
            .replace(/(^|[^>])<\/p>/g, "$1") // Remove orphaned </p> tags anywhere in text
            .replace(/^<p>|<\/p>$/g, "") // Remove wrapping <p> tags for single paragraphs
            .trim();
        } catch (error) {
          nextMessageContent = nextMessageContent.replace(/\n/g, "<br>");
        }
      } else if (nextMsg.message.role === "user") {
        nextMessageContent = nextMessageContent
          .replace(/\/$/gm, "<br>")
          .replace(/\\\\n/g, "<br>")
          .replace(/\n/g, "<br>");
      }

      const nextDate = new Date(nextMsg.timestamp);
      // Only show timestamp on the last consecutive message
      const nextTimeString =
        showTimestamp && isLastConsecutive
          ? nextDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
      const nextDateString =
        showTimestamp && isLastConsecutive ? nextDate.toLocaleDateString() : "";

      let nextResult = nextTemplate
        .replace(/%message%/g, nextMessageContent)
        .replace(/%sender%/g, senderName)
        .replace(/%senderScreenName%/g, senderName)
        .replace(/%time%/g, nextTimeString)
        .replace(/%time\{[^}]*\}%/g, nextDateString)
        .replace(/%userIconPath%/g, iconPath)
        .replace(/%messageClasses%/g, messageClasses)
        .replace(/%senderColor%/g, isIncoming ? "#0000FF" : "#FF0000")
        .replace(/<span id="insert"><\/span>/g, "");

      // Clean up sender @ when there's no timestamp for consecutive messages
      if (!nextTimeString) {
        nextResult = nextResult.replace(
          new RegExp(`${senderName}\\s*@\\s*`, "g"),
          senderName
        );
      }

      consecutiveContent += nextResult;
    }
  }

  // Replace Adium template variables with authentic formatting
  let result = template
    .replace(/%message%/g, messageContent)
    .replace(/%sender%/g, senderName)
    .replace(/%senderScreenName%/g, senderName)
    .replace(/%time%/g, timeString)
    .replace(/%time\{[^}]*\}%/g, dateString)
    .replace(/%userIconPath%/g, iconPath)
    .replace(/%messageClasses%/g, messageClasses)
    .replace(/%senderColor%/g, isIncoming ? "#0000FF" : "#FF0000")
    .replace(/<span id="insert"><\/span>/g, consecutiveContent);

  // Clean up sender @ when there's no timestamp
  if (!timeString) {
    result = result.replace(
      new RegExp(`${senderName}\\s*@\\s*`, "g"),
      senderName
    );
  }

  return result;
}

async function generateHTML(
  projectName: string,
  conversationFile: string,
  themeName: string,
  customOutputDir?: string,
  isDevMode: boolean = false
) {
  try {
    console.log(`Generating HTML for conversation using ${themeName} theme...`);

    const theme = loadAdiumTheme(themeName);
    const { messages, chatName } = parseConversation(conversationFile);

    // Create deterministic output directory name
    const kebabChatName = chatName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const outputDir = customOutputDir
      ? path.join(customOutputDir, `${kebabChatName}-${projectName}`)
      : `${kebabChatName}-${projectName}`;

    // Create output directory structure
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Copy theme CSS files to output directory
    const themePath = path.join(theme.path, "Contents", "Resources");

    // Copy main CSS
    const mainCSSPath = path.join(themePath, "Styles", "main.css");
    if (fs.existsSync(mainCSSPath)) {
      const stylesDir = path.join(outputDir, "Styles");
      if (!fs.existsSync(stylesDir)) {
        fs.mkdirSync(stylesDir);
      }
      fs.copyFileSync(mainCSSPath, path.join(stylesDir, "main.css"));
    }

    // Copy Header CSS if it exists
    const headerCSSPath = path.join(themePath, "Styles", "Header.css");
    let hasHeaderCSS = false;
    if (fs.existsSync(headerCSSPath)) {
      const stylesDir = path.join(outputDir, "Styles");
      if (!fs.existsSync(stylesDir)) {
        fs.mkdirSync(stylesDir);
      }
      fs.copyFileSync(headerCSSPath, path.join(stylesDir, "Header.css"));
      hasHeaderCSS = true;
    }

    // Copy variant CSS if it exists
    let variantCSSFile = "";
    if (theme.variantCSS) {
      const variantSourcePath = path.join(themePath, theme.variantCSS);
      if (fs.existsSync(variantSourcePath)) {
        const variantDir = path.join(outputDir, path.dirname(theme.variantCSS));
        if (!fs.existsSync(variantDir)) {
          fs.mkdirSync(variantDir, { recursive: true });
        }
        fs.copyFileSync(
          variantSourcePath,
          path.join(outputDir, theme.variantCSS)
        );
        variantCSSFile = theme.variantCSS;
      }
    }

    // Copy images and other resources
    const resourceDirs = ["Incoming", "Outgoing", "images"];
    for (const resourceDir of resourceDirs) {
      const sourceDirPath = path.join(themePath, resourceDir);
      if (fs.existsSync(sourceDirPath)) {
        const targetDirPath = path.join(outputDir, resourceDir);
        copyDirectory(sourceDirPath, targetDirPath);
      }
    }

    // Copy Claude Code logo for Claude's messages
    const claudeIconSource = path.join(
      process.cwd(),
      "claude-icon-filled-256.png"
    );
    const claudeIconTarget = path.join(outputDir, "claude-icon.png");
    if (fs.existsSync(claudeIconSource)) {
      fs.copyFileSync(claudeIconSource, claudeIconTarget);
    }

    // Generate command that created this HTML
    const commandArgs = process.argv.slice(2);
    const isYarnDev = process.argv0.includes("yarn");
    const commandPrefix = isYarnDev ? "yarn dev" : "claude-to-adium";
    const commandUsed =
      commandArgs.length > 0
        ? `${commandPrefix} ${commandArgs.join(" ")}`
        : commandPrefix;

    // Generate HTML without base href, using local references
    let htmlContent = `<!-- Generated by: ${commandUsed} -->
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html><head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8">
	
	<style type="text/css">
		.actionMessageUserName { display:none; }
		.actionMessageBody:before { content:"*"; }
		.actionMessageBody:after { content:"*"; }
		* { word-wrap:break-word; text-rendering: optimizelegibility; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
		img.scaledToFitImage { height: auto; max-width: 100%; }
		pre, code { 
			font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; 
			font-size: 0.85em;
			word-wrap: break-word;
			white-space: pre-wrap;
			overflow-wrap: break-word;
		}
		pre {
			max-width: 100%;
			overflow-x: auto;
			padding: 0.5em;
			margin: 0.5em 0;
			background: rgba(0, 0, 0, 0.05);
			border-radius: 4px;
		}
		code {
			padding: 0.1em 0.3em;
			background: rgba(0, 0, 0, 0.1);
			border-radius: 3px;
		}
		pre code {
			padding: 0;
			background: none;
			border-radius: 0;
		}
		/* Override fixed header positioning to make it scroll with the page */
		#x-heading, .x-heading {
			position: static !important;
			top: auto !important;
			left: auto !important;
			right: auto !important;
			z-index: auto !important;
      margin-bottom: 0.5em;
      width: calc(100% - 2px) !important;
      overflow-x: hidden !important;
		}
		h1 { font-size: 1.2em; font-weight: 600; margin: 0.5em 0; }
		h2 { font-size: 1.15em; font-weight: 600; margin: 0.4em 0; }
		h3 { font-size: 1.1em; font-weight: 600; margin: 0.3em 0; }
		h4, h5, h6 { font-size: 1.05em; font-weight: 600; margin: 0.2em 0; }
	</style>
	
	<!-- This style is shared by all variants. !-->
	<style id="baseStyle" type="text/css" media="screen,print">
		@import url( "Styles/main.css" );
	</style>
	
	<!-- Header-specific styles !-->
	${
    hasHeaderCSS
      ? `<style id="headerStyle" type="text/css" media="screen,print">
		@import url( "Styles/Header.css" );
	</style>`
      : ""
  }
	
	<!-- Although we call this mainStyle for legacy reasons, it's actually the variant style !-->
	<style id="mainStyle" type="text/css" media="screen,print">
		${variantCSSFile ? `@import url( "${variantCSSFile}" );` : ""}
	</style>
	
</head>
<body style="margin-top: 5px;">

<div id="Chat" class="">`;

    // Add header if available
    if (theme.headerTemplate) {
      htmlContent += theme.headerTemplate
        .replace(/%chatName%/g, chatName)
        .replace(
          /%timeOpened%/g,
          new Date(messages[0]?.timestamp || Date.now()).toLocaleString()
        )
        .replace(/%incomingIconPath%/g, "claude-icon.png")
        .replace(/%outgoingIconPath%/g, "Outgoing/buddy_icon.png");
    }

    // Group consecutive messages by sender
    const messageGroups: Array<{
      type: "message" | "status" | "sidechain-interrupt";
      messages: ClaudeMessage[];
      statusText?: string;
      timestamp: string;
    }> = [];

    let lastMessageRole: string | null = null;
    let inSidechainMode = false;

    for (const message of messages) {
      if (message.type === "user" || message.type === "assistant") {
        // Handle sidechain messages
        if (message.isSidechain) {
          // If this is the first sidechain message, add interruption status
          if (!inSidechainMode && message.type === "user") {
            messageGroups.push({
              type: "sidechain-interrupt",
              messages: [],
              statusText:
                "User interrupted Claude's response (which is not in logs)",
              timestamp: message.timestamp,
            });
            lastMessageRole = null;
            inSidechainMode = true;
          }

          // Show assistant sidechain messages (Claude's response to interruption)
          if (message.type === "assistant" && inSidechainMode) {
            // Skip empty sidechain messages
            if (!message.message.content) continue;

            if (Array.isArray(message.message.content)) {
              const hasTextContent = message.message.content.some(
                (item: any) =>
                  item.type === "text" &&
                  item.text &&
                  item.text.trim().length > 0
              );
              if (!hasTextContent) continue;
            }

            if (
              typeof message.message.content === "string" &&
              message.message.content.trim().length === 0
            ) {
              continue;
            }

            // Add as new message group or append to existing if same role
            if (
              lastMessageRole === "assistant" &&
              messageGroups.length > 0 &&
              messageGroups[messageGroups.length - 1].type === "message"
            ) {
              messageGroups[messageGroups.length - 1].messages.push(message);
            } else {
              messageGroups.push({
                type: "message",
                messages: [message],
                timestamp: message.timestamp,
              });
            }
            lastMessageRole = "assistant";
          }

          // Skip user sidechain messages (they're system-generated)
          if (message.type === "user") continue;
        } else {
          // Regular message - exit sidechain mode
          inSidechainMode = false;

          // Check if this is a cancellation message
          if (isCancellationMessage(message)) {
            messageGroups.push({
              type: "status",
              messages: [],
              statusText: "Request was canceled by user",
              timestamp: message.timestamp,
            });
            lastMessageRole = null;
            continue;
          }

          // Check if this is a system message
          const systemMessageText = isSystemMessage(message);
          if (systemMessageText) {
            messageGroups.push({
              type: "status",
              messages: [],
              statusText: systemMessageText,
              timestamp: message.timestamp,
            });
            lastMessageRole = null;
            continue;
          }

          // Skip messages with no content
          if (!message.message.content) continue;

          // For array content (both user and assistant), check if there's meaningful text
          if (Array.isArray(message.message.content)) {
            const hasTextContent = message.message.content.some(
              (item: any) =>
                item.type === "text" && item.text && item.text.trim().length > 0
            );
            if (!hasTextContent) continue;
          }

          // For string content, skip if empty
          if (
            typeof message.message.content === "string" &&
            message.message.content.trim().length === 0
          ) {
            continue;
          }

          // Add as new message group or append to existing if same role
          if (
            lastMessageRole === message.message.role &&
            messageGroups.length > 0 &&
            messageGroups[messageGroups.length - 1].type === "message"
          ) {
            messageGroups[messageGroups.length - 1].messages.push(message);
          } else {
            messageGroups.push({
              type: "message",
              messages: [message],
              timestamp: message.timestamp,
            });
          }
          lastMessageRole = message.message.role;
        }
      }
    }

    // Render grouped messages

    for (const group of messageGroups) {
      if (group.type === "status" || group.type === "sidechain-interrupt") {
        htmlContent += renderStatusMessage(
          group.statusText!,
          theme,
          group.timestamp,
          true // Always show timestamp for status messages
        );
      } else if (group.type === "message" && group.messages.length > 0) {
        const firstMessage = group.messages[0];
        const consecutiveMessages = group.messages.slice(1);
        const isIncoming = firstMessage.message.role === "assistant";

        htmlContent += renderMessage(
          firstMessage,
          theme,
          isIncoming,
          true, // Always show timestamp for first message in group
          consecutiveMessages
        );
      }
    }

    htmlContent += "</div>\n</body></html>";

    // Write HTML file inside the output directory
    const htmlFile = path.join(outputDir, "conversation.html");
    fs.writeFileSync(htmlFile, htmlContent);

    console.log(`HTML conversation generated in directory: ${outputDir}/`);

    // Open in browser if running via yarn dev
    if (isDevMode) {
      const absoluteHtmlPath = path.resolve(htmlFile);
      console.log(`Opening conversation.html in default browser...`);

      // Use platform-appropriate command to open the file
      const openCommand =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "start"
          : "xdg-open";

      exec(`${openCommand} "${absoluteHtmlPath}"`, (error) => {
        if (error) {
          console.error(`Failed to open browser: ${error.message}`);
        }
      });
    }
  } catch (error) {
    console.error("Error generating HTML:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
