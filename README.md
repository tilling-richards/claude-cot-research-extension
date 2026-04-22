# claude-cot-research-extension

Chrome extension and data pipeline for annotating Claude CoT text with:

- expected behavior citations from system-card documents
- potentially interesting behavior flags for human review

## Project Layout

- `extension/`: MV3 extension source
- `tools/`: ingestion and index generation scripts
- `docs/`: architecture and changelog for long-term continuity

## Quick Start

1. Load extension:
   - Open Chrome `chrome://extensions`
   - Enable Developer mode
   - Click "Load unpacked" and choose `extension/`
2. Open options page and set:
   - `GitHub Pages Base URL` (defaults to your repo pages URL)
   - optional LLM assist toggles
3. Open Claude web app and expand CoT sections to see annotations.

## Data Source (GitHub Pages)

The extension expects:

- `/index/manifest.json`
- `/index/modelCatalog.json`
- `/index/cardManifest.json`

## Development Notes

- Classifier is hybrid and configurable (`rules`, `rubric`, optional `llmAssist`).
- Annotation output is observational and should not be interpreted as proof of model intent.
