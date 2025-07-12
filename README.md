# Claude Code to Adium HTML Converter

Convert your Claude Code conversations to styled HTML files using classic Adium message themes.

## Quick Start

No installation needed, use npx:

```bash
npx claude-code-to-adium
```

But you do need [Adium](https://adium.im) installed, and you can install any theme you want to Adium to have it show up in the list

## Installation (Development)

```bash
# Clone the repository
git clone https://github.com/orta/claude-code-to-adium.git
cd claude-code-to-adium

# Install dependencies
yarn install
```

## Usage

### Interactive Mode

Run with npx and follow the prompts:

```bash
npx claude-code-to-adium
```

This will guide you through:

1. **Choose a Claude project** - From `~/.claude/projects`
2. **Select a conversation** - Shows first user message as the name
3. **Pick an Adium theme** - From installed Adium message styles

### Non-Interactive Mode

Use the command provided by interactive mode for automation:

```bash
npx claude-code-to-adium "project-name" "conversation-id" "theme-name"
```

Example:

```bash
npx claude-code-to-adium "-Users-orta-dev-app" "ae00148f-c551-400d-bb7e-aac953f62fc8" "Renkoo"
```

## Available Themes

The CLI automatically detects installed Adium themes from:

- **System themes**: `/Applications/Adium.app/Contents/Resources/Message Styles/`
- **User themes**: `~/Library/Application Support/Adium 2.0/Message Styles/`

Common themes include:

- **Renkoo** - Clean, bubble-style messages (most tested theme)
- **Modern Bubbling** - Custom theme with glass effects and multiple color variants
- **Gone Dark** - Dark theme with multiple variants
- **Mockie** - Minimalist design
- **Smooth Operator** - Modern, sleek appearance

## Output

Generates complete self-contained folders with:

- **conversation.html** - Full conversation with proper styling
- **CSS files** - Theme styles (main.css and variants)
- **Images** - All theme images and Claude Code logo
- **Portable** - No dependencies on Adium installation for viewing

Output folders are named using chat title + project name (e.g., `my-chat-title-project-name/`).

## Technical Details

### TypeScript Setup

- **No transpilation** - Uses `tsx` for direct TypeScript execution
- **Type checking** - Run `yarn typecheck` for static analysis
- **Modern tooling** - ESM imports with Node.js compatibility

### Adium Theme Integration

- Reads authentic Adium `.AdiumMessageStyle` packages
- Supports incoming/outgoing message templates
- Handles CSS variants and styling
- Follows Adium's template variable system (`%message%`, `%sender%`, etc.)

### Claude Format Support

- Parses Claude Code JSONL conversation files
- Extracts text content from complex message structures
- Handles both user and assistant messages
- Preserves timestamps and conversation flow

## Scripts

```bash
yarn dev        # Run the CLI directly
yarn typecheck  # Check TypeScript types
yarn start      # Same as yarn dev
```

## Requirements

- **Node.js 16+** - For running the CLI
- **Adium installed** - Required for accessing message themes and styles
- **Claude Code conversations** - Must be in the default `~/.claude/projects` location

**Note**: Adium installation is necessary even if you don't use it for messaging, as the tool reads theme files from the Adium application bundle and user library.

## Contributing

The project uses TypeScript with strict type checking and modern Node.js features. All contributions should maintain type safety and follow the existing code structure.
