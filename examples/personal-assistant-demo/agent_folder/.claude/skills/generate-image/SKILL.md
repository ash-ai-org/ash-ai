---
name: generate-image
description: Generate images using the Gemini API. Creates illustrations, thumbnails, icons, diagrams, photos, and visual assets from text prompts.
use_when: User asks to create, generate, make, draw, design, or edit any image or visual content
allowed-tools: Bash(curl:*), Bash(python3:*), Read
---

# Nano Banana Image Generation

Generate professional images via the Gemini API's native image generation models.

## When to Use This Skill

ALWAYS use this skill when the user:
- Asks for any image, graphic, illustration, or visual
- Wants a thumbnail, featured image, or banner
- Requests icons, diagrams, or patterns
- Asks to edit, modify, or restore a photo
- Uses words like: generate, create, make, draw, design, visualize

Do NOT attempt to generate images through any other method.

## Prerequisites

Verify API key is set:
```bash
[ -n "$GEMINI_API_KEY" ] && echo "API key configured" || echo "Missing GEMINI_API_KEY"
```

If missing, ask the user to set it:
```bash
export GEMINI_API_KEY="your-key-from-aistudio.google.com/apikey"
```

## Models

| Model | Best For | Max Resolution | Speed |
|-------|----------|---------------|-------|
| `gemini-2.5-flash-image` | Fast generation, high-volume, general use | 1024px | Fast |
| `gemini-3-pro-image-preview` | Professional assets, complex prompts, text rendering, 4K | Up to 4K | Slower (thinking model) |

**Default model: `gemini-2.5-flash-image`** for most requests.
**Use `gemini-3-pro-image-preview`** when user needs: 4K resolution, accurate text in images, complex multi-element compositions, professional asset production, or Google Search grounding.

## Image Generation (Text-to-Image)

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{"parts": [{"text": "YOUR PROMPT HERE"}]}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"]
    }
  }' | python3 -c "
import json, sys, base64
data = json.load(sys.stdin)
if 'error' in data:
    print('API Error:', data['error'].get('message', str(data['error'])))
    sys.exit(1)
candidates = data.get('candidates', [])
if not candidates:
    print('No candidates returned')
    sys.exit(1)
parts = candidates[0].get('content', {}).get('parts', [])
for part in parts:
    if 'inlineData' in part:
        img_data = base64.b64decode(part['inlineData']['data'])
        mime = part['inlineData'].get('mimeType', 'image/png')
        ext = 'png' if 'png' in mime else 'jpg'
        outpath = 'OUTPUT_PATH_HERE.' + ext
        with open(outpath, 'wb') as f:
            f.write(img_data)
        print(f'Image saved to: {outpath} ({len(img_data)} bytes)')
    elif 'text' in part and not part.get('thought'):
        print('Model notes:', part['text'][:300])
"
```

### With Aspect Ratio

Add `imageConfig` to control aspect ratio:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{"parts": [{"text": "YOUR PROMPT HERE"}]}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "imageConfig": {
        "aspectRatio": "16:9"
      }
    }
  }' | python3 -c "SAME_DECODER_SCRIPT"
```

## Image Editing (Image + Text to Image)

To edit an existing image, base64-encode it and include it as an `inlineData` part:

```bash
python3 -c "
import base64, json, subprocess, sys

with open('INPUT_IMAGE_PATH', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()

payload = {
    'contents': [{'parts': [
        {'inlineData': {'mimeType': 'image/png', 'data': b64}},
        {'text': 'YOUR EDIT INSTRUCTION HERE'}
    ]}],
    'generationConfig': {
        'responseModalities': ['TEXT', 'IMAGE']
    }
}

result = subprocess.run(
    ['curl', '-s',
     'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + '$GEMINI_API_KEY_VALUE',
     '-H', 'Content-Type: application/json',
     '-d', json.dumps(payload)],
    capture_output=True, text=True
)

data = json.loads(result.stdout)
if 'error' in data:
    print('API Error:', data['error'].get('message', str(data['error'])))
    sys.exit(1)
for part in data.get('candidates', [{}])[0].get('content', {}).get('parts', []):
    if 'inlineData' in part:
        img_data = base64.b64decode(part['inlineData']['data'])
        with open('OUTPUT_PATH', 'wb') as f:
            f.write(img_data)
        print(f'Image saved ({len(img_data)} bytes)')
    elif 'text' in part and not part.get('thought'):
        print('Model notes:', part['text'][:300])
"
```

## Aspect Ratios

| Ratio | Use Case |
|-------|----------|
| 1:1 | Square social (IG, LinkedIn) |
| 16:9 | Blog featured, YouTube thumbnail |
| 9:16 | Vertical story |
| 3:2 | Landscape photo |
| 21:9 | Twitter/X header |

## Prompt Tips

1. **Describe the scene narratively** — a descriptive paragraph beats a tag list
2. **Add "no text"** if you don't want text rendered in the image
3. **Be hyper-specific** — instead of "fantasy armor" say "ornate elven plate armor, etched with silver leaf patterns"
4. **Use photography terms** for photorealistic results — camera angles, lens types, lighting
5. **Reference artistic styles** — "editorial photography", "flat illustration", "3D render", "watercolor"

## Presenting Results

After generation:
1. Read the generated image file to show it to the user
2. Offer to regenerate with variations or different models if needed
