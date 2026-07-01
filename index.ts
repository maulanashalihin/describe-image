import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// ── Types ──

interface Config {
	model: string;
	apiUrl: string;
	authKey: string;
	maxTokens: number;
	temperature: number;
	toolName: string;
	toolLabel: string;
	toolDescription: string;
	promptSnippet: string;
	promptGuidelines: string[];
}

interface AuthEntry {
	type: string;
	key: string;
}

interface ModelInfo {
	id: string;
	input?: string[];
}

// ── Helpers ──

const MIME_MAP: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
};

function mimeOf(ext: string): string {
	return MIME_MAP[ext.toLowerCase()] ?? "image/png";
}

function modelHasVision(m: ModelInfo | null | undefined): boolean {
	return m?.input?.includes("image") ?? false;
}

function readApiKey(authKey: string): string | null {
	try {
		const p = resolve(homedir(), ".pi/agent/auth.json");
		if (!existsSync(p)) return null;
		const auth: Record<string, AuthEntry> = JSON.parse(
			readFileSync(p, "utf-8"),
		);
		return auth[authKey]?.key ?? null;
	} catch {
		return null;
	}
}

function loadConfig(dir: string): Config {
	const p = resolve(dir, "config.json");
	try {
		return JSON.parse(readFileSync(p, "utf-8")) as Config;
	} catch (e) {
		throw new Error(
			`Failed to load config.json at ${p}: ${e instanceof Error ? e.message : String(e)}`,
		);
	}
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
	// Config lives next to this compiled file — jiti resolves __dirname to the source dir
	const cfg = loadConfig(__dirname);
	const toolName = cfg.toolName;

	// ─── 1. Register tool ───

	pi.registerTool({
		name: toolName,
		label: cfg.toolLabel,
		description: cfg.toolDescription,
		promptSnippet: cfg.promptSnippet,
		promptGuidelines: cfg.promptGuidelines,

		parameters: Type.Object({
			path: Type.String({
				description:
					"Path to the image file (absolute or relative to current directory).",
			}),
			prompt: Type.Optional(
				Type.String({
					description:
						"Optional question about the image, e.g. 'What color is the button?', 'Describe the layout'.",
				}),
			),
		}),

		async execute(
			_toolCallId: string,
			params: { path: string; prompt?: string },
			signal: AbortSignal | undefined,
			onUpdate:
				| ((update: {
						content: Array<{ type: "text"; text: string }>;
						details: Record<string, unknown>;
				  }) => void)
				| undefined,
			ctx: { cwd: string },
		) {
			const { isAbsolute } = await import("node:path");
			const { readFile } = await import("node:fs/promises");
			const imagePath = isAbsolute(params.path)
				? params.path
				: resolve(ctx.cwd, params.path);

			// Read image
			let b64: string;
			let ext: string;
			try {
				const buf = await readFile(imagePath);
				b64 = buf.toString("base64");
				ext = imagePath.split(".").pop() ?? "png";
			} catch {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ File not found: \`${imagePath}\``,
						},
					],
					details: {},
				};
			}

			// Auth key
			const apiKey = readApiKey(cfg.authKey);
			if (!apiKey) {
				return {
					content: [
						{
							type: "text" as const,
							text: `❌ API key "${cfg.authKey}" not found in ~/.pi/agent/auth.json`,
						},
					],
					details: {},
				};
			}

			onUpdate?.({
				content: [
					{ type: "text", text: `🧠 Analyzing image with ${cfg.model}…` },
				],
				details: {},
			});

			const mime = mimeOf(ext);
			const body = JSON.stringify({
				model: cfg.model,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "image_url",
								image_url: { url: `data:${mime};base64,${b64}` },
							},
							{
								type: "text",
								text:
									params.prompt ??
									"Describe this image in detail. What do you see? Include layout, colors, text, and any notable elements.",
							},
						],
					},
				],
				max_tokens: cfg.maxTokens,
				temperature: cfg.temperature,
			});

			try {
				const res = await fetch(cfg.apiUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					body,
					signal,
				});

				if (!res.ok) {
					const errText = await res.text().catch(() => "unknown");
					return {
						content: [
							{
								type: "text" as const,
								text: `❌ Vision API error (${res.status}): ${errText.slice(0, 500)}`,
							},
						],
						details: {},
					};
				}

				const json = (await res.json()) as {
					choices?: Array<{ message?: { content?: string } }>;
				};
				let text = json?.choices?.[0]?.message?.content ?? "_(no response)_";

				// Strip <think>...</think> reasoning tags
				if (text.startsWith("<think>")) {
					const end = text.indexOf("</think>");
					if (end !== -1) text = text.slice(end + 8).trim();
				}

				return {
					content: [{ type: "text" as const, text }],
					details: { usedModel: cfg.model, imagePath: params.path },
				};
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [
						{ type: "text" as const, text: `❌ Vision model failed: ${msg}` },
					],
					details: {},
				};
			}
		},
	});

	// ─── 2. Auto-enable/disable based on model capability ───

	function syncTool(model: ModelInfo | null | undefined) {
		const hasVision = modelHasVision(model);
		const active = pi.getActiveTools();
		const hasTool = active.includes(toolName);

		if (!hasVision && !hasTool) {
			pi.setActiveTools([...active, toolName]);
		} else if (hasVision && hasTool) {
			pi.setActiveTools(active.filter((t) => t !== toolName));
		}
	}

	pi.on("model_select", (event) => {
		syncTool(event.model as ModelInfo);
	});

	pi.on("session_start", (_event, ctx) => {
		const m =
			(ctx as unknown as { model?: ModelInfo }).model ??
			(
				ctx as unknown as {
					modelRegistry?: { current?: ModelInfo };
				}
			).modelRegistry?.current;

		if (m) syncTool(m);
	});
}
