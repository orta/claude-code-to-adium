#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const CLAUDE_PROJECTS_PATH = '/Users/orta/.claude/projects';
const ADIUM_THEMES_PATH = '/Applications/Adium.app/Contents/Resources/Message Styles';

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
  console.log('Claude Code to Adium HTML Converter');
  console.log('=====================================\n');

  // Step 1: Choose project
  const projects = getAvailableProjects();
  const { selectedProject } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedProject',
    message: 'Choose a Claude project:',
    choices: projects.map(p => ({ name: p.displayName, value: p.path }))
  }]);

  // Step 2: Choose conversation
  const conversations = getConversationsForProject(selectedProject);
  const { selectedConversation } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedConversation',
    message: 'Choose a conversation:',
    choices: conversations.map(c => ({ name: c.name, value: c.file }))
  }]);

  // Step 3: Choose theme
  const themes = getAvailableThemes();
  const { selectedTheme } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedTheme',
    message: 'Choose an Adium theme:',
    choices: themes.map(t => ({ name: t.name, value: t.name }))
  }]);

  // Generate command for future use
  const projectName = path.basename(selectedProject);
  const conversationName = path.basename(selectedConversation, '.jsonl');
  console.log(`\nFor future use, run: claude-to-adium "${projectName}" "${conversationName}" "${selectedTheme}"\n`);

  // Generate HTML
  await generateHTML(projectName, selectedConversation, selectedTheme);
}

function getAvailableProjects() {
  const projects = fs.readdirSync(CLAUDE_PROJECTS_PATH, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => ({
      displayName: dirent.name.replace(/^-/, '').replace(/-/g, '/'),
      path: path.join(CLAUDE_PROJECTS_PATH, dirent.name)
    }));
  
  return projects;
}

function getConversationsForProject(projectPath) {
  const files = fs.readdirSync(projectPath)
    .filter(file => file.endsWith('.jsonl'))
    .map(file => {
      const filePath = path.join(projectPath, file);
      const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
      
      let name = file;
      try {
        const firstMessage = JSON.parse(firstLine);
        if (firstMessage.type === 'user' && firstMessage.message.content) {
          const content = typeof firstMessage.message.content === 'string' 
            ? firstMessage.message.content 
            : firstMessage.message.content.find(c => c.text)?.text || '';
          name = content.slice(0, 60) + (content.length > 60 ? '...' : '');
        }
      } catch (e) {
        // Use filename if parsing fails
      }
      
      return { name, file: filePath };
    });
  
  return files;
}

function getAvailableThemes() {
  return fs.readdirSync(ADIUM_THEMES_PATH, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name.endsWith('.AdiumMessageStyle'))
    .map(dirent => ({
      name: dirent.name.replace('.AdiumMessageStyle', ''),
      path: path.join(ADIUM_THEMES_PATH, dirent.name)
    }));
}

function loadAdiumTheme(themeName) {
  const themePath = path.join(ADIUM_THEMES_PATH, `${themeName}.AdiumMessageStyle`);
  const resourcesPath = path.join(themePath, 'Contents', 'Resources');
  
  // Load templates
  const incomingPath = path.join(resourcesPath, 'Incoming', 'Content.html');
  const outgoingPath = path.join(resourcesPath, 'Outgoing', 'Content.html');
  const fallbackPath = path.join(resourcesPath, 'Content.html');
  
  let incomingTemplate = '';
  let outgoingTemplate = '';
  
  if (fs.existsSync(incomingPath)) {
    incomingTemplate = fs.readFileSync(incomingPath, 'utf8');
  } else if (fs.existsSync(fallbackPath)) {
    incomingTemplate = fs.readFileSync(fallbackPath, 'utf8');
  }
  
  if (fs.existsSync(outgoingPath)) {
    outgoingTemplate = fs.readFileSync(outgoingPath, 'utf8');
  } else {
    outgoingTemplate = incomingTemplate;
  }
  
  // Load header template
  const headerPath = path.join(resourcesPath, 'Header.html');
  let headerTemplate = '';
  if (fs.existsSync(headerPath)) {
    headerTemplate = fs.readFileSync(headerPath, 'utf8');
  }
  
  // Load main CSS
  const mainCSSPath = path.join(resourcesPath, 'Styles', 'main.css');
  let mainCSS = '';
  if (fs.existsSync(mainCSSPath)) {
    mainCSS = fs.readFileSync(mainCSSPath, 'utf8');
  }
  
  return {
    name: themeName,
    path: themePath,
    incomingTemplate,
    outgoingTemplate,
    headerTemplate,
    mainCSS
  };
}

function parseConversation(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  
  return lines.map(line => JSON.parse(line));
}

function renderMessage(message, theme, isIncoming) {
  const template = isIncoming ? theme.incomingTemplate : theme.outgoingTemplate;
  
  // Extract text content
  let messageContent = '';
  if (typeof message.message.content === 'string') {
    messageContent = message.message.content;
  } else if (Array.isArray(message.message.content)) {
    messageContent = message.message.content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join('');
  }
  
  // Format timestamp
  const date = new Date(message.timestamp);
  const timeString = date.toLocaleTimeString();
  
  // Replace Adium template variables
  return template
    .replace(/%message%/g, messageContent.replace(/\n/g, '<br>'))
    .replace(/%sender%/g, message.message.role === 'user' ? 'User' : 'Claude')
    .replace(/%time%/g, timeString)
    .replace(/%userIconPath%/g, '')
    .replace(/%messageClasses%/g, '')
    .replace(/<span id="insert"><\/span>/g, '');
}

async function generateHTML(projectName, conversationFile, themeName) {
  try {
    console.log(`Generating HTML for conversation using ${themeName} theme...`);
    
    const theme = loadAdiumTheme(themeName);
    const messages = parseConversation(conversationFile);
    
    // Generate HTML content
    let htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Claude Conversation - ${themeName}</title>
    <style type="text/css">
        ${theme.mainCSS || ''}
    </style>
</head>
<body>
`;
    
    // Add header if available
    if (theme.headerTemplate) {
      htmlContent += theme.headerTemplate
        .replace(/%chatName%/g, 'Claude Conversation')
        .replace(/%timeOpened%/g, new Date(messages[0]?.timestamp || Date.now()).toLocaleString());
    }
    
    // Add messages
    htmlContent += '<div id="Chat">\n';
    for (const message of messages) {
      if (message.type === 'user' || message.type === 'assistant') {
        const isIncoming = message.message.role === 'assistant';
        htmlContent += renderMessage(message, theme, isIncoming) + '\n';
      }
    }
    htmlContent += '</div>\n</body>\n</html>';
    
    // Write output file
    const outputFile = `conversation-${Date.now()}.html`;
    fs.writeFileSync(outputFile, htmlContent);
    
    console.log(`HTML file generated: ${outputFile}`);
  } catch (error) {
    console.error('Error generating HTML:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}