# describe-image

**Pi extension** — describes images using a vision model when your active model cannot see images directly.

## Why?

Most coding models are text-only. When a user shares a screenshot, UI mockup, or photo, the model sees:

```
(tool image omitted: model does not support images)
```

This extension gives blind models **eyes** — it registers the `describe_image` tool that calls MiniMax-M3 (or any vision model you configure) and returns a text description.

## How it works

- Registers a tool called `describe_image`
- The tool calls a vision model API and returns the description as text
- **Auto-manages itself**: activates when the active model can't see images, deactivates when using a multimodal model
- Listens to `model_select` events — switches on/off automatically when you change models mid-session

## Installation

```bash
# from npm
pi install npm:@maulanashalihin/describe-image

# or from GitHub
pi install git:github.com/maulanashalihin/describe-image
```

Or clone manually into `~/.pi/agent/extensions/`:

```bash
git clone https://github.com/maulanashalihin/describe-image.git \
  ~/.pi/agent/extensions/describe-image
```

## Usage

Just share an image with your model. If the model is text-only, it will automatically call `describe_image` to "see" it.

```
User: [screenshot of error message]
Model: *calls describe_image, gets description, helps debug*
```

Or call it directly:

```
describe_image path="./screenshot.png" prompt="What does the error say?"
```

## Configuration

Edit `config.json` next to the extension:

```json
{
  "model": "minimax-m3",
  "apiUrl": "https://opencode.ai/zen/go/v1/messages",
  "authKey": "opencode-go",
  "apiFormat": "anthropic",
  "maxTokens": 2048,
  "temperature": 0
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `model` | `minimax-m3` | Vision model ID |
| `apiUrl` | `https://opencode.ai/zen/go/v1/messages` | API endpoint |
| `authKey` | `opencode-go` | Key name in `~/.pi/agent/auth.json` |
| `apiFormat` | `anthropic` | API format: `"openai"` or `"anthropic"` |
| `maxTokens` | `2048` | Max response tokens |
| `temperature` | `0` | Model temperature |

### `apiFormat`

The extension supports two API formats for image input:

| Format | Header | Image block | Endpoint example |
|--------|--------|-------------|------------------|
| `"openai"` | `Authorization: Bearer` | `{ type: "image_url", image_url: { url: "data:..." } }` | `/chat/completions` |
| `"anthropic"` | `x-api-key` | `{ type: "image", source: { type: "base64", media_type: "...", data: "..." } }` | `/messages` |

### Provider examples

**OpenCode API (Anthropic-format models — MiniMax, Qwen):**

```json
{
  "model": "minimax-m3",
  "apiUrl": "https://opencode.ai/zen/go/v1/messages",
  "authKey": "opencode-go",
  "apiFormat": "anthropic"
}
```

**OpenCode API (OpenAI-format models — Kimi, DeepSeek, MiMo, GLM):**

```json
{
  "model": "mimo-v2.5-pro",
  "apiUrl": "https://opencode.ai/zen/go/v1/chat/completions",
  "authKey": "opencode-go",
  "apiFormat": "openai"
}
```

**Direct MiniMax API:**

```json
{
  "model": "MiniMax-M3",
  "apiUrl": "https://api.minimax.io/v1/chat/completions",
  "authKey": "minimax",
  "apiFormat": "openai"
}
```

The API key is read from `~/.pi/agent/auth.json` under the key specified by `authKey`:

```json
{
  "opencode-go": {
    "type": "api_key",
    "key": "sk-..."
  }
}
```

## Files

```
~/.pi/agent/extensions/describe-image/
├── config.json    ← vision model settings
├── index.ts       ← extension code
└── package.json   ← npm package metadata
```

## License

MIT
