// catalog is Codar's model list as its own client keeps it: the answer to
// GET /v1/codar/models, reduced to what magpie reads (id, name, context,
// maxOutput, input, output, protocol, reasoning, rate). rate is the vendor's
// own credit multiple (rate_badge, "0.20x"), shown by magpie beside the
// model; the vendor's prices in CNY stay out of it, as magpie's cost column is
// US dollars (see README). maxOutput is the reply ceiling the vendor's own
// request schema states (max_tokens.maximum), 0 where it states none. Kept as
// the list the provider has before the vendor is asked (and when it cannot be
// reached). Regenerate it with `node scripts/catalog.mjs` when Codar adds
// models; `provider.models` refreshes it live.
export const CATALOG = [
  {
    "id": "auto",
    "name": "auto",
    "context": 1000000,
    "maxOutput": 393216,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.2
  },
  {
    "id": "claude-opus-5-5",
    "name": "claude-opus-5-5",
    "context": 1000000,
    "maxOutput": 128000,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "anthropic_messages",
    "reasoning": true,
    "rate": 1.2
  },
  {
    "id": "claude-opus-5-5-kiro",
    "name": "claude-opus-5-5-kiro",
    "context": 1000000,
    "maxOutput": 128000,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "anthropic_messages",
    "reasoning": true,
    "rate": 0.48
  },
  {
    "id": "claude-sonnet-5-5",
    "name": "claude-sonnet-5-5",
    "context": 1000000,
    "maxOutput": 128000,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "anthropic_messages",
    "reasoning": true,
    "rate": 0.6
  },
  {
    "id": "claude-sonnet-5-5-kiro",
    "name": "claude-sonnet-5-5-kiro",
    "context": 1000000,
    "maxOutput": 128000,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "anthropic_messages",
    "reasoning": true,
    "rate": 0.24
  },
  {
    "id": "deepseek-v4-flash",
    "name": "deepseek-v4-flash",
    "context": 1000000,
    "maxOutput": 393216,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.2
  },
  {
    "id": "deepseek-v4-pro",
    "name": "deepseek-v4-pro",
    "context": 1000000,
    "maxOutput": 393216,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.72
  },
  {
    "id": "deepseek-v4.1-flash",
    "name": "deepseek-v4.1-flash",
    "context": 1000000,
    "maxOutput": 393216,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.2
  },
  {
    "id": "glm-5.2",
    "name": "glm-5.2",
    "context": 1000000,
    "maxOutput": 131072,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.72
  },
  {
    "id": "glm-5.3",
    "name": "glm-5.3",
    "context": 1000000,
    "maxOutput": 131072,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.72
  },
  {
    "id": "glm-5.3-flash",
    "name": "glm-5.3-flash",
    "context": 1000000,
    "maxOutput": 131072,
    "input": [
      "text",
      "image"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.07
  },
  {
    "id": "gpt-5.6-sol",
    "name": "gpt-5.6-sol",
    "context": 128000,
    "maxOutput": 0,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.56
  },
  {
    "id": "gpt-6-astra",
    "name": "gpt-6-astra",
    "context": 1050000,
    "maxOutput": 128000,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.74
  },
  {
    "id": "gpt-6-sol",
    "name": "gpt-6-sol",
    "context": 1050000,
    "maxOutput": 128000,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true,
    "rate": 0.19
  },
  {
    "id": "gpt-6.1-sol",
    "name": "gpt-6.1-sol",
    "context": 128000,
    "maxOutput": 0,
    "input": [
      "text"
    ],
    "output": [
      "text"
    ],
    "protocol": "openai_chat_completions",
    "reasoning": true
  }
]
