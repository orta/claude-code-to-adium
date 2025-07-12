#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const inquirer_1 = __importDefault(require("inquirer"));
const marked_1 = require("marked");
const CLAUDE_PROJECTS_PATH = "/Users/orta/.claude/projects";
const ADIUM_THEMES_PATH = "/Applications/Adium.app/Contents/Resources/Message Styles";
const USER_ADIUM_THEMES_PATH = path.join(os.homedir(), "Library/Application Support/Adium 2.0/Message Styles");
function copyDirectory(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    const items = fs.readdirSync(source, { withFileTypes: true });
    for (const item of items) {
        const sourcePath = path.join(source, item.name);
        const targetPath = path.join(target, item.name);
        if (item.isDirectory()) {
            copyDirectory(sourcePath, targetPath);
        }
        else {
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
        const conversationPath = path.join(projectPath, conversationFile + ".jsonl");
        await generateHTML(projectName, conversationPath, themeName);
    }
    else {
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
        path.resolve(__dirname, "..", "..", "package.json") // npm package root
    ];
    for (const packagePath of possiblePaths) {
        try {
            const packageContent = fs.readFileSync(packagePath, "utf8");
            const packageData = JSON.parse(packageContent);
            if (packageData.name === "claude-code-to-adium") {
                version = packageData.version;
                break;
            }
        }
        catch {
            // Continue to next path
        }
    }
    console.log(`Claude Code to Adium HTML Converter v${version}`);
    console.log("=".repeat(40 + version.length) + "\n");
    // Step 1: Choose project
    const projects = getAvailableProjects();
    const { selectedProject } = await inquirer_1.default.prompt([
        {
            type: "list",
            name: "selectedProject",
            message: "Choose a Claude project:",
            choices: projects.map((p) => ({
                name: p.displayName,
                value: p,
            })),
        },
    ]);
    // Step 2: Choose conversation
    const conversations = getConversationsForProject(selectedProject.path);
    const { selectedConversation } = await inquirer_1.default.prompt([
        {
            type: "list",
            name: "selectedConversation",
            message: "Choose a conversation:",
            choices: conversations.map((c) => ({ name: c.name, value: c.file })),
        },
    ]);
    // Step 3: Choose theme
    const themes = getAvailableThemes();
    const { selectedTheme } = await inquirer_1.default.prompt([
        {
            type: "list",
            name: "selectedTheme",
            message: "Choose an Adium theme:",
            choices: themes.map((t) => ({ name: t.name, value: t.name })),
        },
    ]);
    // Generate command for future use
    const projectName = selectedProject.originalName;
    const conversationName = path.basename(selectedConversation, ".jsonl");
    console.log(`\nFor future use, run: claude-to-adium "${projectName}" "${conversationName}" "${selectedTheme}"\n`);
    // Generate HTML
    await generateHTML(projectName, selectedConversation, selectedTheme);
}
function getAvailableProjects() {
    const projects = fs
        .readdirSync(CLAUDE_PROJECTS_PATH, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => ({
        displayName: dirent.name.replace(/^-/, "").replace(/-/g, "/"),
        originalName: dirent.name,
        path: path.join(CLAUDE_PROJECTS_PATH, dirent.name),
    }));
    return projects;
}
function getConversationsForProject(projectPath) {
    const files = fs
        .readdirSync(projectPath)
        .filter((file) => file.endsWith(".jsonl"))
        .map((file) => {
        const filePath = path.join(projectPath, file);
        const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0];
        let name = file;
        try {
            const firstMessage = JSON.parse(firstLine);
            if (firstMessage.type === "user" && firstMessage.message.content) {
                const content = typeof firstMessage.message.content === "string"
                    ? firstMessage.message.content
                    : firstMessage.message.content.find((c) => c.text)?.text || "";
                name = content.slice(0, 60) + (content.length > 60 ? "..." : "");
            }
        }
        catch (_e) {
            // Use filename if parsing fails
        }
        return { name, file: filePath };
    });
    return files;
}
function getAvailableThemes() {
    const themes = [];
    // Check system themes
    try {
        const systemThemes = fs
            .readdirSync(ADIUM_THEMES_PATH, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory() && dirent.name.endsWith(".AdiumMessageStyle"))
            .map((dirent) => ({
            name: dirent.name.replace(".AdiumMessageStyle", ""),
            path: path.join(ADIUM_THEMES_PATH, dirent.name),
        }));
        themes.push(...systemThemes);
    }
    catch {
        // System themes not found
    }
    // Check user themes
    try {
        if (fs.existsSync(USER_ADIUM_THEMES_PATH)) {
            const userThemes = fs
                .readdirSync(USER_ADIUM_THEMES_PATH, { withFileTypes: true })
                .filter((dirent) => dirent.isDirectory() && dirent.name.endsWith(".AdiumMessageStyle"))
                .map((dirent) => ({
                name: dirent.name.replace(".AdiumMessageStyle", ""),
                path: path.join(USER_ADIUM_THEMES_PATH, dirent.name),
            }));
            themes.push(...userThemes);
        }
    }
    catch {
        // User themes not found
    }
    if (themes.length === 0) {
        console.error("Could not find any Adium themes. Is Adium installed?");
        process.exit(1);
    }
    // Remove duplicates (prefer user themes over system themes)
    const uniqueThemes = themes.reduce((acc, theme) => {
        if (!acc.find(t => t.name === theme.name)) {
            acc.push(theme);
        }
        return acc;
    }, []);
    return uniqueThemes;
}
function loadAdiumTheme(themeName) {
    // Try to find theme in user directory first, then system directory
    let themePath = path.join(USER_ADIUM_THEMES_PATH, `${themeName}.AdiumMessageStyle`);
    if (!fs.existsSync(themePath)) {
        themePath = path.join(ADIUM_THEMES_PATH, `${themeName}.AdiumMessageStyle`);
    }
    const resourcesPath = path.join(themePath, "Contents", "Resources");
    // Load templates
    const incomingPath = path.join(resourcesPath, "Incoming", "Content.html");
    const outgoingPath = path.join(resourcesPath, "Outgoing", "Content.html");
    const fallbackPath = path.join(resourcesPath, "Content.html");
    let incomingTemplate = "";
    let outgoingTemplate = "";
    if (fs.existsSync(incomingPath)) {
        incomingTemplate = fs.readFileSync(incomingPath, "utf8");
    }
    else if (fs.existsSync(fallbackPath)) {
        incomingTemplate = fs.readFileSync(fallbackPath, "utf8");
    }
    if (fs.existsSync(outgoingPath)) {
        outgoingTemplate = fs.readFileSync(outgoingPath, "utf8");
    }
    else {
        outgoingTemplate = incomingTemplate;
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
        headerTemplate,
        statusTemplate,
        mainCSS,
        variantCSS,
    };
}
function parseConversation(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content
        .trim()
        .split("\n")
        .filter((line) => line.trim());
    const messages = lines.map((line) => JSON.parse(line));
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
        if (chatName === "Claude Conversation" &&
            firstMessage.type === "user" &&
            firstMessage.message.content) {
            const content = typeof firstMessage.message.content === "string"
                ? firstMessage.message.content
                : firstMessage.message.content.find((c) => c.text)?.text || "";
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
function isCancellationMessage(message) {
    if (!message.message.content)
        return false;
    let content = "";
    if (typeof message.message.content === "string") {
        content = message.message.content;
    }
    else if (Array.isArray(message.message.content)) {
        content = message.message.content
            .filter((item) => item.type === "text" && item.text)
            .map((item) => item.text)
            .join("");
    }
    return (content.includes("Request cancelled") ||
        content.includes("Request canceled") ||
        content.includes("Request interrupted") ||
        content.includes("request was cancelled") ||
        content.includes("request was canceled"));
}
function isSystemMessage(message) {
    if (!message.message.content)
        return null;
    // Check if userType indicates a system message
    if (message.userType && message.userType !== "external") {
        return `System message (${message.userType})`;
    }
    let content = "";
    if (typeof message.message.content === "string") {
        content = message.message.content;
    }
    else if (Array.isArray(message.message.content)) {
        content = message.message.content
            .filter((item) => item.type === "text" && item.text)
            .map((item) => item.text)
            .join("");
    }
    // Check for system continuation messages
    if (content.includes("This session is being continued from a previous conversation")) {
        return "Session continued from previous conversation";
    }
    // Check for context limit messages
    if (content.includes("ran out of context") || content.includes("context limit")) {
        return "Context limit reached";
    }
    // Check for system reminders
    if (content.includes("<system-reminder>")) {
        return "System reminder";
    }
    return null;
}
function renderStatusMessage(statusText, theme, timestamp, showTimestamp = true) {
    // Use status template if available, otherwise create a simple status message
    const template = theme.statusTemplate || '<div class="status">%message%</div>';
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
function renderMessage(message, theme, isIncoming, showTimestamp = true) {
    const template = isIncoming ? theme.incomingTemplate : theme.outgoingTemplate;
    // Extract text content
    let messageContent = "";
    if (typeof message.message.content === "string") {
        messageContent = message.message.content;
    }
    else if (Array.isArray(message.message.content)) {
        messageContent = message.message.content
            .filter((item) => item.type === "text" && item.text)
            .map((item) => item.text)
            .join("");
    }
    // Process markdown for Claude messages (assistant role)
    if (message.message.role === "assistant" && messageContent.trim()) {
        try {
            // Configure marked for better chat formatting
            marked_1.marked.setOptions({
                breaks: true, // Convert line breaks to <br>
                gfm: true, // GitHub flavored markdown
            });
            messageContent = marked_1.marked.parse(messageContent);
            // Remove wrapping <p> tags for single paragraphs
            messageContent = messageContent.replace(/^<p>|<\/p>$/g, "");
        }
        catch (error) {
            // Fallback to plain text with line breaks
            messageContent = messageContent.replace(/\n/g, "<br>");
        }
    }
    else if (message.message.role === "user") {
        // For user messages only, handle escaped backslash-n from JSON (\\n) and actual newlines
        messageContent = messageContent
            .replace(/\\\\n/g, "<br>") // Handle \\n from JSON
            .replace(/\n/g, "<br>"); // Handle actual newlines
    }
    // Format timestamps like Adium
    const date = new Date(message.timestamp);
    const timeString = showTimestamp
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    const dateString = showTimestamp ? date.toLocaleDateString() : "";
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
async function generateHTML(projectName, conversationFile, themeName) {
    try {
        console.log(`Generating HTML for conversation using ${themeName} theme...`);
        const theme = loadAdiumTheme(themeName);
        const { messages, chatName } = parseConversation(conversationFile);
        // Create deterministic output directory name
        const kebabChatName = chatName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
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
        const resourceDirs = ["Incoming", "Outgoing", "images"];
        for (const resourceDir of resourceDirs) {
            const sourceDirPath = path.join(themePath, resourceDir);
            if (fs.existsSync(sourceDirPath)) {
                const targetDirPath = path.join(outputDir, resourceDir);
                copyDirectory(sourceDirPath, targetDirPath);
            }
        }
        // Copy Claude Code logo for Claude's messages
        const claudeIconSource = path.join(process.cwd(), "claude-icon-filled-256.png");
        const claudeIconTarget = path.join(outputDir, "claude-icon.png");
        if (fs.existsSync(claudeIconSource)) {
            fs.copyFileSync(claudeIconSource, claudeIconTarget);
        }
        // Generate HTML without base href, using local references
        let htmlContent = `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html><head>
	<meta http-equiv="content-type" content="text/html; charset=utf-8">
	
	<style type="text/css">
		.actionMessageUserName { display:none; }
		.actionMessageBody:before { content:"*"; }
		.actionMessageBody:after { content:"*"; }
		* { word-wrap:break-word; text-rendering: optimizelegibility; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
		img.scaledToFitImage { height: auto; max-width: 100%; }
		pre, code { font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace; }
		h1 { font-size: 1.2em; font-weight: 600; margin: 0.5em 0; }
		h2 { font-size: 1.15em; font-weight: 600; margin: 0.4em 0; }
		h3 { font-size: 1.1em; font-weight: 600; margin: 0.3em 0; }
		h4, h5, h6 { font-size: 1.05em; font-weight: 600; margin: 0.2em 0; }
	</style>
	
	<!-- This style is shared by all variants. !-->
	<style id="baseStyle" type="text/css" media="screen,print">
		@import url( "Styles/main.css" );
	</style>
	
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
                .replace(/%timeOpened%/g, new Date(messages[0]?.timestamp || Date.now()).toLocaleString());
        }
        // Add messages
        let lastMessageTime = null;
        let inSidechainMode = false;
        for (const message of messages) {
            if (message.type === "user" || message.type === "assistant") {
                // Handle sidechain messages
                if (message.isSidechain) {
                    // If this is the first sidechain message, add interruption status
                    if (!inSidechainMode && message.type === "user") {
                        const currentTime = new Date(message.timestamp);
                        const showTime = !lastMessageTime ||
                            Math.abs(currentTime.getTime() - lastMessageTime.getTime()) >=
                                60000;
                        htmlContent += renderStatusMessage("User interrupted Claude's response (which is not in logs)", theme, message.timestamp, showTime);
                        lastMessageTime = currentTime;
                        inSidechainMode = true;
                    }
                    // Show assistant sidechain messages (Claude's response to interruption)
                    if (message.type === "assistant" && inSidechainMode) {
                        // Skip empty sidechain messages
                        if (!message.message.content)
                            continue;
                        if (Array.isArray(message.message.content)) {
                            const hasTextContent = message.message.content.some((item) => item.type === "text" &&
                                item.text &&
                                item.text.trim().length > 0);
                            if (!hasTextContent)
                                continue;
                        }
                        if (typeof message.message.content === "string" &&
                            message.message.content.trim().length === 0) {
                            continue;
                        }
                        const currentMessageTime = new Date(message.timestamp);
                        const showTimestamp = !lastMessageTime ||
                            Math.abs(currentMessageTime.getTime() - lastMessageTime.getTime()) >= 60000;
                        htmlContent += renderMessage(message, theme, true, showTimestamp);
                        lastMessageTime = currentMessageTime;
                    }
                    // Skip user sidechain messages (they're system-generated)
                    if (message.type === "user")
                        continue;
                }
                else {
                    // Regular message - exit sidechain mode
                    inSidechainMode = false;
                    // Check if this is a cancellation message
                    if (isCancellationMessage(message)) {
                        const currentTime = new Date(message.timestamp);
                        const showTime = !lastMessageTime ||
                            Math.abs(currentTime.getTime() - lastMessageTime.getTime()) >=
                                60000;
                        htmlContent += renderStatusMessage("Request was canceled by user", theme, message.timestamp, showTime);
                        lastMessageTime = currentTime;
                        continue;
                    }
                    // Check if this is a system message
                    const systemMessageText = isSystemMessage(message);
                    if (systemMessageText) {
                        const currentTime = new Date(message.timestamp);
                        const showTime = !lastMessageTime ||
                            Math.abs(currentTime.getTime() - lastMessageTime.getTime()) >=
                                60000;
                        htmlContent += renderStatusMessage(systemMessageText, theme, message.timestamp, showTime);
                        lastMessageTime = currentTime;
                        continue;
                    }
                    // Skip messages with no content
                    if (!message.message.content)
                        continue;
                    // For array content (both user and assistant), check if there's meaningful text
                    if (Array.isArray(message.message.content)) {
                        const hasTextContent = message.message.content.some((item) => item.type === "text" && item.text && item.text.trim().length > 0);
                        if (!hasTextContent)
                            continue;
                    }
                    // For string content, skip if empty
                    if (typeof message.message.content === "string" &&
                        message.message.content.trim().length === 0) {
                        continue;
                    }
                    const currentMessageTime = new Date(message.timestamp);
                    const showTimestamp = !lastMessageTime ||
                        Math.abs(currentMessageTime.getTime() - lastMessageTime.getTime()) >= 60000; // 1 minute
                    const isIncoming = message.message.role === "assistant";
                    htmlContent += renderMessage(message, theme, isIncoming, showTimestamp);
                    lastMessageTime = currentMessageTime;
                }
            }
        }
        htmlContent += "</div>\n</body></html>";
        // Write HTML file inside the output directory
        const htmlFile = path.join(outputDir, "conversation.html");
        fs.writeFileSync(htmlFile, htmlContent);
        console.log(`HTML conversation generated in directory: ${outputDir}/`);
    }
    catch (error) {
        console.error("Error generating HTML:", error);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
