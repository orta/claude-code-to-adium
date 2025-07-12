#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
}

interface AdiumTheme {
  name: string;
  path: string;
  incomingTemplate: string;
  outgoingTemplate: string;
  headerTemplate?: string;
  mainCSS?: string;
  variantCSS?: string;
}

const CLAUDE_PROJECTS_PATH = "/Users/orta/.claude/projects";
const ADIUM_THEMES_PATH =
  "/Applications/Adium.app/Contents/Resources/Message Styles";

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

  if (args.length === 3) {
    // Non-interactive mode with provided arguments
    const [projectName, conversationFile, themeName] = args;
    const projectPath = path.join(CLAUDE_PROJECTS_PATH, projectName);
    const conversationPath = path.join(projectPath, conversationFile + '.jsonl');
    await generateHTML(projectName, conversationPath, themeName);
  } else {
    // Interactive mode
    await interactiveMode();
  }
}

async function interactiveMode() {
  console.log("Claude Code to Adium HTML Converter");
  console.log("=====================================\n");

  // Step 1: Choose project
  const projects = getAvailableProjects();
  const { selectedProject } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedProject",
      message: "Choose a Claude project:",
      choices: projects.map((p: any) => ({
        name: p.displayName,
        value: p.path,
      })),
    },
  ]);

  // Step 2: Choose conversation
  const conversations = getConversationsForProject(selectedProject);
  const { selectedConversation } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedConversation",
      message: "Choose a conversation:",
      choices: conversations.map((c: any) => ({ name: c.name, value: c.file })),
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

  // Generate command for future use
  const projectName = path.basename(selectedProject);
  const conversationName = path.basename(selectedConversation, ".jsonl");
  console.log(
    `\nFor future use, run: claude-to-adium "${projectName}" "${conversationName}" "${selectedTheme}"\n`
  );

  // Generate HTML
  await generateHTML(projectName, selectedConversation, selectedTheme);
}

function getAvailableProjects() {
  const projects = fs
    .readdirSync(CLAUDE_PROJECTS_PATH, { withFileTypes: true })
    .filter((dirent: any) => dirent.isDirectory())
    .map((dirent: any) => ({
      displayName: dirent.name.replace(/^-/, "").replace(/-/g, "/"),
      path: path.join(CLAUDE_PROJECTS_PATH, dirent.name),
    }));

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

      return { name, file: filePath };
    });

  return files;
}

function getAvailableThemes() {
  return fs
    .readdirSync(ADIUM_THEMES_PATH, { withFileTypes: true })
    .filter(
      (dirent: any) =>
        dirent.isDirectory() && dirent.name.endsWith(".AdiumMessageStyle")
    )
    .map((dirent: any) => ({
      name: dirent.name.replace(".AdiumMessageStyle", ""),
      path: path.join(ADIUM_THEMES_PATH, dirent.name),
    }));
}

function loadAdiumTheme(themeName: string): AdiumTheme {
  const themePath = path.join(
    ADIUM_THEMES_PATH,
    `${themeName}.AdiumMessageStyle`
  );
  const resourcesPath = path.join(themePath, "Contents", "Resources");

  // Load templates
  const incomingPath = path.join(resourcesPath, "Incoming", "Content.html");
  const outgoingPath = path.join(resourcesPath, "Outgoing", "Content.html");
  const fallbackPath = path.join(resourcesPath, "Content.html");

  let incomingTemplate = "";
  let outgoingTemplate = "";

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

  // Load header template
  const headerPath = path.join(resourcesPath, "Header.html");
  let headerTemplate = "";
  if (fs.existsSync(headerPath)) {
    headerTemplate = fs.readFileSync(headerPath, "utf8");
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
    "Variants/Steel on Blue.css"
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
    headerTemplate,
    mainCSS,
    variantCSS,
  };
}

function parseConversation(filePath: string): { messages: ClaudeMessage[]; chatName: string } {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content
    .trim()
    .split("\n")
    .filter((line) => line.trim());

  const messages = lines.map((line: string) => JSON.parse(line) as ClaudeMessage);
  
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
    if (chatName === "Claude Conversation" && firstMessage.type === "user" && firstMessage.message.content) {
      const content = typeof firstMessage.message.content === "string" 
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

function renderMessage(
  message: ClaudeMessage,
  theme: AdiumTheme,
  isIncoming: boolean
): string {
  const template = isIncoming ? theme.incomingTemplate : theme.outgoingTemplate;

  // Extract text content
  let messageContent = "";
  let wasCancelled = false;
  
  if (typeof message.message.content === "string") {
    messageContent = message.message.content;
  } else if (Array.isArray(message.message.content)) {
    // Check for cancellation in array content
    const hasCancel = message.message.content.some((item: any) => 
      item.type === "text" && item.text && item.text.includes("Request cancelled")
    );
    
    if (hasCancel) {
      wasCancelled = true;
      messageContent = "<em>Request was cancelled by user</em>";
    } else {
      messageContent = message.message.content
        .filter((item: any) => item.type === "text" && item.text)
        .map((item: any) => item.text)
        .join("");
    }
  }
  
  // Check for cancellation in string content
  if (typeof messageContent === "string" && messageContent.includes("Request cancelled")) {
    wasCancelled = true;
    messageContent = "<em>Request was cancelled by user</em>";
  }

  // Process markdown for Claude messages (assistant role), but skip if cancelled
  if (message.message.role === "assistant" && messageContent.trim() && !wasCancelled) {
    try {
      // Configure marked for better chat formatting
      marked.setOptions({
        breaks: true, // Convert line breaks to <br>
        gfm: true,    // GitHub flavored markdown
      });
      messageContent = marked(messageContent);
      // Remove wrapping <p> tags for single paragraphs
      messageContent = messageContent.replace(/^<p>|<\/p>$/g, "");
    } catch (error) {
      // Fallback to plain text with line breaks
      messageContent = messageContent.replace(/\n/g, "<br>");
    }
  } else if (!wasCancelled) {
    // For user messages, just handle line breaks
    messageContent = messageContent.replace(/\n/g, "<br>");
  }

  // Format timestamps like Adium
  const date = new Date(message.timestamp);
  const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = date.toLocaleDateString();
  
  // Determine sender info
  const userName = os.userInfo().username || "User";
  const senderName = message.message.role === "user" ? userName : "Claude";
  const iconPath = isIncoming ? "Incoming/buddy_icon.png" : "Outgoing/buddy_icon.png";
  
  // Generate message classes like Adium
  const messageClasses = [
    isIncoming ? "incoming" : "outgoing",
    "message",
    "autoresize"
  ].join(" ");

  // Replace Adium template variables with authentic formatting
  return template
    .replace(/%message%/g, messageContent)
    .replace(/%sender%/g, senderName)
    .replace(/%senderScreenName%/g, senderName)
    .replace(/%time%/g, timeString)
    .replace(/%time\{[^}]*\}%/g, dateString)
    .replace(/%userIconPath%/g, iconPath)
    .replace(/%messageClasses%/g, messageClasses)
    .replace(/%senderColor%/g, isIncoming ? "#0000FF" : "#FF0000")
    .replace(/<span id="insert"><\/span>/g, "");
}

async function generateHTML(
  projectName: string,
  conversationFile: string,
  themeName: string
) {
  try {
    console.log(`Generating HTML for conversation using ${themeName} theme...`);

    const theme = loadAdiumTheme(themeName);
    const { messages, chatName } = parseConversation(conversationFile);

    // Create deterministic output directory name
    const kebabChatName = chatName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const outputDir = `${kebabChatName}-${projectName}`;
    
    // Create output directory structure
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Copy theme CSS files to output directory
    const themePath = path.join(ADIUM_THEMES_PATH, `${themeName}.AdiumMessageStyle`, "Contents", "Resources");
    
    // Copy main CSS
    const mainCSSPath = path.join(themePath, "Styles", "main.css");
    if (fs.existsSync(mainCSSPath)) {
      const stylesDir = path.join(outputDir, "Styles");
      if (!fs.existsSync(stylesDir)) {
        fs.mkdirSync(stylesDir);
      }
      fs.copyFileSync(mainCSSPath, path.join(stylesDir, "main.css"));
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
        fs.copyFileSync(variantSourcePath, path.join(outputDir, theme.variantCSS));
        variantCSSFile = theme.variantCSS;
      }
    }
    
    // Copy images and other resources
    const resourceDirs = ['Incoming', 'Outgoing', 'images'];
    for (const resourceDir of resourceDirs) {
      const sourceDirPath = path.join(themePath, resourceDir);
      if (fs.existsSync(sourceDirPath)) {
        const targetDirPath = path.join(outputDir, resourceDir);
        copyDirectory(sourceDirPath, targetDirPath);
      }
    }
    
    // Generate HTML without base href, using local references
    let htmlContent = `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html><head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8">
	
	<style type="text/css">
		.actionMessageUserName { display:none; }
		.actionMessageBody:before { content:"*"; }
		.actionMessageBody:after { content:"*"; }
		* { word-wrap:break-word; text-rendering: optimizelegibility; }
		img.scaledToFitImage { height: auto; max-width: 100%; }
	</style>
	
	<!-- This style is shared by all variants. !-->
	<style id="baseStyle" type="text/css" media="screen,print">
		@import url( "Styles/main.css" );
	</style>
	
	<!-- Although we call this mainStyle for legacy reasons, it's actually the variant style !-->
	<style id="mainStyle" type="text/css" media="screen,print">
		${variantCSSFile ? `@import url( "${variantCSSFile}" );` : ''}
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
        );
    }

    // Add messages
    for (const message of messages) {
      if (message.type === "user" || message.type === "assistant") {
        // Skip messages with no content
        if (!message.message.content) continue;
        
        // For array content (both user and assistant), check if there's meaningful text
        if (Array.isArray(message.message.content)) {
          const hasTextContent = message.message.content.some((item: any) => 
            item.type === "text" && item.text && item.text.trim().length > 0
          );
          if (!hasTextContent) continue;
        }
        
        // For string content, skip if empty
        if (typeof message.message.content === "string" && message.message.content.trim().length === 0) {
          continue;
        }
        
        const isIncoming = message.message.role === "assistant";
        htmlContent += renderMessage(message, theme, isIncoming);
      }
    }
    
    htmlContent += "</div>\n</body></html>";

    // Write HTML file inside the output directory
    const htmlFile = path.join(outputDir, "conversation.html");
    fs.writeFileSync(htmlFile, htmlContent);

    console.log(`HTML conversation generated in directory: ${outputDir}/`);
  } catch (error) {
    console.error("Error generating HTML:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
