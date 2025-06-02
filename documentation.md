---
title: Streaming
headline: API Streaming | Real-time Model Responses in OpenRouter
canonical-url: 'https://openrouter.ai/docs/api-reference/streaming'
'og:site_name': OpenRouter Documentation
'og:title': API Streaming - Real-time Model Response Integration
'og:description': >-
  Learn how to implement streaming responses with OpenRouter's API. Complete
  guide to Server-Sent Events (SSE) and real-time model outputs.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=API%20Streaming&description=Real-time%20model%20response%20streaming
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import { API_KEY_REF, Model } from '../../../imports/constants';

The OpenRouter API allows streaming responses from _any model_. This is useful for building chat interfaces or other applications where the UI should update as the model generates the response.

To enable streaming, you can set the `stream` parameter to `true` in your request. The model will then stream the response to the client in chunks, rather than returning the entire response at once.

Here is an example of how to stream a response, and process it:

<Template data={{
  API_KEY_REF,
  MODEL: Model.GPT_4_Omni
}}>

<CodeGroup>

```python Python
import requests
import json

question = "How would you build the tallest building ever?"

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
  "Authorization": f"Bearer {{API_KEY_REF}}",
  "Content-Type": "application/json"
}

payload = {
  "model": "{{MODEL}}",
  "messages": [{"role": "user", "content": question}],
  "stream": True
}

buffer = ""
with requests.post(url, headers=headers, json=payload, stream=True) as r:
  for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
    buffer += chunk
    while True:
      try:
        # Find the next complete SSE line
        line_end = buffer.find('\n')
        if line_end == -1:
          break

        line = buffer[:line_end].strip()
        buffer = buffer[line_end + 1:]

        if line.startswith('data: '):
          data = line[6:]
          if data == '[DONE]':
            break

          try:
            data_obj = json.loads(data)
            content = data_obj["choices"][0]["delta"].get("content")
            if content:
              print(content, end="", flush=True)
          except json.JSONDecodeError:
            pass
      except Exception:
        break
```

```typescript TypeScript
const question = 'How would you build the tallest building ever?';
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY_REF}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages: [{ role: 'user', content: question }],
    stream: true,
  }),
});

const reader = response.body?.getReader();
if (!reader) {
  throw new Error('Response body is not readable');
}

const decoder = new TextDecoder();
let buffer = '';

try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append new chunk to buffer
    buffer += decoder.decode(value, { stream: true });

    // Process complete lines from buffer
    while (true) {
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) break;

      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0].delta.content;
          if (content) {
            console.log(content);
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    }
  }
} finally {
  reader.cancel();
}
```

</CodeGroup>
</Template>

### Additional Information

For SSE (Server-Sent Events) streams, OpenRouter occasionally sends comments to prevent connection timeouts. These comments look like:

```text
: OPENROUTER PROCESSING
```

Comment payload can be safely ignored per the [SSE specs](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation). However, you can leverage it to improve UX as needed, e.g. by showing a dynamic loading indicator.

Some SSE client implementations might not parse the payload according to spec, which leads to an uncaught error when you `JSON.stringify` the non-JSON payloads. We recommend the following clients:

- [eventsource-parser](https://github.com/rexxars/eventsource-parser)
- [OpenAI SDK](https://www.npmjs.com/package/openai)
- [Vercel AI SDK](https://www.npmjs.com/package/ai)

### Stream Cancellation

Streaming requests can be cancelled by aborting the connection. For supported providers, this immediately stops model processing and billing.

<Accordion title="Provider Support">

**Supported**

- OpenAI, Azure, Anthropic
- Fireworks, Mancer, Recursal
- AnyScale, Lepton, OctoAI
- Novita, DeepInfra, Together
- Cohere, Hyperbolic, Infermatic
- Avian, XAI, Cloudflare
- SFCompute, Nineteen, Liquid
- Friendli, Chutes, DeepSeek

**Not Currently Supported**

- AWS Bedrock, Groq, Modal
- Google, Google AI Studio, Minimax
- HuggingFace, Replicate, Perplexity
- Mistral, AI21, Featherless
- Lynn, Lambda, Reflection
- SambaNova, Inflection, ZeroOneAI
- AionLabs, Alibaba, Nebius
- Kluster, Targon, InferenceNet

</Accordion>

To implement stream cancellation:

<Template data={{
  API_KEY_REF,
  MODEL: Model.GPT_4_Omni
}}>

<CodeGroup>

```python Python
import requests
from threading import Event, Thread

def stream_with_cancellation(prompt: str, cancel_event: Event):
    with requests.Session() as session:
        response = session.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {{API_KEY_REF}}"},
            json={"model": "{{MODEL}}", "messages": [{"role": "user", "content": prompt}], "stream": True},
            stream=True
        )

        try:
            for line in response.iter_lines():
                if cancel_event.is_set():
                    response.close()
                    return
                if line:
                    print(line.decode(), end="", flush=True)
        finally:
            response.close()

# Example usage:
cancel_event = Event()
stream_thread = Thread(target=lambda: stream_with_cancellation("Write a story", cancel_event))
stream_thread.start()

# To cancel the stream:
cancel_event.set()
```

```typescript TypeScript
const controller = new AbortController();

try {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${{{API_KEY_REF}}}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: '{{MODEL}}',
        messages: [{ role: 'user', content: 'Write a story' }],
        stream: true,
      }),
      signal: controller.signal,
    },
  );

  // Process the stream...
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Stream cancelled');
  } else {
    throw error;
  }
}

// To cancel the stream:
controller.abort();
```

</CodeGroup>
</Template>

<Warning>
  Cancellation only works for streaming requests with supported providers. For
  non-streaming requests or unsupported providers, the model will continue
  processing and you will be billed for the complete response.
</Warning>



---
title: API Reference
subtitle: An overview of OpenRouter's API
headline: OpenRouter API Reference | Complete API Documentation
canonical-url: 'https://openrouter.ai/docs/api-reference/overview'
'og:site_name': OpenRouter Documentation
'og:title': OpenRouter API Reference - Complete Documentation
'og:description': >-
  Comprehensive guide to OpenRouter's API. Learn about request/response schemas,
  authentication, parameters, and integration with multiple AI model providers.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=OpenRouter%20API%20Reference&description=Comprehensive%20guide%20to%20OpenRouter's%20API.
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

OpenRouter's request and response schemas are very similar to the OpenAI Chat API, with a few small differences. At a high level, **OpenRouter normalizes the schema across models and providers** so you only need to learn one.

## Requests

### Completions Request Format

Here is the request schema as a TypeScript type. This will be the body of your `POST` request to the `/api/v1/chat/completions` endpoint (see the [quick start](/docs/quick-start) above for an example).

For a complete list of parameters, see the [Parameters](/docs/api-reference/parameters).

<CodeGroup>

```typescript title="Request Schema"
// Definitions of subtypes are below
type Request = {
  // Either "messages" or "prompt" is required
  messages?: Message[];
  prompt?: string;

  // If "model" is unspecified, uses the user's default
  model?: string; // See "Supported Models" section

  // Allows to force the model to produce specific output format.
  // See models page and note on this docs page for which models support it.
  response_format?: { type: 'json_object' };

  stop?: string | string[];
  stream?: boolean; // Enable streaming

  // See LLM Parameters (openrouter.ai/docs/api-reference/parameters)
  max_tokens?: number; // Range: [1, context_length)
  temperature?: number; // Range: [0, 2]

  // Tool calling
  // Will be passed down as-is for providers implementing OpenAI's interface.
  // For providers with custom interfaces, we transform and map the properties.
  // Otherwise, we transform the tools into a YAML template. The model responds with an assistant message.
  // See models supporting tool calling: openrouter.ai/models?supported_parameters=tools
  tools?: Tool[];
  tool_choice?: ToolChoice;

  // Advanced optional parameters
  seed?: number; // Integer only
  top_p?: number; // Range: (0, 1]
  top_k?: number; // Range: [1, Infinity) Not available for OpenAI models
  frequency_penalty?: number; // Range: [-2, 2]
  presence_penalty?: number; // Range: [-2, 2]
  repetition_penalty?: number; // Range: (0, 2]
  logit_bias?: { [key: number]: number };
  top_logprobs: number; // Integer only
  min_p?: number; // Range: [0, 1]
  top_a?: number; // Range: [0, 1]

  // Reduce latency by providing the model with a predicted output
  // https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
  prediction?: { type: 'content'; content: string };

  // OpenRouter-only parameters
  // See "Prompt Transforms" section: openrouter.ai/docs/transforms
  transforms?: string[];
  // See "Model Routing" section: openrouter.ai/docs/model-routing
  models?: string[];
  route?: 'fallback';
  // See "Provider Routing" section: openrouter.ai/docs/provider-routing
  provider?: ProviderPreferences;
};

// Subtypes:

type TextContent = {
  type: 'text';
  text: string;
};

type ImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string; // URL or base64 encoded image data
    detail?: string; // Optional, defaults to "auto"
  };
};

type ContentPart = TextContent | ImageContentPart;

type Message =
  | {
      role: 'user' | 'assistant' | 'system';
      // ContentParts are only for the "user" role:
      content: string | ContentPart[];
      // If "name" is included, it will be prepended like this
      // for non-OpenAI models: `{name}: {content}`
      name?: string;
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
      name?: string;
    };

type FunctionDescription = {
  description?: string;
  name: string;
  parameters: object; // JSON Schema object
};

type Tool = {
  type: 'function';
  function: FunctionDescription;
};

type ToolChoice =
  | 'none'
  | 'auto'
  | {
      type: 'function';
      function: {
        name: string;
      };
    };
```

</CodeGroup>

The `response_format` parameter ensures you receive a structured response from the LLM. The parameter is only supported by OpenAI models, Nitro models, and some others - check the providers on the model page on openrouter.ai/models to see if it's supported, and set `require_parameters` to true in your Provider Preferences. See [Provider Routing](/docs/features/provider-routing)

### Headers

OpenRouter allows you to specify some optional headers to identify your app and make it discoverable to users on our site.

- `HTTP-Referer`: Identifies your app on openrouter.ai
- `X-Title`: Sets/modifies your app's title

<CodeGroup>

```typescript title="TypeScript"
fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  }),
});
```

</CodeGroup>

<Info title='Model routing'>
  If the `model` parameter is omitted, the user or payer's default is used.
  Otherwise, remember to select a value for `model` from the [supported
  models](/models) or [API](/api/v1/models), and include the organization
  prefix. OpenRouter will select the least expensive and best GPUs available to
  serve the request, and fall back to other providers or GPUs if it receives a
  5xx response code or if you are rate-limited.
</Info>

<Info title='Streaming'>
  [Server-Sent Events
  (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format)
  are supported as well, to enable streaming _for all models_. Simply send
  `stream: true` in your request body. The SSE stream will occasionally contain
  a "comment" payload, which you should ignore (noted below).
</Info>

<Info title='Non-standard parameters'>
  If the chosen model doesn't support a request parameter (such as `logit_bias`
  in non-OpenAI models, or `top_k` for OpenAI), then the parameter is ignored.
  The rest are forwarded to the underlying model API.
</Info>

### Assistant Prefill

OpenRouter supports asking models to complete a partial response. This can be useful for guiding models to respond in a certain way.

To use this features, simply include a message with `role: "assistant"` at the end of your `messages` array.

<CodeGroup>

```typescript title="TypeScript"
fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      { role: 'user', content: 'What is the meaning of life?' },
      { role: 'assistant', content: "I'm not sure, but my best guess is" },
    ],
  }),
});
```

</CodeGroup>

## Responses

### CompletionsResponse Format

OpenRouter normalizes the schema across models and providers to comply with the [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat).

This means that `choices` is always an array, even if the model only returns one completion. Each choice will contain a `delta` property if a stream was requested and a `message` property otherwise. This makes it easier to use the same code for all models.

Here's the response schema as a TypeScript type:

```typescript TypeScript
// Definitions of subtypes are below
type Response = {
  id: string;
  // Depending on whether you set "stream" to "true" and
  // whether you passed in "messages" or a "prompt", you
  // will get a different output shape
  choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[];
  created: number; // Unix timestamp
  model: string;
  object: 'chat.completion' | 'chat.completion.chunk';

  system_fingerprint?: string; // Only present if the provider supports it

  // Usage data is always returned for non-streaming.
  // When streaming, you will get one usage object at
  // the end accompanied by an empty choices array.
  usage?: ResponseUsage;
};
```

```typescript
// If the provider returns usage, we pass it down
// as-is. Otherwise, we count using the GPT-4 tokenizer.

type ResponseUsage = {
  /** Including images and tools if any */
  prompt_tokens: number;
  /** The tokens generated */
  completion_tokens: number;
  /** Sum of the above two fields */
  total_tokens: number;
};
```

```typescript
// Subtypes:
type NonChatChoice = {
  finish_reason: string | null;
  text: string;
  error?: ErrorResponse;
};

type NonStreamingChoice = {
  finish_reason: string | null;
  native_finish_reason: string | null;
  message: {
    content: string | null;
    role: string;
    tool_calls?: ToolCall[];
  };
  error?: ErrorResponse;
};

type StreamingChoice = {
  finish_reason: string | null;
  native_finish_reason: string | null;
  delta: {
    content: string | null;
    role?: string;
    tool_calls?: ToolCall[];
  };
  error?: ErrorResponse;
};

type ErrorResponse = {
  code: number; // See "Error Handling" section
  message: string;
  metadata?: Record<string, unknown>; // Contains additional error information such as provider details, the raw error message, etc.
};

type ToolCall = {
  id: string;
  type: 'function';
  function: FunctionCall;
};
```

Here's an example:

```json
{
  "id": "gen-xxxxxxxxxxxxxx",
  "choices": [
    {
      "finish_reason": "stop", // Normalized finish_reason
      "native_finish_reason": "stop", // The raw finish_reason from the provider
      "message": {
        // will be "delta" if streaming
        "role": "assistant",
        "content": "Hello there!"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 4,
    "total_tokens": 4
  },
  "model": "openai/gpt-3.5-turbo" // Could also be "anthropic/claude-2.1", etc, depending on the "model" that ends up being used
}
```

### Finish Reason

OpenRouter normalizes each model's `finish_reason` to one of the following values: `tool_calls`, `stop`, `length`, `content_filter`, `error`.

Some models and providers may have additional finish reasons. The raw finish_reason string returned by the model is available via the `native_finish_reason` property.

### Querying Cost and Stats

The token counts that are returned in the completions API response are **not** counted via the model's native tokenizer. Instead it uses a normalized, model-agnostic count (accomplished via the GPT4o tokenizer). This is because some providers do not reliably return native token counts. This behavior is becoming more rare, however, and we may add native token counts to the response object in the future.

Credit usage and model pricing are based on the **native** token counts (not the 'normalized' token counts returned in the API response).

For precise token accounting using the model's native tokenizer, you can retrieve the full generation information via the `/api/v1/generation` endpoint.

You can use the returned `id` to query for the generation stats (including token counts and cost) after the request is complete. This is how you can get the cost and tokens for _all models and requests_, streaming and non-streaming.

<CodeGroup>

```typescript title="Query Generation Stats"
const generation = await fetch(
  'https://openrouter.ai/api/v1/generation?id=$GENERATION_ID',
  { headers },
);

const stats = await generation.json();
```

</CodeGroup>

Please see the [Generation](/docs/api-reference/get-a-generation) API reference for the full response shape.

Note that token counts are also available in the `usage` field of the response body for non-streaming completions.

---
title: Limits
subtitle: Rate Limits
headline: API Rate Limits | Configure Usage Limits in OpenRouter
canonical-url: 'https://openrouter.ai/docs/api-reference/limits'
'og:site_name': OpenRouter Documentation
'og:title': API Rate Limits - Manage Model Usage and Quotas
'og:description': >-
  Learn about OpenRouter's API rate limits, credit-based quotas, and DDoS
  protection. Configure and monitor your model usage limits effectively.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=API%20Rate%20Limits&description=Manage%20Model%20Usage%20and%20Quotas
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import {
  API_KEY_REF,
  FREE_MODEL_CREDITS_THRESHOLD,
  FREE_MODEL_HAS_CREDITS_RPD,
  FREE_MODEL_NO_CREDITS_RPD,
  FREE_MODEL_RATE_LIMIT_RPM,
  HTTPStatus,
  sep,
  Variant,
} from '../../../imports/constants';

<Tip>
  Making additional accounts or API keys will not affect your rate limits, as we govern capacity globally.
  We do however have different rate limits for different models, so you can share the load that way if you do run into issues.
+  If you have a consistent need for high rate limits (>2000 RPM) -- [email us](mailto:support@openrouter.ai).
</Tip>

## Rate Limits and Credits Remaining

To check the rate limit or credits left on an API key, make a GET request to `https://openrouter.ai/api/v1/auth/key`.

<Template data={{ API_KEY_REF }}>
<CodeGroup>

```typescript title="TypeScript"
const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
  method: 'GET',
  headers: {
    Authorization: 'Bearer {{API_KEY_REF}}',
  },
});
```

```python title="Python"
import requests
import json

response = requests.get(
  url="https://openrouter.ai/api/v1/auth/key",
  headers={
    "Authorization": f"Bearer {{API_KEY_REF}}"
  }
)

print(json.dumps(response.json(), indent=2))
```

</CodeGroup>
</Template>

If you submit a valid API key, you should get a response of the form:

```typescript title="TypeScript"
type Key = {
  data: {
    label: string;
    usage: number; // Number of credits used
    limit: number | null; // Credit limit for the key, or null if unlimited
    is_free_tier: boolean; // Whether the user has paid for credits before
    rate_limit: {
      requests: number; // Number of requests allowed...
      interval: string; // in this interval, e.g. "10s"
    };
  };
};
```

There are a few rate limits that apply to certain types of requests, regardless of account status:

1. Free usage limits: If you're using a free model variant (with an ID ending in <code>{sep}{Variant.Free}</code>), you can make up to {FREE_MODEL_RATE_LIMIT_RPM} requests per minute. The following per-day limits apply:

- If you have purchased less than {FREE_MODEL_CREDITS_THRESHOLD} credits, you're limited to {FREE_MODEL_NO_CREDITS_RPD} <code>{sep}{Variant.Free}</code> model requests per day.

- If you purchase at least {FREE_MODEL_CREDITS_THRESHOLD} credits, your daily limit is increased to {FREE_MODEL_HAS_CREDITS_RPD} <code>{sep}{Variant.Free}</code> model requests per day.

2. **DDoS protection**: Cloudflare's DDoS protection will block requests that dramatically exceed reasonable usage.

If your account has a negative credit balance, you may see <code>{HTTPStatus.S402_Payment_Required}</code> errors, including for free models. Adding credits to put your balance above zero allows you to use those models again.

---
title: Authentication
subtitle: API Authentication
headline: API Authentication | OpenRouter OAuth and API Keys
canonical-url: 'https://openrouter.ai/docs/api-reference/authentication'
'og:site_name': OpenRouter Documentation
'og:title': API Authentication - Secure Access to OpenRouter
'og:description': >-
  Learn how to authenticate with OpenRouter using API keys and Bearer tokens.
  Complete guide to secure authentication methods and best practices.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=API%20Authentication&description=Secure%20access%20to%20OpenRouter
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

You can cover model costs with OpenRouter API keys.

Our API authenticates requests using Bearer tokens. This allows you to use `curl` or the [OpenAI SDK](https://platform.openai.com/docs/frameworks) directly with OpenRouter.

<Warning>
API keys on OpenRouter are more powerful than keys used directly for model APIs.

They allow users to set credit limits for apps, and they can be used in [OAuth](/docs/use-cases/oauth-pkce) flows.

</Warning>

## Using an API key

To use an API key, [first create your key](https://openrouter.ai/keys). Give it a name and you can optionally set a credit limit.

If you're calling the OpenRouter API directly, set the `Authorization` header to a Bearer token with your API key.

If you're using the OpenAI Typescript SDK, set the `api_base` to `https://openrouter.ai/api/v1` and the `apiKey` to your API key.

<CodeGroup>

```typescript title="TypeScript (Bearer Token)"
fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  }),
});
```

```typescript title="TypeScript (OpenAI SDK)"
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
  },
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'Say this is a test' }],
  });

  console.log(completion.choices[0].message);
}

main();
```

```python title="Python"
import openai

openai.api_base = "https://openrouter.ai/api/v1"
openai.api_key = "<OPENROUTER_API_KEY>"

response = openai.ChatCompletion.create(
  model="openai/gpt-4o",
  messages=[...],
  headers={
    "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
  },
)

reply = response.choices[0].message
```

```shell title="Shell"
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
  "model": "openai/gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ]
}'
```

</CodeGroup>

To stream with Python, [see this example from OpenAI](https://github.com/openai/openai-cookbook/blob/main/examples/How_to_stream_completions.ipynb).

## If your key has been exposed

<Warning>
  You must protect your API keys and never commit them to public repositories.
</Warning>

OpenRouter is a GitHub secret scanning partner, and has other methods to detect exposed keys. If we determine that your key has been compromised, you will receive an email notification.

If you receive such a notification or suspect your key has been exposed, immediately visit [your key settings page](https://openrouter.ai/settings/keys) to delete the compromised key and create a new one.

Using environment variables and keeping keys out of your codebase is strongly recommended.

---
title: Parameters
headline: API Parameters | Configure OpenRouter API Requests
canonical-url: 'https://openrouter.ai/docs/api-reference/parameters'
'og:site_name': OpenRouter Documentation
'og:title': API Parameters - Complete Guide to Request Configuration
'og:description': >-
  Learn about all available parameters for OpenRouter API requests. Configure
  temperature, max tokens, top_p, and other model-specific settings.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=API%20Parameters&description=Complete%20guide%20to%20request%20configuration
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

Sampling parameters shape the token generation process of the model. You may send any parameters from the following list, as well as others, to OpenRouter.

OpenRouter will default to the values listed below if certain parameters are absent from your request (for example, `temperature` to 1.0). We will also transmit some provider-specific parameters, such as `safe_prompt` for Mistral or `raw_mode` for Hyperbolic directly to the respective providers if specified.

Please refer to the model’s provider section to confirm which parameters are supported. For detailed guidance on managing provider-specific parameters, [click here](/docs/features/provider-routing#requiring-providers-to-support-all-parameters-beta).

## Temperature

- Key: `temperature`

- Optional, **float**, 0.0 to 2.0

- Default: 1.0

- Explainer Video: [Watch](https://youtu.be/ezgqHnWvua8)

This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input.

## Top P

- Key: `top_p`

- Optional, **float**, 0.0 to 1.0

- Default: 1.0

- Explainer Video: [Watch](https://youtu.be/wQP-im_HInk)

This setting limits the model's choices to a percentage of likely tokens: only the top tokens whose probabilities add up to P. A lower value makes the model's responses more predictable, while the default setting allows for a full range of token choices. Think of it like a dynamic Top-K.

## Top K

- Key: `top_k`

- Optional, **integer**, 0 or above

- Default: 0

- Explainer Video: [Watch](https://youtu.be/EbZv6-N8Xlk)

This limits the model's choice of tokens at each step, making it choose from a smaller set. A value of 1 means the model will always pick the most likely next token, leading to predictable results. By default this setting is disabled, making the model to consider all choices.

## Frequency Penalty

- Key: `frequency_penalty`

- Optional, **float**, -2.0 to 2.0

- Default: 0.0

- Explainer Video: [Watch](https://youtu.be/p4gl6fqI0_w)

This setting aims to control the repetition of tokens based on how often they appear in the input. It tries to use less frequently those tokens that appear more in the input, proportional to how frequently they occur. Token penalty scales with the number of occurrences. Negative values will encourage token reuse.

## Presence Penalty

- Key: `presence_penalty`

- Optional, **float**, -2.0 to 2.0

- Default: 0.0

- Explainer Video: [Watch](https://youtu.be/MwHG5HL-P74)

Adjusts how often the model repeats specific tokens already used in the input. Higher values make such repetition less likely, while negative values do the opposite. Token penalty does not scale with the number of occurrences. Negative values will encourage token reuse.

## Repetition Penalty

- Key: `repetition_penalty`

- Optional, **float**, 0.0 to 2.0

- Default: 1.0

- Explainer Video: [Watch](https://youtu.be/LHjGAnLm3DM)

Helps to reduce the repetition of tokens from the input. A higher value makes the model less likely to repeat tokens, but too high a value can make the output less coherent (often with run-on sentences that lack small words). Token penalty scales based on original token's probability.

## Min P

- Key: `min_p`

- Optional, **float**, 0.0 to 1.0

- Default: 0.0

Represents the minimum probability for a token to be
  considered, relative to the probability of the most likely token. (The value changes depending on the confidence level of the most probable token.) If your Min-P is set to 0.1, that means it will only allow for tokens that are at least 1/10th as probable as the best possible option.

## Top A

- Key: `top_a`

- Optional, **float**, 0.0 to 1.0

- Default: 0.0

Consider only the top tokens with "sufficiently high" probabilities based on the probability of the most likely token. Think of it like a dynamic Top-P. A lower Top-A value focuses the choices based on the highest probability token but with a narrower scope. A higher Top-A value does not necessarily affect the creativity of the output, but rather refines the filtering process based on the maximum probability.

## Seed

- Key: `seed`

- Optional, **integer**

If specified, the inferencing will sample deterministically, such that repeated requests with the same seed and parameters should return the same result. Determinism is not guaranteed for some models.

## Max Tokens

- Key: `max_tokens`

- Optional, **integer**, 1 or above

This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length.

## Logit Bias

- Key: `logit_bias`

- Optional, **map**

Accepts a JSON object that maps tokens (specified by their token ID in the tokenizer) to an associated bias value from -100 to 100. Mathematically, the bias is added to the logits generated by the model prior to sampling. The exact effect will vary per model, but values between -1 and 1 should decrease or increase likelihood of selection; values like -100 or 100 should result in a ban or exclusive selection of the relevant token.

## Logprobs

- Key: `logprobs`

- Optional, **boolean**

Whether to return log probabilities of the output tokens or not. If true, returns the log probabilities of each output token returned.

## Top Logprobs

- Key: `top_logprobs`

- Optional, **integer**

An integer between 0 and 20 specifying the number of most likely tokens to return at each token position, each with an associated log probability. logprobs must be set to true if this parameter is used.

## Response Format

- Key: `response_format`

- Optional, **map**

Forces the model to produce specific output format. Setting to `{ "type": "json_object" }` enables JSON mode, which guarantees the message the model generates is valid JSON.

  **Note**: when using JSON mode, you should also instruct the model to produce JSON yourself via a system or user message.

## Structured Outputs

- Key: `structured_outputs`

- Optional, **boolean**

If the model can return structured outputs using response_format json_schema.

## Stop

- Key: `stop`

- Optional, **array**

Stop generation immediately if the model encounter any token specified in the stop array.

## Tools

- Key: `tools`

- Optional, **array**

Tool calling parameter, following OpenAI's tool calling request shape. For non-OpenAI providers, it will be transformed accordingly. [Click here to learn more about tool calling](/docs/requests#tool-calls)

## Tool Choice

- Key: `tool_choice`

- Optional, **array**

Controls which (if any) tool is called by the model. 'none' means the model will not call any tool and instead generates a message. 'auto' means the model can pick between generating a message or calling one or more tools. 'required' means the model must call one or more tools. Specifying a particular tool via `{"type": "function", "function": {"name": "my_function"}}` forces the model to call that tool.

---
title: Quickstart
subtitle: Get started with OpenRouter
slug: quickstart
headline: OpenRouter Quickstart Guide | Developer Documentation
canonical-url: 'https://openrouter.ai/docs/quickstart'
'og:site_name': OpenRouter Documentation
'og:title': OpenRouter Quickstart Guide
'og:description': >-
  Get started with OpenRouter's unified API for hundreds of AI models. Learn how
  to integrate using OpenAI SDK, direct API calls, or third-party frameworks.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=quickstart&title=Quick%20Start&description=Start%20using%20OpenRouter%20API%20in%20minutes%20with%20any%20SDK
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

OpenRouter provides a unified API that gives you access to hundreds of AI models through a single endpoint, while automatically handling fallbacks and selecting the most cost-effective options. Get started with just a few lines of code using your preferred SDK or framework.

<Tip>
  Looking for information about free models and rate limits? Please see the [FAQ](/docs/faq#how-are-rate-limits-calculated)
</Tip>

In the examples below, the OpenRouter-specific headers are optional. Setting them allows your app to appear on the OpenRouter leaderboards.

## Using the OpenAI SDK

<CodeGroup>

```python title="Python"
from openai import OpenAI

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key="<OPENROUTER_API_KEY>",
)

completion = client.chat.completions.create(
  extra_headers={
    "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
  },
  model="openai/gpt-4o",
  messages=[
    {
      "role": "user",
      "content": "What is the meaning of life?"
    }
  ]
)

print(completion.choices[0].message.content)
```

```typescript title="TypeScript"
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '<OPENROUTER_API_KEY>',
  defaultHeaders: {
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
  },
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });

  console.log(completion.choices[0].message);
}

main();
```

</CodeGroup>

## Using the OpenRouter API directly

<Tip>
  You can use the interactive [Request Builder](/request-builder) to generate OpenRouter API requests in the language of your choice.
</Tip>

<CodeGroup>

```python title="Python"
import requests
import json

response = requests.post(
  url="https://openrouter.ai/api/v1/chat/completions",
  headers={
    "Authorization": "Bearer <OPENROUTER_API_KEY>",
    "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
  },
  data=json.dumps({
    "model": "openai/gpt-4o", # Optional
    "messages": [
      {
        "role": "user",
        "content": "What is the meaning of life?"
      }
    ]
  })
)
```

```typescript title="TypeScript"
fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <OPENROUTER_API_KEY>',
    'HTTP-Referer': '<YOUR_SITE_URL>', // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': '<YOUR_SITE_NAME>', // Optional. Site title for rankings on openrouter.ai.
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  }),
});
```

```shell title="Shell"
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -d '{
  "model": "openai/gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "What is the meaning of life?"
    }
  ]
}'
```

</CodeGroup>

The API also supports [streaming](/docs/api-reference/streaming).

## Using third-party SDKs

For information about using third-party SDKs and frameworks with OpenRouter, please [see our frameworks documentation.](/docs/community/frameworks)

---
title: Models
subtitle: One API for hundreds of models
headline: OpenRouter Models | Access 300+ AI Models Through One API
canonical-url: 'https://openrouter.ai/docs/models'
'og:site_name': OpenRouter Documentation
'og:title': OpenRouter Models - Unified Access to 300+ AI Models
'og:description': >-
  Access over 300 AI models through OpenRouter's unified API. Browse available
  models, compare capabilities, and integrate with your preferred provider.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=models&title=AI%20Model%20Hub&description=Access%20300%2B%20AI%20models%20through%20one%20unified%20API%20endpoint
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

OpenRouter strives to provide access to every potentially useful text-based AI model. We currently support over 300 models endpoints.

If there are models or providers you are interested in that OpenRouter doesn't have, please tell us about them in our [Discord channel](https://discord.gg/fVyRaUDgxW).

<Note title='Different models tokenize text in different ways'>
  Some models break up text into chunks of multiple characters (GPT, Claude,
  Llama, etc), while others tokenize by character (PaLM). This means that token
  counts (and therefore costs) will vary between models, even when inputs and
  outputs are the same. Costs are displayed and billed according to the
  tokenizer for the model in use. You can use the `usage` field in the response
  to get the token counts for the input and output.
</Note>

Explore and browse 300+ models and providers [on our website](https://openrouter.ai/models), or [with our API](/docs/api-reference/list-available-models).

## For Providers

If you're interested in working with OpenRouter, you can learn more on our [providers page](/docs/use-cases/for-providers).


---
title: 'Privacy, Logging, and Data Collection'
subtitle: Making sure your data is safe
headline: 'Privacy, Logging, and Data Collection | Keeping your data safe'
canonical-url: 'https://openrouter.ai/docs/features/privacy-and-logging'
'og:site_name': OpenRouter Documentation
'og:title': 'Privacy, Logging, and Data Collection | Keeping your data safe'
'og:description': >-
  Learn how OpenRouter & its providers handle your data, including logging and
  data collection.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=features/privacy-and-logging&title=Privacy,%20Logging,%20and%20Data%20Collection&description=Learn%20how%20OpenRouter%20handles%20your%20data,%20including%20logging%20and%20data%20collection.
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import { ProviderDataRetentionTable } from '../../../imports/ProviderDataRetentionTable';

When using AI through OpenRouter, whether via the chat interface or the API, your prompts and responses go through multiple touchpoints. You have control over how your data is handled at each step.

This page is designed to give a practical overview of how your data is handled, stored, and used. More information is available in the [privacy policy](/privacy) and [terms of service](/terms).

## Within OpenRouter

OpenRouter does not store your prompts or responses, _unless_ you have explicitly opted in to prompt logging in your account settings. It's as simple as that.

OpenRouter samples a small number of prompts for categorization to power our reporting and model ranking. If you are not opted in to prompt logging, any categorization of your prompts is stored completely anonymously and never associated with your account or user ID. The categorization is done by model with a zero-data-retention policy.

OpenRouter does store metadata (e.g. number of prompt and completion tokens, latency, etc) for each request. This is used to power our reporting and model ranking, and your [activity feed](/activity).

## Provider Policies

### Training on Prompts

Each provider on OpenRouter has its own data handling policies. We reflect those policies in structured data on each AI endpoint that we offer.

On your account settings page, you can set whether you would like to allow routing to providers that may train on your data (according to their own policies). There are separate settings for paid and free models.

Wherever possible, OpenRouter works with providers to ensure that prompts will not be trained on, but there are exceptions. If you opt out of training in your account settings, OpenRouter will not route to providers that train. This setting has no bearing on OpenRouter's own policies and what we do with your prompts.

<Tip title='Data Policy Filtering'>
  You can [restrict individual requests](/docs/features/provider-routing#requiring-providers-to-comply-with-data-policies)
  to only use providers with a certain data policy.

  This is also available as an account-wide setting in [your privacy settings](https://openrouter.ai/settings/privacy).
</Tip>

### Data Retention & Logging

Providers also have their own data retention policies, often for compliance reasons. OpenRouter does not have routing rules that change based on data retention policies of providers, but the retention policies as reflected in each provider's terms are shown below. Any user of OpenRouter can ignore providers that don't meet their own data retention requirements.

The full terms of service for each provider are linked from the provider's page, and aggregated in the [documentation](/docs/features/provider-routing#terms-of-service).

<ProviderDataRetentionTable />


---
title: Model Routing
subtitle: Dynamically route requests to models
headline: Model Routing | Dynamic AI Model Selection and Fallback
canonical-url: 'https://openrouter.ai/docs/features/model-routing'
'og:site_name': OpenRouter Documentation
'og:title': Model Routing - Smart Model Selection and Fallback
'og:description': >-
  Route requests dynamically between AI models. Learn how to use OpenRouter's
  Auto Router and model fallback features for optimal performance and
  reliability.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=Model%20Routing&description=Dynamic%20AI%20model%20selection%20and%20fallbacks
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import { API_KEY_REF } from '../../../imports/constants';

OpenRouter provides two options for model routing.

## Auto Router

The [Auto Router](https://openrouter.ai/openrouter/auto), a special model ID that you can use to choose between selected high-quality models based on your prompt, powered by [NotDiamond](https://www.notdiamond.ai/).

```json
{
  "model": "openrouter/auto",
  ... // Other params
}
```

The resulting generation will have `model` set to the model that was used.

## The `models` parameter

The `models` parameter lets you automatically try other models if the primary model's providers are down, rate-limited, or refuse to reply due to content moderation.

```json
{
  "models": ["anthropic/claude-3.5-sonnet", "gryphe/mythomax-l2-13b"],
  ... // Other params
}
```

If the model you selected returns an error, OpenRouter will try to use the fallback model instead. If the fallback model is down or returns an error, OpenRouter will return that error.

By default, any error can trigger the use of a fallback model, including context length validation errors, moderation flags for filtered models, rate-limiting, and downtime.

Requests are priced using the model that was ultimately used, which will be returned in the `model` attribute of the response body.

## Using with OpenAI SDK

To use the `models` array with the OpenAI SDK, include it in the `extra_body` parameter. In the example below, gpt-4o will be tried first, and the `models` array will be tried in order as fallbacks.

<Template data={{
  API_KEY_REF,
}}>
<CodeGroup>

```typescript
import OpenAI from 'openai';

const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  // API key and headers
});

async function main() {
  // @ts-expect-error
  const completion = await openrouterClient.chat.completions.create({
    model: 'openai/gpt-4o',
    models: ['anthropic/claude-3.5-sonnet', 'gryphe/mythomax-l2-13b'],
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  });
  console.log(completion.choices[0].message);
}

main();
```

```python
from openai import OpenAI

openai_client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key={{API_KEY_REF}},
)

completion = openai_client.chat.completions.create(
    model="openai/gpt-4o",
    extra_body={
        "models": ["anthropic/claude-3.5-sonnet", "gryphe/mythomax-l2-13b"],
    },
    messages=[
        {
            "role": "user",
            "content": "What is the meaning of life?"
        }
    ]
)

print(completion.choices[0].message.content)
```

</CodeGroup>
</Template>


---
title: Provider Routing
subtitle: Route requests to the best provider
headline: Provider Routing | Intelligent Multi-Provider Request Routing
canonical-url: 'https://openrouter.ai/docs/features/provider-routing'
'og:site_name': OpenRouter Documentation
'og:title': Provider Routing - Smart Multi-Provider Request Management
'og:description': >-
  Route AI model requests across multiple providers intelligently. Learn how to
  optimize for cost, performance, and reliability with OpenRouter's provider
  routing.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=features/provider-routing&title=Smart%20Routing&description=Optimize%20AI%20requests%20across%20providers%20for%20best%20performance
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---
import { ProviderPreferencesSchema } from '../../../imports/constants';
import { TSFetchCodeBlock } from '../../../imports/TSFetchCodeBlock';
import { ZodToJSONSchemaBlock } from '../../../imports/ZodToJSONSchemaBlock';

OpenRouter routes requests to the best available providers for your model. By default, [requests are load balanced](#load-balancing-default-strategy) across the top providers to maximize uptime.

You can customize how your requests are routed using the `provider` object in the request body for [Chat Completions](/docs/api-reference/chat-completion) and [Completions](/docs/api-reference/completion).

<Tip>
  For a complete list of valid provider names to use in the API, see the [full
  provider schema](#json-schema-for-provider-preferences).
</Tip>

The `provider` object can contain the following fields:

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `order` | string[] | - | List of provider slugs to try in order (e.g. `["anthropic", "openai"]`). [Learn more](#ordering-specific-providers) |
| `allow_fallbacks` | boolean | `true` | Whether to allow backup providers when the primary is unavailable. [Learn more](#disabling-fallbacks) |
| `require_parameters` | boolean | `false` | Only use providers that support all parameters in your request. [Learn more](#requiring-providers-to-support-all-parameters-beta) |
| `data_collection` | "allow" \| "deny" | "allow" | Control whether to use providers that may store data. [Learn more](#requiring-providers-to-comply-with-data-policies) |
| `only` | string[] | - | List of provider slugs to allow for this request. [Learn more](#allowing-only-specific-providers) |
| `ignore` | string[] | - | List of provider slugs to skip for this request. [Learn more](#ignoring-providers) |
| `quantizations` | string[] | - | List of quantization levels to filter by (e.g. `["int4", "int8"]`). [Learn more](#quantization) |
| `sort` | string | - | Sort providers by price or throughput. (e.g. `"price"` or `"throughput"`). [Learn more](#provider-sorting) |
| `max_price` | object | - | The maximum pricing you want to pay for this request. [Learn more](#maximum-price) |

## Price-Based Load Balancing (Default Strategy)

For each model in your request, OpenRouter's default behavior is to load balance requests across providers, prioritizing price.

If you are more sensitive to throughput than price, you can use the `sort` field to explicitly prioritize throughput.

<Tip>
  When you send a request with `tools` or `tool_choice`, OpenRouter will only
  route to providers that support tool use. Similarly, if you set a
  `max_tokens`, then OpenRouter will only route to providers that support a
  response of that length.
</Tip>

Here is OpenRouter's default load balancing strategy:

1. Prioritize providers that have not seen significant outages in the last 30 seconds.
2. For the stable providers, look at the lowest-cost candidates and select one weighted by inverse square of the price (example below).
3. Use the remaining providers as fallbacks.

<Note title="A Load Balancing Example">
If Provider A costs \$1 per million tokens, Provider B costs \$2, and Provider C costs \$3, and Provider B recently saw a few outages.

- Your request is routed to Provider A. Provider A is 9x more likely to be first routed to Provider A than Provider C because $(1 / 3^2 = 1/9)$ (inverse square of the price).
- If Provider A fails, then Provider C will be tried next.
- If Provider C also fails, Provider B will be tried last.

</Note>

If you have `sort` or `order` set in your provider preferences, load balancing will be disabled.

## Provider Sorting

As described above, OpenRouter load balances based on price, while taking uptime into account.

If you instead want to _explicitly_ prioritize a particular provider attribute, you can include the `sort` field in the `provider` preferences. Load balancing will be disabled, and the router will try providers in order.

The three sort options are:

- `"price"`: prioritize lowest price
- `"throughput"`: prioritize highest throughput
- `"latency"`: prioritize lowest latency

<TSFetchCodeBlock
  title='Example with Fallbacks Enabled'
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'meta-llama/llama-3.1-70b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      sort: 'throughput',
    },
  }}
/>

To _always_ prioritize low prices, and not apply any load balancing, set `sort` to `"price"`.

To _always_ prioritize low latency, and not apply any load balancing, set `sort` to `"latency"`.

## Nitro Shortcut

You can append `:nitro` to any model slug as a shortcut to sort by throughput. This is exactly equivalent to setting `provider.sort` to `"throughput"`.

<TSFetchCodeBlock
  title='Example using Nitro shortcut'
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'meta-llama/llama-3.1-70b-instruct:nitro',
    messages: [{ role: 'user', content: 'Hello' }],
  }}
/>

## Floor Price Shortcut

You can append `:floor` to any model slug as a shortcut to sort by price. This is exactly equivalent to setting `provider.sort` to `"price"`.

<TSFetchCodeBlock
  title='Example using Floor shortcut'
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'meta-llama/llama-3.1-70b-instruct:floor',
    messages: [{ role: 'user', content: 'Hello' }],
  }}
/>

## Ordering Specific Providers

You can set the providers that OpenRouter will prioritize for your request using the `order` field.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `order` | string[] | - | List of provider slugs to try in order (e.g. `["anthropic", "openai"]`). |

The router will prioritize providers in this list, and in this order, for the model you're using. If you don't set this field, the router will [load balance](#load-balancing-default-strategy) across the top providers to maximize uptime.

<Tip>
  You can use the copy button next to provider names on model pages to get the exact provider slug, 
  including any variants like "/turbo". See [Targeting Specific Provider Endpoints](#targeting-specific-provider-endpoints) for details.
</Tip>

OpenRouter will try them one at a time and proceed to other providers if none are operational. If you don't want to allow any other providers, you should [disable fallbacks](#disabling-fallbacks) as well.

### Example: Specifying providers with fallbacks

This example skips over OpenAI (which doesn't host Mixtral), tries Together, and then falls back to the normal list of providers on OpenRouter:

<TSFetchCodeBlock
  title='Example with Fallbacks Enabled'
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'mistralai/mixtral-8x7b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      order: ['openai', 'together'],
    },
  }}
/>

### Example: Specifying providers with fallbacks disabled

Here's an example with `allow_fallbacks` set to `false` that skips over OpenAI (which doesn't host Mixtral), tries Together, and then fails if Together fails:

<TSFetchCodeBlock
  title='Example with Fallbacks Disabled'
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'mistralai/mixtral-8x7b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      order: ['openai', 'together'],
      allow_fallbacks: false,
    },
  }}
/>

## Targeting Specific Provider Endpoints

Each provider on OpenRouter may host multiple endpoints for the same model, such as a default endpoint and a specialized "turbo" endpoint. To target a specific endpoint, you can use the copy button next to the provider name on the model detail page to obtain the exact provider slug.

For example, DeepInfra offers DeepSeek R1 through multiple endpoints:
- Default endpoint with slug `deepinfra`
- Turbo endpoint with slug `deepinfra/turbo`

By copying the exact provider slug and using it in your request's `order` array, you can ensure your request is routed to the specific endpoint you want:

<TSFetchCodeBlock
  title='Example targeting DeepInfra Turbo endpoint'
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'deepseek/deepseek-r1',
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      order: ['deepinfra/turbo'],
      allow_fallbacks: false,
    },
  }}
/>

This approach is especially useful when you want to consistently use a specific variant of a model from a particular provider.

## Requiring Providers to Support All Parameters

You can restrict requests only to providers that support all parameters in your request using the `require_parameters` field.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `require_parameters` | boolean | `false` | Only use providers that support all parameters in your request. |

With the default routing strategy, providers that don't support all the [LLM parameters](/docs/api-reference/parameters) specified in your request can still receive the request, but will ignore unknown parameters. When you set `require_parameters` to `true`, the request won't even be routed to that provider.

### Example: Excluding providers that don't support JSON formatting

For example, to only use providers that support JSON formatting:

<TSFetchCodeBlock
  uriPath='/api/v1/chat/completions'
  body={{
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      require_parameters: true,
    },
    response_format: { type: 'json_object' },
  }}
/>

## Requiring Providers to Comply with Data Policies

You can restrict requests only to providers that comply with your data policies using the `data_collection` field.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `data_collection` | "allow" \| "deny" | "allow" | Control whether to use providers that may store data. |

- `allow`: (default) allow providers which store user data non-transiently and may train on it
- `deny`: use only providers which do not collect user data

Some model providers may log prompts, so we display them with a **Data Policy** tag on model pages. This is not a definitive source of third party data policies, but represents our best knowledge.

<Tip title='Account-Wide Data Policy Filtering'>
  This is also available as an account-wide setting in [your privacy
  settings](https://openrouter.ai/settings/privacy). You can disable third party
  model providers that store inputs for training.
</Tip>

### Example: Excluding providers that don't comply with data policies

To exclude providers that don't comply with your data policies, set `data_collection` to `deny`:

<TSFetchCodeBlock
  uriPath='/api/v1/chat/completions'
  body={{
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      data_collection: 'deny', // or "allow"
    },
  }}
/>

## Disabling Fallbacks

To guarantee that your request is only served by the top (lowest-cost) provider, you can disable fallbacks.

This is combined with the `order` field from [Ordering Specific Providers](#ordering-specific-providers) to restrict the providers that OpenRouter will prioritize to just your chosen list.

<TSFetchCodeBlock
  uriPath='/api/v1/chat/completions'
  body={{
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      allow_fallbacks: false,
    },
  }}
/>

## Allowing Only Specific Providers

You can allow only specific providers for a request by setting the `only` field in the `provider` object.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `only` | string[] | - | List of provider slugs to allow for this request. |

<Warning>
    Only allowing some providers may significantly reduce fallback options and
    limit request recovery.
</Warning>

<Tip title="Account-Wide Allowed Providers">
    You can allow providers for all account requests by configuring your [preferences](/settings/preferences). This configuration applies to all API requests and chatroom messages.

    Note that when you allow providers for a specific request, the list of allowed providers is merged with your account-wide allowed providers.

</Tip>


### Example: Allowing Azure for a request calling GPT-4 Omni

Here's an example that will only use Azure for a request calling GPT-4 Omni:

<TSFetchCodeBlock
    uriPath='/api/v1/chat/completions'
    body={{
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        provider: {
            only: ['azure'],
        },
    }}
/>

## Ignoring Providers

You can ignore providers for a request by setting the `ignore` field in the `provider` object.

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `ignore` | string[] | - | List of provider slugs to skip for this request. |

<Warning>
  Ignoring multiple providers may significantly reduce fallback options and
  limit request recovery.
</Warning>

<Tip title="Account-Wide Ignored Providers">
You can ignore providers for all account requests by configuring your [preferences](/settings/preferences). This configuration applies to all API requests and chatroom messages.

Note that when you ignore providers for a specific request, the list of ignored providers is merged with your account-wide ignored providers.

</Tip>

### Example: Ignoring DeepInfra for a request calling Llama 3.3 70b

Here's an example that will ignore DeepInfra for a request calling Llama 3.3 70b:

<TSFetchCodeBlock
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'meta-llama/llama-3.3-70b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      ignore: ['deepinfra'],
    },
  }}
/>

## Quantization

Quantization reduces model size and computational requirements while aiming to preserve performance. Most LLMs today use FP16 or BF16 for training and inference, cutting memory requirements in half compared to FP32. Some optimizations use FP8 or quantization to reduce size further (e.g., INT8, INT4).

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `quantizations` | string[] | - | List of quantization levels to filter by (e.g. `["int4", "int8"]`). [Learn more](#quantization) |

<Warning>
  Quantized models may exhibit degraded performance for certain prompts,
  depending on the method used.
</Warning>

Providers can support various quantization levels for open-weight models.

### Quantization Levels

By default, requests are load-balanced across all available providers, ordered by price. To filter providers by quantization level, specify the `quantizations` field in the `provider` parameter with the following values:

- `int4`: Integer (4 bit)
- `int8`: Integer (8 bit)
- `fp4`: Floating point (4 bit)
- `fp6`: Floating point (6 bit)
- `fp8`: Floating point (8 bit)
- `fp16`: Floating point (16 bit)
- `bf16`: Brain floating point (16 bit)
- `fp32`: Floating point (32 bit)
- `unknown`: Unknown

### Example: Requesting FP8 Quantization

Here's an example that will only use providers that support FP8 quantization:

<TSFetchCodeBlock
  uriPath='/api/v1/chat/completions'
  body={{
    model: 'meta-llama/llama-3.1-8b-instruct',
    messages: [{ role: 'user', content: 'Hello' }],
    provider: {
      quantizations: ['fp8'],
    },
  }}
/>

### Max Price

To filter providers by price, specify the `max_price` field in the `provider` parameter with a JSON object specifying the highest provider pricing you will accept.

For example, the value `{"prompt": 1, "completion": 2}` will route to any provider with a price of `<= $1/m` prompt tokens, and `<= $2/m` completion tokens or less.

Some providers support per request pricing, in which case you can use the `request` attribute of max_price. Lastly, `image` is also available, which specifies the max price per image you will accept.

Practically, this field is often combined with a provider `sort` to express, for example, "Use the provider with the highest throughput, as long as it doesn\'t cost more than `$x/m` tokens."


## Terms of Service

You can view the terms of service for each provider below. You may not violate the terms of service or policies of third-party providers that power the models on OpenRouter.

- `AI21`: https://www.ai21.com/terms-of-service/
- `AionLabs`: https://www.aionlabs.ai/terms/
- `Alibaba`: https://www.alibabacloud.com/help/en/legal/latest/alibaba-cloud-international-website-product-terms-of-service-v-3-8-0
- `Amazon Bedrock`: https://aws.amazon.com/service-terms/
- `Anthropic`: https://www.anthropic.com/legal/commercial-terms
- `Atoma`: https://atoma.network/terms_of_service
- `Avian.io`: https://avian.io/terms
- `Azure`: https://www.microsoft.com/en-us/legal/terms-of-use?oneroute=true
- `Baseten`: https://www.baseten.co/terms
- `CentML`: https://centml.ai/terms-of-service/
- `Cerebras`: https://www.cerebras.ai/terms-of-service
- `Chutes`: https://chutes.ai/tos
- `Cloudflare`: https://www.cloudflare.com/service-specific-terms-developer-platform/#developer-platform-terms
- `Cohere`: https://cohere.com/terms-of-use
- `CrofAI`: https://ai.nahcrof.com/privacy
- `Crusoe`: https://legal.crusoe.ai/open-router#managed-inference-tos-open-router
- `DeepInfra`: https://deepinfra.com/terms
- `DeepSeek`: https://chat.deepseek.com/downloads/DeepSeek%20Terms%20of%20Use.html
- `Enfer`: https://enfer.ai/privacy-policy
- `Featherless`: https://featherless.ai/terms
- `Fireworks`: https://fireworks.ai/terms-of-service
- `Friendli`: https://friendli.ai/terms-of-service
- `GMICloud`: https://docs.gmicloud.ai/privacy
- `Google Vertex`: https://cloud.google.com/terms/
- `Google AI Studio`: https://cloud.google.com/terms/
- `Groq`: https://groq.com/terms-of-use/
- `Hyperbolic`: https://hyperbolic.xyz/terms
- `Inception`: https://www.inceptionlabs.ai/terms
- `inference.net`: https://inference.net/terms-of-service
- `Infermatic`: https://infermatic.ai/terms-and-conditions/
- `Inflection`: https://developers.inflection.ai/tos
- `InoCloud`: https://inocloud.com/terms
- `kluster.ai`: https://www.kluster.ai/terms-of-use
- `Lambda`: https://lambda.ai/legal/terms-of-service
- `Liquid`: https://www.liquid.ai/terms-conditions
- `Mancer (private)`: https://mancer.tech/terms
- `Meta`: https://llama.developer.meta.com/legal/terms-of-service
- `Minimax`: https://www.minimax.io/platform/protocol/terms-of-service
- `Mistral`: https://mistral.ai/terms/#terms-of-use
- `nCompass`: https://ncompass.tech/terms
- `Nebius AI Studio`: https://docs.nebius.com/legal/studio/terms-of-use/
- `NextBit`: https://www.nextbit256.com/docs/terms-of-service
- `Nineteen`: https://nineteen.ai/tos
- `NovitaAI`: https://novita.ai/legal/terms-of-service
- `OpenAI`: https://openai.com/policies/row-terms-of-use/
- `OpenInference`: https://www.openinference.xyz/terms
- `Parasail`: https://www.parasail.io/legal/terms
- `Perplexity`: https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service
- `Phala`: https://red-pill.ai/terms
- `SambaNova`: https://sambanova.ai/terms-and-conditions
- `Targon`: https://targon.com/terms
- `Together`: https://www.together.ai/terms-of-service
- `Ubicloud`: https://www.ubicloud.com/docs/about/terms-of-service
- `Venice`: https://venice.ai/legal/tos
- `xAI`: https://x.ai/legal/terms-of-service

## JSON Schema for Provider Preferences

For a complete list of options, see this JSON schema:

<ZodToJSONSchemaBlock
  title='Provider Preferences Schema'
  schema={ProviderPreferencesSchema}
/>



{
    "$ref": "#/definitions/Provider Preferences Schema",
    "definitions": {
      "Provider Preferences Schema": {
        "type": "object",
        "properties": {
          "allow_fallbacks": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "Whether to allow backup providers to serve requests\n- true: (default) when the primary provider (or your custom providers in \"order\") is unavailable, use the next best provider.\n- false: use only the primary/custom provider, and return the upstream error if it's unavailable.\n"
          },
          "require_parameters": {
            "type": [
              "boolean",
              "null"
            ],
            "description": "Whether to filter providers to only those that support the parameters you've provided. If this setting is omitted or set to false, then providers will receive only the parameters they support, and ignore the rest."
          },
          "data_collection": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "deny",
                  "allow"
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "Data collection setting. If no available model provider meets the requirement, your request will return an error.\n- allow: (default) allow providers which store user data non-transiently and may train on it\n- deny: use only providers which do not collect user data.\n"
          },
          "order": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "anyOf": [
                    {
                      "type": "string",
                      "enum": [
                        "AnyScale",
                        "HuggingFace",
                        "Hyperbolic 2",
                        "Lepton",
                        "Lynn 2",
                        "Lynn",
                        "Mancer",
                        "Modal",
                        "OctoAI",
                        "Recursal",
                        "Reflection",
                        "Replicate",
                        "SambaNova 2",
                        "SF Compute",
                        "Together 2",
                        "01.AI",
                        "AI21",
                        "AionLabs",
                        "Alibaba",
                        "Amazon Bedrock",
                        "Anthropic",
                        "Atoma",
                        "Avian",
                        "Azure",
                        "BaseTen",
                        "Cent-ML",
                        "Cerebras",
                        "Chutes",
                        "Cloudflare",
                        "Cohere",
                        "CrofAI",
                        "Crusoe",
                        "DeepInfra",
                        "DeepSeek",
                        "Enfer",
                        "Featherless",
                        "Fireworks",
                        "Friendli",
                        "GMICloud",
                        "Google",
                        "Google AI Studio",
                        "Groq",
                        "Hyperbolic",
                        "Inception",
                        "InferenceNet",
                        "Infermatic",
                        "Inflection",
                        "InoCloud",
                        "Kluster",
                        "Lambda",
                        "Liquid",
                        "Mancer 2",
                        "Meta",
                        "Minimax",
                        "Mistral",
                        "NCompass",
                        "Nebius",
                        "NextBit",
                        "Nineteen",
                        "Novita",
                        "OpenAI",
                        "OpenInference",
                        "Parasail",
                        "Perplexity",
                        "Phala",
                        "SambaNova",
                        "Stealth",
                        "Targon",
                        "Together",
                        "Ubicloud",
                        "Venice",
                        "xAI"
                      ]
                    },
                    {
                      "type": "string"
                    }
                  ]
                }
              },
              {
                "type": "null"
              }
            ],
            "description": "An ordered list of provider slugs. The router will attempt to use the first provider in the subset of this list that supports your requested model, and fall back to the next if it is unavailable. If no providers are available, the request will fail with an error message."
          },
          "only": {
            "anyOf": [
              {
                "$ref": "#/definitions/Provider Preferences Schema/properties/order/anyOf/0"
              },
              {
                "type": "null"
              }
            ],
            "description": "List of provider slugs to allow. If provided, this list is merged with your account-wide allowed provider settings for this request."
          },
          "ignore": {
            "anyOf": [
              {
                "$ref": "#/definitions/Provider Preferences Schema/properties/order/anyOf/0"
              },
              {
                "type": "null"
              }
            ],
            "description": "List of provider slugs to ignore. If provided, this list is merged with your account-wide ignored provider settings for this request."
          },
          "quantizations": {
            "anyOf": [
              {
                "type": "array",
                "items": {
                  "type": "string",
                  "enum": [
                    "int4",
                    "int8",
                    "fp4",
                    "fp6",
                    "fp8",
                    "fp16",
                    "bf16",
                    "fp32",
                    "unknown"
                  ]
                }
              },
              {
                "type": "null"
              }
            ],
            "description": "A list of quantization levels to filter the provider by."
          },
          "sort": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "price",
                  "throughput",
                  "latency"
                ]
              },
              {
                "type": "null"
              }
            ],
            "description": "The sorting strategy to use for this request, if \"order\" is not specified. When set, no load balancing is performed."
          },
          "max_price": {
            "type": "object",
            "properties": {
              "prompt": {
                "anyOf": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "string"
                  },
                  {}
                ]
              },
              "completion": {
                "$ref": "#/definitions/Provider Preferences Schema/properties/max_price/properties/prompt"
              },
              "image": {
                "$ref": "#/definitions/Provider Preferences Schema/properties/max_price/properties/prompt"
              },
              "request": {
                "$ref": "#/definitions/Provider Preferences Schema/properties/max_price/properties/prompt"
              }
            },
            "additionalProperties": false,
            "description": "The object specifying the maximum price you want to pay for this request. USD price per million tokens, for prompt and completion."
          },
          "experimental": {
            "anyOf": [
              {
                "type": "object",
                "properties": {
                  "force_chat_completions": {
                    "type": [
                      "boolean",
                      "null"
                    ]
                  }
                },
                "additionalProperties": false
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "additionalProperties": false
      }
    },
    "$schema": "http://json-schema.org/draft-07/schema#"
  }

  ---
title: Prompt Caching
subtitle: Cache prompt messages
headline: Prompt Caching | Reduce AI Model Costs with OpenRouter
canonical-url: 'https://openrouter.ai/docs/features/prompt-caching'
'og:site_name': OpenRouter Documentation
'og:title': Prompt Caching - Optimize AI Model Costs with Smart Caching
'og:description': >-
  Reduce your AI model costs with OpenRouter's prompt caching feature. Learn how
  to cache and reuse responses across OpenAI, Anthropic Claude, and DeepSeek
  models.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=Prompt%20Caching&description=Optimize%20AI%20model%20costs%20with%20OpenRouter
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import {
  ANTHROPIC_CACHE_READ_MULTIPLIER,
  ANTHROPIC_CACHE_WRITE_MULTIPLIER,
  DEEPSEEK_CACHE_READ_MULTIPLIER,
  GOOGLE_CACHE_MIN_TOKENS_2_5_FLASH,
  GOOGLE_CACHE_MIN_TOKENS_2_5_PRO,
  GOOGLE_CACHE_READ_MULTIPLIER,
} from '../../../imports/constants';

To save on inference costs, you can enable prompt caching on supported providers and models.

Most providers automatically enable prompt caching, but note that some (see Anthropic below) require you to enable it on a per-message basis.

When using caching (whether automatically in supported models, or via the `cache_control` header), OpenRouter will make a best-effort to continue routing to the same provider to make use of the warm cache. In the event that the provider with your cached prompt is not available, OpenRouter will try the next-best provider.

## Inspecting cache usage

To see how much caching saved on each generation, you can:

1. Click the detail button on the [Activity](/activity) page
2. Use the `/api/v1/generation` API, [documented here](/api-reference/overview#querying-cost-and-stats)
3. Use `usage: {include: true}` in your request to get the cache tokens at the end of the response (see [Usage Accounting](/use-cases/usage-accounting) for details)

The `cache_discount` field in the response body will tell you how much the response saved on cache usage. Some providers, like Anthropic, will have a negative discount on cache writes, but a positive discount (which reduces total cost) on cache reads.

## OpenAI

Caching price changes:

- **Cache writes**: no cost
- **Cache reads**: (depending on the model) charged at 0.5x or 0.75x the price of the original input pricing

[Click here to view OpenAI's cache pricing per model.](https://platform.openai.com/docs/pricing)

Prompt caching with OpenAI is automated and does not require any additional configuration. There is a minimum prompt size of 1024 tokens.

[Click here to read more about OpenAI prompt caching and its limitation.](https://platform.openai.com/docs/guides/prompt-caching)

## Anthropic Claude

Caching price changes:

- **Cache writes**: charged at {ANTHROPIC_CACHE_WRITE_MULTIPLIER}x the price of the original input pricing
- **Cache reads**: charged at {ANTHROPIC_CACHE_READ_MULTIPLIER}x the price of the original input pricing

Prompt caching with Anthropic requires the use of `cache_control` breakpoints. There is a limit of four breakpoints, and the cache will expire within five minutes. Therefore, it is recommended to reserve the cache breakpoints for large bodies of text, such as character cards, CSV data, RAG data, book chapters, etc.

[Click here to read more about Anthropic prompt caching and its limitation.](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)

The `cache_control` breakpoint can only be inserted into the text part of a multipart message.

System message caching example:

```json
{
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are a historian studying the fall of the Roman Empire. You know the following book very well:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY",
          "cache_control": {
            "type": "ephemeral"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What triggered the collapse?"
        }
      ]
    }
  ]
}
```

User message caching example:

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Given the book below:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY",
          "cache_control": {
            "type": "ephemeral"
          }
        },
        {
          "type": "text",
          "text": "Name all the characters in the above book"
        }
      ]
    }
  ]
}
```

## DeepSeek

Caching price changes:

- **Cache writes**: charged at the same price as the original input pricing
- **Cache reads**: charged at {DEEPSEEK_CACHE_READ_MULTIPLIER}x the price of the original input pricing

Prompt caching with DeepSeek is automated and does not require any additional configuration.

## Google Gemini

### Implicit Caching

Gemini 2.5 Pro and 2.5 Flash models now support **implicit caching**, providing automatic caching functionality similar to OpenAI’s automatic caching. Implicit caching works seamlessly — no manual setup or additional `cache_control` breakpoints required.

Pricing Changes:

- No cache write or storage costs.
- Cached tokens are charged at {GOOGLE_CACHE_READ_MULTIPLIER}x the original input token cost.

Note that the TTL is on average 3-5 minutes, but will vary. There is a minimum of {GOOGLE_CACHE_MIN_TOKENS_2_5_FLASH} tokens for Gemini 2.5 Flash, and {GOOGLE_CACHE_MIN_TOKENS_2_5_PRO} tokens for Gemini 2.5 Pro for requests to be eligible for caching.

[Official announcement from Google](https://developers.googleblog.com/en/gemini-2-5-models-now-support-implicit-caching/)

<Tip>
  To maximize implicit cache hits, keep the initial portion of your message
  arrays consistent between requests. Push variations (such as user questions or
  dynamic context elements) toward the end of your prompt/requests.
</Tip>

### Pricing Changes for Cached Requests:

- **Cache Writes:** Charged at the input token cost plus 5 minutes of cache storage, calculated as follows:

```
Cache write cost = Input token price + (Cache storage price × (5 minutes / 60 minutes))
```

- **Cache Reads:** Charged at {GOOGLE_CACHE_READ_MULTIPLIER}× the original input token cost.

### Supported Models and Limitations:

Only certain Gemini models support caching. Please consult Google's [Gemini API Pricing Documentation](https://ai.google.dev/gemini-api/docs/pricing) for the most current details.

Cache Writes have a 5 minute Time-to-Live (TTL) that does not update. After 5 minutes, the cache expires and a new cache must be written.

Gemini models have typically have a 4096 token minimum for cache write to occur. Cached tokens count towards the model's maximum token usage. Gemini 2.5 Pro has a minimum of {GOOGLE_CACHE_MIN_TOKENS_2_5_PRO} tokens, and Gemini 2.5 Flash has a minimum of {GOOGLE_CACHE_MIN_TOKENS_2_5_FLASH} tokens.

### How Gemini Prompt Caching works on OpenRouter:

OpenRouter simplifies Gemini cache management, abstracting away complexities:

- You **do not** need to manually create, update, or delete caches.
- You **do not** need to manage cache names or TTL explicitly.

### How to Enable Gemini Prompt Caching:

Gemini caching in OpenRouter requires you to insert `cache_control` breakpoints explicitly within message content, similar to Anthropic. We recommend using caching primarily for large content pieces (such as CSV files, lengthy character cards, retrieval augmented generation (RAG) data, or extensive textual sources).

<Tip>
  There is not a limit on the number of `cache_control` breakpoints you can
  include in your request. OpenRouter will use only the last breakpoint for
  Gemini caching. Including multiple breakpoints is safe and can help maintain
  compatibility with Anthropic, but only the final one will be used for Gemini.
</Tip>

### Examples:

#### System Message Caching Example

```json
{
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are a historian studying the fall of the Roman Empire. Below is an extensive reference book:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY HERE",
          "cache_control": {
            "type": "ephemeral"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What triggered the collapse?"
        }
      ]
    }
  ]
}
```

#### User Message Caching Example

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Based on the book text below:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY HERE",
          "cache_control": {
            "type": "ephemeral"
          }
        },
        {
          "type": "text",
          "text": "List all main characters mentioned in the text above."
        }
      ]
    }
  ]
}
```

---
title: Structured Outputs
subtitle: Return structured data from your models
headline: Structured Outputs | Enforce JSON Schema in OpenRouter API Responses
canonical-url: 'https://openrouter.ai/docs/features/structured-outputs'
'og:site_name': OpenRouter Documentation
'og:title': Structured Outputs - Type-Safe JSON Responses from AI Models
'og:description': >-
  Enforce JSON Schema validation on AI model responses. Get consistent,
  type-safe outputs and avoid parsing errors with OpenRouter's structured output
  feature.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=Structured%20Outputs&description=Type-Safe%20JSON%20Responses%20from%20AI%20Models
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import { API_KEY_REF } from '../../../imports/constants';

OpenRouter supports structured outputs for compatible models, ensuring responses follow a specific JSON Schema format. This feature is particularly useful when you need consistent, well-formatted responses that can be reliably parsed by your application.

## Overview

Structured outputs allow you to:

- Enforce specific JSON Schema validation on model responses
- Get consistent, type-safe outputs
- Avoid parsing errors and hallucinated fields
- Simplify response handling in your application

## Using Structured Outputs

To use structured outputs, include a `response_format` parameter in your request, with `type` set to `json_schema` and the `json_schema` object containing your schema:

```typescript
{
  "messages": [
    { "role": "user", "content": "What's the weather like in London?" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City or location name"
          },
          "temperature": {
            "type": "number",
            "description": "Temperature in Celsius"
          },
          "conditions": {
            "type": "string",
            "description": "Weather conditions description"
          }
        },
        "required": ["location", "temperature", "conditions"],
        "additionalProperties": false
      }
    }
  }
}
```

The model will respond with a JSON object that strictly follows your schema:

```json
{
  "location": "London",
  "temperature": 18,
  "conditions": "Partly cloudy with light drizzle"
}
```

## Model Support

Structured outputs are supported by select models.

You can find a list of models that support structured outputs on the [models page](https://openrouter.ai/models?order=newest&supported_parameters=structured_outputs).

- OpenAI models (GPT-4o and later versions) [Docs](https://platform.openai.com/docs/guides/structured-outputs)
- All Fireworks provided models [Docs](https://docs.fireworks.ai/structured-responses/structured-response-formatting#structured-response-modes)

To ensure your chosen model supports structured outputs:

1. Check the model's supported parameters on the [models page](https://openrouter.ai/models)
2. Set `require_parameters: true` in your provider preferences (see [Provider Routing](/docs/features/provider-routing))
3. Include `response_format` and set `type: json_schema` in the required parameters

## Best Practices

1. **Include descriptions**: Add clear descriptions to your schema properties to guide the model

2. **Use strict mode**: Always set `strict: true` to ensure the model follows your schema exactly

## Example Implementation

Here's a complete example using the Fetch API:

<Template data={{
  API_KEY_REF,
  MODEL: 'openai/gpt-4'
}}>
<CodeGroup>

```typescript title="With TypeScript"
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer {{API_KEY_REF}}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages: [
      { role: 'user', content: 'What is the weather like in London?' },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'weather',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City or location name',
            },
            temperature: {
              type: 'number',
              description: 'Temperature in Celsius',
            },
            conditions: {
              type: 'string',
              description: 'Weather conditions description',
            },
          },
          required: ['location', 'temperature', 'conditions'],
          additionalProperties: false,
        },
      },
    },
  }),
});

const data = await response.json();
const weatherInfo = data.choices[0].message.content;
```

```python title="With Python"
import requests
import json

response = requests.post(
  "https://openrouter.ai/api/v1/chat/completions",
  headers={
    "Authorization": f"Bearer {{API_KEY_REF}}",
    "Content-Type": "application/json",
  },

  json={
    "model": "{{MODEL}}",
    "messages": [
      {"role": "user", "content": "What is the weather like in London?"},
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "weather",
        "strict": True,
        "schema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City or location name",
            },
            "temperature": {
              "type": "number",
              "description": "Temperature in Celsius",
            },
            "conditions": {
              "type": "string",
              "description": "Weather conditions description",
            },
          },
          "required": ["location", "temperature", "conditions"],
          "additionalProperties": False,
        },
      },
    },
  },
)

data = response.json()
weather_info = data["choices"][0]["message"]["content"]
```

</CodeGroup>

</Template>

## Streaming with Structured Outputs

Structured outputs are also supported with streaming responses. The model will stream valid partial JSON that, when complete, forms a valid response matching your schema.

To enable streaming with structured outputs, simply add `stream: true` to your request:

```typescript
{
  "stream": true,
  "response_format": {
    "type": "json_schema",
    // ... rest of your schema
  }
}
```

## Error Handling

When using structured outputs, you may encounter these scenarios:

1. **Model doesn't support structured outputs**: The request will fail with an error indicating lack of support
2. **Invalid schema**: The model will return an error if your JSON Schema is invalid


---
title: Tool & Function Calling
subtitle: Use tools in your prompts
headline: Tool & Function Calling | Use Tools with OpenRouter
canonical-url: 'https://openrouter.ai/docs/features/tool-calling'
'og:site_name': OpenRouter Documentation
'og:title': Tool & Function Calling - Use Tools with OpenRouter
'og:description': >-
  Use tools (or functions) in your prompts with OpenRouter. Learn how to use
  tools with OpenAI, Anthropic, and other models that support tool calling.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=Tool%20&%20Function%20Calling&description=Use%20tools%20with%20OpenRouter
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import { API_KEY_REF, Model } from '../../../imports/constants';

Tool calls (also known as function calls) give an LLM access to external tools. The LLM does not call the tools directly. Instead, it suggests the tool to call. The user then calls the tool separately and provides the results back to the LLM. Finally, the LLM formats the response into an answer to the user's original question.

OpenRouter standardizes the tool calling interface across models and providers.

For a primer on how tool calling works in the OpenAI SDK, please see [this article](https://platform.openai.com/docs/guides/function-calling?api-mode=chat), or if you prefer to learn from a full end-to-end example, keep reading.

### Tool Calling Example

Here is Python code that gives LLMs the ability to call an external API -- in this case Project Gutenberg, to search for books.

First, let's do some basic setup:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
import json, requests
from openai import OpenAI

OPENROUTER_API_KEY = f"{{API_KEY_REF}}"

# You can use any model that supports tool calling
MODEL = "{{MODEL}}"

openai_client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=OPENROUTER_API_KEY,
)

task = "What are the titles of some James Joyce books?"

messages = [
  {
    "role": "system",
    "content": "You are a helpful assistant."
  },
  {
    "role": "user",
    "content": task,
  }
]

```

```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer {{API_KEY_REF}}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: 'What are the titles of some James Joyce books?',
      },
    ],
  }),
});
```

</CodeGroup>
</Template>

### Define the Tool

Next, we define the tool that we want to call. Remember, the tool is going to get _requested_ by the LLM, but the code we are writing here is ultimately responsible for executing the call and returning the results to the LLM.

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
def search_gutenberg_books(search_terms):
    search_query = " ".join(search_terms)
    url = "https://gutendex.com/books"
    response = requests.get(url, params={"search": search_query})

    simplified_results = []
    for book in response.json().get("results", []):
        simplified_results.append({
            "id": book.get("id"),
            "title": book.get("title"),
            "authors": book.get("authors")
        })

    return simplified_results

tools = [
  {
    "type": "function",
    "function": {
      "name": "search_gutenberg_books",
      "description": "Search for books in the Project Gutenberg library based on specified search terms",
      "parameters": {
        "type": "object",
        "properties": {
          "search_terms": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "List of search terms to find books in the Gutenberg library (e.g. ['dickens', 'great'] to search for books by Dickens with 'great' in the title)"
          }
        },
        "required": ["search_terms"]
      }
    }
  }
]

TOOL_MAPPING = {
    "search_gutenberg_books": search_gutenberg_books
}

```

```typescript
async function searchGutenbergBooks(searchTerms: string[]): Promise<Book[]> {
  const searchQuery = searchTerms.join(' ');
  const url = 'https://gutendex.com/books';
  const response = await fetch(`${url}?search=${searchQuery}`);
  const data = await response.json();

  return data.results.map((book: any) => ({
    id: book.id,
    title: book.title,
    authors: book.authors,
  }));
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'searchGutenbergBooks',
      description:
        'Search for books in the Project Gutenberg library based on specified search terms',
      parameters: {
        type: 'object',
        properties: {
          search_terms: {
            type: 'array',
            items: {
              type: 'string',
            },
            description:
              "List of search terms to find books in the Gutenberg library (e.g. ['dickens', 'great'] to search for books by Dickens with 'great' in the title)",
          },
        },
        required: ['search_terms'],
      },
    },
  },
];

const TOOL_MAPPING = {
  searchGutenbergBooks,
};
```

</CodeGroup>
</Template>

Note that the "tool" is just a normal function. We then write a JSON "spec" compatible with the OpenAI function calling parameter. We'll pass that spec to the LLM so that it knows this tool is available and how to use it. It will request the tool when needed, along with any arguments. We'll then marshal the tool call locally, make the function call, and return the results to the LLM.

### Tool use and tool results

Let's make the first OpenRouter API call to the model:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
request_1 = {
    "model": {{MODEL}},
    "tools": tools,
    "messages": messages
}

response_1 = openai_client.chat.completions.create(**request_1).message
```

```typescript
const request_1 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer {{API_KEY_REF}}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    tools,
    messages,
  }),
});

const data = await request_1.json();
const response_1 = data.choices[0].message;
```

</CodeGroup>
</Template>

The LLM responds with a finish reason of tool_calls, and a tool_calls array. In a generic LLM response-handler, you would want to check the finish reason before processing tool calls, but here we will assume it's the case. Let's keep going, by processing the tool call:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
# Append the response to the messages array so the LLM has the full context
# It's easy to forget this step!
messages.append(response_1)

# Now we process the requested tool calls, and use our book lookup tool
for tool_call in response_1.tool_calls:
    '''
    In this case we only provided one tool, so we know what function to call.
    When providing multiple tools, you can inspect `tool_call.function.name`
    to figure out what function you need to call locally.
    '''
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)
    tool_response = TOOL_MAPPING[tool_name](**tool_args)
    messages.append({
      "role": "tool",
      "tool_call_id": tool_call.id,
      "name": tool_name,
      "content": json.dumps(tool_response),
    })
```

```typescript
// Append the response to the messages array so the LLM has the full context
// It's easy to forget this step!
messages.push(response_1);

// Now we process the requested tool calls, and use our book lookup tool
for (const toolCall of response_1.tool_calls) {
  const toolName = toolCall.function.name;
  const { search_params } = JSON.parse(toolCall.function.arguments);
  const toolResponse = await TOOL_MAPPING[toolName](search_params);
  messages.push({
    role: 'tool',
    toolCallId: toolCall.id,
    name: toolName,
    content: JSON.stringify(toolResponse),
  });
}
```

</CodeGroup>
</Template>

The messages array now has:

1. Our original request
2. The LLM's response (containing a tool call request)
3. The result of the tool call (a json object returned from the Project Gutenberg API)

Now, we can make a second OpenRouter API call, and hopefully get our result!

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
request_2 = {
  "model": MODEL,
  "messages": messages,
  "tools": tools
}

response_2 = openai_client.chat.completions.create(**request_2)

print(response_2.choices[0].message.content)
```

```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer {{API_KEY_REF}}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages,
    tools,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

</CodeGroup>
</Template>

The output will be something like:

```text
Here are some books by James Joyce:

*   *Ulysses*
*   *Dubliners*
*   *A Portrait of the Artist as a Young Man*
*   *Chamber Music*
*   *Exiles: A Play in Three Acts*
```

We did it! We've successfully used a tool in a prompt.

## A Simple Agentic Loop

In the example above, the calls are made explicitly and sequentially. To handle a wide variety of user inputs and tool calls, you can use an agentic loop.

Here's an example of a simple agentic loop (using the same `tools` and initial `messages` as above):

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python

def call_llm(msgs):
    resp = openai_client.chat.completions.create(
        model={{MODEL}},
        tools=tools,
        messages=msgs
    )
    msgs.append(resp.choices[0].message.dict())
    return resp

def get_tool_response(response):
    tool_call = response.choices[0].message.tool_calls[0]
    tool_name = tool_call.function.name
    tool_args = json.loads(tool_call.function.arguments)

    # Look up the correct tool locally, and call it with the provided arguments
    # Other tools can be added without changing the agentic loop
    tool_result = TOOL_MAPPING[tool_name](**tool_args)

    return {
        "role": "tool",
        "tool_call_id": tool_call.id,
        "name": tool_name,
        "content": tool_result,
    }

while True:
    resp = call_llm(_messages)

    if resp.choices[0].message.tool_calls is not None:
        messages.append(get_tool_response(resp))
    else:
        break

print(messages[-1]['content'])

```

```typescript
async function callLLM(messages: Message[]): Promise<Message> {
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer {{API_KEY_REF}}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: '{{MODEL}}',
        tools,
        messages,
      }),
    },
  );

  const data = await response.json();
  messages.push(data.choices[0].message);
  return data;
}

async function getToolResponse(response: Message): Promise<Message> {
  const toolCall = response.toolCalls[0];
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);

  // Look up the correct tool locally, and call it with the provided arguments
  // Other tools can be added without changing the agentic loop
  const toolResult = await TOOL_MAPPING[toolName](toolArgs);

  return {
    role: 'tool',
    toolCallId: toolCall.id,
    name: toolName,
    content: toolResult,
  };
}

while (true) {
  const response = await callLLM(messages);

  if (response.toolCalls) {
    messages.push(await getToolResponse(response));
  } else {
    break;
  }
}

console.log(messages[messages.length - 1].content);
```

</CodeGroup>
</Template>


---
title: Images & PDFs
subtitle: How to send images and PDFs to OpenRouter
headline: OpenRouter Images & PDFs | Complete Documentation
canonical-url: 'https://openrouter.ai/docs/features/images-and-pdfs'
'og:site_name': OpenRouter Documentation
'og:title': OpenRouter Images & PDFs - Complete Documentation
'og:description': Sending images and PDFs to the OpenRouter API.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?title=OpenRouter%20Images%20&%20PDFs&description=Sending%20images%20and%20PDFs%20to%20the%20OpenRouter%20API.
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

import {
  API_KEY_REF,
  DEFAULT_PDF_ENGINE,
  MISTRAL_OCR_USER_COST_PER_1K_PAGE as MISTRAL_OCR_COST,
  PDFParserEngine,
} from '../../../imports/constants';

OpenRouter supports sending images and PDFs via the API. This guide will show you how to work with both file types using our API.

Both images and PDFs also work in the chat room.

<Tip>You can send both PDF and images in the same request.</Tip>

## Image Inputs

Requests with images, to multimodel models, are available via the `/api/v1/chat/completions` API with a multi-part `messages` parameter. The `image_url` can either be a URL or a base64-encoded image. Note that multiple images can be sent in separate content array entries. The number of images you can send in a single request varies per provider and per model. Due to how the content is parsed, we recommend sending the text prompt first, then the images. If the images must come first, we recommend putting it in the system prompt.

### Using Image URLs

Here's how to send an image using a URL:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
import requests
import json

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY_REF}",
    "Content-Type": "application/json"
}

messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "What's in this image?"
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
                }
            }
        ]
    }
]

payload = {
    "model": "{{MODEL}}",
    "messages": messages
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```typescript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY_REF}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "What's in this image?",
          },
          {
            type: 'image_url',
            image_url: {
              url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg',
            },
          },
        ],
      },
    ],
  }),
});

const data = await response.json();
console.log(data);
```

</CodeGroup>
</Template>

### Using Base64 Encoded Images

For locally stored images, you can send them using base64 encoding. Here's how to do it:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemini-2.0-flash-001'
}}>
<CodeGroup>

```python
import requests
import json
import base64
from pathlib import Path

def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY_REF}",
    "Content-Type": "application/json"
}

# Read and encode the image
image_path = "path/to/your/image.jpg"
base64_image = encode_image_to_base64(image_path)
data_url = f"data:image/jpeg;base64,{base64_image}"

messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "What's in this image?"
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": data_url
                }
            }
        ]
    }
]

payload = {
    "model": "{{MODEL}}",
    "messages": messages
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```typescript
async function encodeImageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');
  return `data:image/jpeg;base64,${base64Image}`;
}

// Read and encode the image
const imagePath = 'path/to/your/image.jpg';
const base64Image = await encodeImageToBase64(imagePath);

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY_REF}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "What's in this image?",
          },
          {
            type: 'image_url',
            image_url: {
              url: base64Image,
            },
          },
        ],
      },
    ],
  }),
});

const data = await response.json();
console.log(data);
```

</CodeGroup>
</Template>

Supported image content types are:

- `image/png`
- `image/jpeg`
- `image/webp`

## PDF Support

OpenRouter supports PDF processing through the `/api/v1/chat/completions` API. PDFs can be sent as base64-encoded data URLs in the messages array, via the file content type. This feature works on **any** model on OpenRouter.

<Info>
  When a model supports file input natively, the PDF is passed directly to the
  model. When the model does not support file input natively, OpenRouter will
  parse the file and pass the parsed results to the requested model.
</Info>

Note that multiple PDFs can be sent in separate content array entries. The number of PDFs you can send in a single request varies per provider and per model. Due to how the content is parsed, we recommend sending the text prompt first, then the PDF. If the PDF must come first, we recommend putting it in the system prompt.

### Processing PDFs

Here's how to send and process a PDF:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemma-3-27b-it',
  ENGINE: PDFParserEngine.PDFText,
  DEFAULT_PDF_ENGINE,
}}>
<CodeGroup>

```python
import requests
import json
import base64
from pathlib import Path

def encode_pdf_to_base64(pdf_path):
    with open(pdf_path, "rb") as pdf_file:
        return base64.b64encode(pdf_file.read()).decode('utf-8')

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY_REF}",
    "Content-Type": "application/json"
}

# Read and encode the PDF
pdf_path = "path/to/your/document.pdf"
base64_pdf = encode_pdf_to_base64(pdf_path)
data_url = f"data:application/pdf;base64,{base64_pdf}"

messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "What are the main points in this document?"
            },
            {
                "type": "file",
                "file": {
                    "filename": "document.pdf",
                    "file_data": data_url
                }
            },
        ]
    }
]

# Optional: Configure PDF processing engine
# PDF parsing will still work even if the plugin is not explicitly set
plugins = [
    {
        "id": "file-parser",
        "pdf": {
            "engine": "{{ENGINE}}"  # defaults to "{{DEFAULT_PDF_ENGINE}}". See Pricing below
        }
    }
]

payload = {
    "model": "{{MODEL}}",
    "messages": messages,
    "plugins": plugins
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

```typescript
async function encodePDFToBase64(pdfPath: string): Promise<string> {
  const pdfBuffer = await fs.promises.readFile(pdfPath);
  const base64PDF = pdfBuffer.toString('base64');
  return `data:application/pdf;base64,${base64PDF}`;
}

// Read and encode the PDF
const pdfPath = 'path/to/your/document.pdf';
const base64PDF = await encodePDFToBase64(pdfPath);

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${API_KEY_REF}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: '{{MODEL}}',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What are the main points in this document?',
          },
          {
            type: 'file',
            file: {
              filename: 'document.pdf',
              file_data: base64PDF,
            },
          },
        ],
      },
    ],
    // Optional: Configure PDF processing engine
    // PDF parsing will still work even if the plugin is not explicitly set
    plugins: [
      {
        id: 'file-parser',
        pdf: {
          engine: '{{ENGINE}}', // defaults to "{{DEFAULT_PDF_ENGINE}}". See Pricing below
        },
      },
    ],
  }),
});

const data = await response.json();
console.log(data);
```

</CodeGroup>
</Template>

### Pricing

OpenRouter provides several PDF processing engines:

1. <code>"{PDFParserEngine.MistralOCR}"</code>: Best for scanned documents or
   PDFs with images (${MISTRAL_OCR_COST.toString()} per 1,000 pages).
2. <code>"{PDFParserEngine.PDFText}"</code>: Best for well-structured PDFs with
   clear text content (Free).
3. <code>"{PDFParserEngine.Native}"</code>: Only available for models that
   support file input natively (charged as input tokens).

If you don't explicitly specify an engine, OpenRouter will default first to the model's native file processing capabilities, and if that's not available, we will use the <code>"{DEFAULT_PDF_ENGINE}"</code> engine.

To select an engine, use the plugin configuration:

<Template data={{
  API_KEY_REF,
  ENGINE: PDFParserEngine.MistralOCR,
}}>
<CodeGroup>

```python
plugins = [
    {
        "id": "file-parser",
        "pdf": {
            "engine": "{{ENGINE}}"
        }
    }
]
```

```typescript
{
  plugins: [
    {
      id: 'file-parser',
      pdf: {
        engine: '{{ENGINE}}',
      },
    },
  ],
}
```

</CodeGroup>
</Template>

### Skip Parsing Costs

When you send a PDF to the API, the response may include file annotations in the assistant's message. These annotations contain structured information about the PDF document that was parsed. By sending these annotations back in subsequent requests, you can avoid re-parsing the same PDF document multiple times, which saves both processing time and costs.

Here's how to reuse file annotations:

<Template data={{
  API_KEY_REF,
  MODEL: 'google/gemma-3-27b-it'
}}>
<CodeGroup>

```python
import requests
import json
import base64
from pathlib import Path

# First, encode and send the PDF
def encode_pdf_to_base64(pdf_path):
    with open(pdf_path, "rb") as pdf_file:
        return base64.b64encode(pdf_file.read()).decode('utf-8')

url = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY_REF}",
    "Content-Type": "application/json"
}

# Read and encode the PDF
pdf_path = "path/to/your/document.pdf"
base64_pdf = encode_pdf_to_base64(pdf_path)
data_url = f"data:application/pdf;base64,{base64_pdf}"

# Initial request with the PDF
messages = [
    {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": "What are the main points in this document?"
            },
            {
                "type": "file",
                "file": {
                    "filename": "document.pdf",
                    "file_data": data_url
                }
            },
        ]
    }
]

payload = {
    "model": "{{MODEL}}",
    "messages": messages
}

response = requests.post(url, headers=headers, json=payload)
response_data = response.json()

# Store the annotations from the response
file_annotations = None
if response_data.get("choices") and len(response_data["choices"]) > 0:
    if "annotations" in response_data["choices"][0]["message"]:
        file_annotations = response_data["choices"][0]["message"]["annotations"]

# Follow-up request using the annotations (without sending the PDF again)
if file_annotations:
    follow_up_messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "What are the main points in this document?"
                },
                {
                    "type": "file",
                    "file": {
                        "filename": "document.pdf",
                        "file_data": data_url
                    }
                }
            ]
        },
        {
            "role": "assistant",
            "content": "The document contains information about...",
            "annotations": file_annotations
        },
        {
            "role": "user",
            "content": "Can you elaborate on the second point?"
        }
    ]

    follow_up_payload = {
        "model": "{{MODEL}}",
        "messages": follow_up_messages
    }

    follow_up_response = requests.post(url, headers=headers, json=follow_up_payload)
    print(follow_up_response.json())
```

```typescript
import fs from 'fs/promises';
import { fetch } from 'node-fetch';

async function encodePDFToBase64(pdfPath: string): Promise<string> {
  const pdfBuffer = await fs.readFile(pdfPath);
  const base64PDF = pdfBuffer.toString('base64');
  return `data:application/pdf;base64,${base64PDF}`;
}

// Initial request with the PDF
async function processDocument() {
  // Read and encode the PDF
  const pdfPath = 'path/to/your/document.pdf';
  const base64PDF = await encodePDFToBase64(pdfPath);

  const initialResponse = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY_REF}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: '{{MODEL}}',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What are the main points in this document?',
              },
              {
                type: 'file',
                file: {
                  filename: 'document.pdf',
                  file_data: base64PDF,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  const initialData = await initialResponse.json();

  // Store the annotations from the response
  let fileAnnotations = null;
  if (initialData.choices && initialData.choices.length > 0) {
    if (initialData.choices[0].message.annotations) {
      fileAnnotations = initialData.choices[0].message.annotations;
    }
  }

  // Follow-up request using the annotations (without sending the PDF again)
  if (fileAnnotations) {
    const followUpResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY_REF}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: '{{MODEL}}',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What are the main points in this document?',
                },
                {
                  type: 'file',
                  file: {
                    filename: 'document.pdf',
                    file_data: base64PDF,
                  },
                },
              ],
            },
            {
              role: 'assistant',
              content: 'The document contains information about...',
              annotations: fileAnnotations,
            },
            {
              role: 'user',
              content: 'Can you elaborate on the second point?',
            },
          ],
        }),
      },
    );

    const followUpData = await followUpResponse.json();
    console.log(followUpData);
  }
}

processDocument();
```

</CodeGroup>
</Template>

<Info>
  When you include the file annotations from a previous response in your
  subsequent requests, OpenRouter will use this pre-parsed information instead
  of re-parsing the PDF, which saves processing time and costs. This is
  especially beneficial for large documents or when using the `mistral-ocr`
  engine which incurs additional costs.
</Info>

### Response Format

The API will return a response in the following format:

```json
{
  "id": "gen-1234567890",
  "provider": "DeepInfra",
  "model": "google/gemma-3-27b-it",
  "object": "chat.completion",
  "created": 1234567890,
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "The document discusses..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 1000,
    "completion_tokens": 100,
    "total_tokens": 1100
  }
}
```
---
title: Provisioning API Keys
subtitle: Manage API keys programmatically
headline: Provisioning API Keys | Programmatic Control of OpenRouter API Keys
canonical-url: 'https://openrouter.ai/docs/features/provisioning-api-keys'
'og:site_name': OpenRouter Documentation
'og:title': Provisioning API Keys - Programmatic Control of OpenRouter API Keys
'og:description': >-
  Manage OpenRouter API keys programmatically through dedicated management
  endpoints. Create, read, update, and delete API keys for automated key
  distribution and control.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=features/provisioning-api-keys&title=Provisioning%20API%20Keys&description=Programmatically%20manage%20OpenRouter%20API%20keys
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

OpenRouter provides endpoints to programmatically manage your API keys, enabling key creation and management for applications that need to distribute or rotate keys automatically.

## Creating a Provisioning API Key

To use the key management API, you first need to create a Provisioning API key:

1. Go to the [Provisioning API Keys page](https://openrouter.ai/settings/provisioning-keys)
2. Click "Create New Key"
3. Complete the key creation process

Provisioning keys cannot be used to make API calls to OpenRouter's completion endpoints - they are exclusively for key management operations.

## Use Cases

Common scenarios for programmatic key management include:

- **SaaS Applications**: Automatically create unique API keys for each customer instance
- **Key Rotation**: Regularly rotate API keys for security compliance
- **Usage Monitoring**: Track key usage and automatically disable keys that exceed limits

## Example Usage

All key management endpoints are under `/api/v1/keys` and require a Provisioning API key in the Authorization header.

<CodeGroup>

```python title="Python"
import requests

PROVISIONING_API_KEY = "your-provisioning-key"
BASE_URL = "https://openrouter.ai/api/v1/keys"

# List the most recent 100 API keys
response = requests.get(
    BASE_URL,
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)

# You can paginate using the offset parameter
response = requests.get(
    f"{BASE_URL}?offset=100",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)

# Create a new API key
response = requests.post(
    f"{BASE_URL}/",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "name": "Customer Instance Key",
        "label": "customer-123",
        "limit": 1000  # Optional credit limit
    }
)

# Get a specific key
key_hash = "<YOUR_KEY_HASH>"
response = requests.get(
    f"{BASE_URL}/{key_hash}",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)

# Update a key
response = requests.patch(
    f"{BASE_URL}/{key_hash}",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "name": "Updated Key Name",
        "disabled": True  # Disable the key
    }
)

# Delete a key
response = requests.delete(
    f"{BASE_URL}/{key_hash}",
    headers={
        "Authorization": f"Bearer {PROVISIONING_API_KEY}",
        "Content-Type": "application/json"
    }
)
```

```typescript title="TypeScript"
const PROVISIONING_API_KEY = 'your-provisioning-key';
const BASE_URL = 'https://openrouter.ai/api/v1/keys';

// List the most recent 100 API keys
const listKeys = await fetch(BASE_URL, {
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// You can paginate using the `offset` query parameter
const listKeys = await fetch(`${BASE_URL}?offset=100`, {
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Create a new API key
const createKey = await fetch(`${BASE_URL}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Customer Instance Key',
    label: 'customer-123',
    limit: 1000, // Optional credit limit
  }),
});

// Get a specific key
const keyHash = '<YOUR_KEY_HASH>';
const getKey = await fetch(`${BASE_URL}/${keyHash}`, {
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Update a key
const updateKey = await fetch(`${BASE_URL}/${keyHash}`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'Updated Key Name',
    disabled: true, // Disable the key
  }),
});

// Delete a key
const deleteKey = await fetch(`${BASE_URL}/${keyHash}`, {
  method: 'DELETE',
  headers: {
    Authorization: `Bearer ${PROVISIONING_API_KEY}`,
    'Content-Type': 'application/json',
  },
});
```

</CodeGroup>

## Response Format

API responses return JSON objects containing key information:

```json
{
  "data": [
    {
      "created_at": "2025-02-19T20:52:27.363244+00:00",
      "updated_at": "2025-02-19T21:24:11.708154+00:00",
      "hash": "<YOUR_KEY_HASH>",
      "label": "sk-or-v1-customkey",
      "name": "Customer Key",
      "disabled": false,
      "limit": 10,
      "usage": 0
    }
  ]
}
```

When creating a new key, the response will include the key string itself.
question-ai-logo
managemanage
managemanage
useruser
fullfull
closeclose
Chat AI
Hello! Is there any question I can help you with?
What is the purpose of student government in the United States?
What is the highest peak in the United States?
Ask AI
logo
more
Logo
Search or ask AI a question
/
API
Models
Chat
Ranking
Login

Overview
Quickstart
FAQ
Principles
Models
Features
Privacy and Logging
Model Routing
Provider Routing
Prompt Caching
Structured Outputs
Tool Calling
Images & PDFs
Message Transforms
Uptime Optimization
Web Search
Zero Completion Insurance
Provisioning API Keys
API Reference
Overview
Streaming
Limits
Authentication
Parameters
Errors
POST
Completion
POST
Chat completion
GET
Get a generation
GET
List available models
GET
List endpoints for a model
GET
Get credits
POST
Create a Coinbase charge

Authentication

API Keys
GET
Get current API key
GET
List API keys
POST
Create API key
GET
Get API key
DEL
Delete API key
PATCH
Update API key
Use Cases
BYOK
Crypto API
OAuth PKCE
MCP Servers
For Providers
Reasoning Tokens
Usage Accounting
Community
Frameworks
Discord
API Reference
List available models

GET
https://openrouter.ai/api/v1/models
GET
/api/v1/models

cURL

curl https://openrouter.ai/api/v1/models
Try it
200
Retrieved

{
  "data": [
    {
      "id": "id",
      "name": "name",
      "created": 1741818122,
      "description": "description",
      "architecture": {
        "input_modalities": [
          "text",
          "image"
        ],
        "output_modalities": [
          "text"
        ],
        "tokenizer": "GPT"
      },
      "top_provider": {
        "is_moderated": true
      },
      "pricing": {
        "prompt": "0.0000007",
        "completion": "0.0000007",
        "image": "0",
        "request": "0",
        "input_cache_read": "0",
        "input_cache_write": "0",
        "web_search": "0",
        "internal_reasoning": "0"
      },
      "context_length": 128000,
      "hugging_face_id": "hugging_face_id",
      "per_request_limits": {
        "key": "value"
      },
      "supported_parameters": [
        "supported_parameters"
      ]
    }
  ]
}
Returns a list of models available through the API. Note: supported_parameters is a union of all parameters supported by all providers for this model. There may not be a single provider which offers all of the listed parameters for a model.

Response
List of available models

data
list of objects

Show 11 properties
Was this page helpful?
Yes
No
Previous
List endpoints for a model

Next
Built with
List available models | OpenRouter | Documentation