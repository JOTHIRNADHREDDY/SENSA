# Meta model integrations

SAM 3.1 provides sampled localization and segmentation. Muse Spark 1.3 provides scene interpretations and candidate activities. The actual HTTP adapters remain in `backend/app/providers.py`, with initial and targeted source processing in `initial_analysis.py` and `inspection.py`. Server-side credentials are never passed to the frontend.

Uploads decode locally. Meta analysis requires explicit authorization, bounded frames/requests, configured credentials, and schema/reference validation. Failed or unknown usage remains recorded. Repeating a paid retry requires a new authorized request. Model output, geometry and source hashes are retained in private evidence storage.

The approved synthetic v8 snapshot preserves 37 successful SAM records, 10 successful Spark records, two blocked Spark records, and deterministic association records. Its indexed discovery made zero new provider requests. The static reviewer reads the approved snapshot without credentials or inference. Fixture annotations are used only for generated sources with a matching trusted fixture hash.

SENSA applies continuity-safe anonymous associations, heuristic motion/visibility checks and event aggregation. Scores are not calibrated probabilities. A visual stock change, inventory discrepancy, possible removal and human conclusion remain distinct. Muse Wonder is an existing optional reasoning slot and was unused in the approved demonstration.
