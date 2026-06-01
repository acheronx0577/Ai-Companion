# Piper voice models (local, free)

WakuWaku loads ONNX files from this folder. They are **not** committed to git (large binaries).

## Download all app voices

From the project root with your venv active:

```bash
python scripts/download_piper_voices.py
```

Or:

```bash
npm run download:piper-voices
```

Remove old/unused models:

```bash
npm run cleanup:piper-voices
```

## Included languages (Piper)

| Language | Voice ID |
|----------|----------|
| English (US) | `en_US-hfc_female-medium` |
| Chinese | `zh_CN-huayan-medium` |
| Vietnamese | `vi_VN-25hours_single-low` |

Device (browser) TTS is used for **Japanese** when Piper is installed.

## Performance

- Models are **not** loaded at startup. The first TTS request for a language loads that ONNX file (~1–3 seconds).
- Set `PIPER_MAX_LOADED_VOICES=1` (default) to keep only one model in RAM at a time.
