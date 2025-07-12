# Claude Code to Adium HTML Converter

Convert your Claude Code conversations to beautifully styled HTML files using classic Adium message themes.

## Features

- 🎨 **Beautiful Themes** - Uses authentic Adium message styles for nostalgic, polished chat presentation
- 🖱️ **Interactive Mode** - Simple prompts to select projects, conversations, and themes
- ⚡ **Direct Mode** - Skip prompts with command-line arguments for automation
- 📁 **Auto-Discovery** - Automatically finds Claude projects and available Adium themes
- 🔄 **Smart Parsing** - Handles Claude Code's JSONL conversation format with message content extraction

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd claude-code-to-adium

# Install dependencies
yarn install
```

## Usage

### Interactive Mode

Run the CLI and follow the prompts:

```bash
yarn dev
```

This will guide you through:

1. **Choose a Claude project** - From `/Users/orta/.claude/projects`
2. **Select a conversation** - Shows first user message as the name
3. **Pick an Adium theme** - From installed Adium message styles

### Non-Interactive Mode

Use the command provided by interactive mode for automation:

```bash
yarn dev "project-name" "conversation-id" "theme-name"
```

Example:

```bash
yarn dev "-Users-orta-dev-app" "ae00148f-c551-400d-bb7e-aac953f62fc8" "Renkoo"
```

## Available Themes

The CLI automatically detects installed Adium themes from:

```
/Applications/Adium.app/Contents/Resources/Message Styles
```

Common themes include:

- **Renkoo** - Clean, bubble-style messages
- **Gone Dark** - Dark theme with multiple variants
- **Mockie** - Minimalist design
- **Smooth Operator** - Modern, sleek appearance

## Output

Generated HTML files include:

- Full conversation history with proper sender attribution
- Timestamps for each message
- Theme-specific CSS styling
- Proper message bubble formatting
- Header information (when available in theme)

Files are saved as `conversation-[timestamp].html` in the current directory.

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

- Node.js 16+
- Adium installed (for theme access)
- Claude Code conversations in the default location

## Contributing

The project uses TypeScript with strict type checking and modern Node.js features. All contributions should maintain type safety and follow the existing code structure.
