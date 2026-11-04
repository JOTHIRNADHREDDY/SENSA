# Synthetic warehouse dataset v1

Created entirely by `backend/app/demo.py`, using Pillow geometric rendering and an FFmpeg H.264 encoder. Four fictional views: Loading dock, Storage aisle A, Packing floor, East exit. No real person, camera, location or recording was captured; no third-party photographs or model-generated evidence was used.

Source and generated fixtures are dedicated to the public domain under CC0-1.0. Generated media live in ignored `data/<uuid>/`, not source control. The fixture manifest stores the exact SHA-256 and animation version and is accepted only for server-generated assets flagged synthetic.

Each source has a no-person segment at [0,2), a visible animated person at [2,10], and no visible person after 10 seconds. At sampled t=2 the person appears; t=4 movement is annotated; t=8 the left box edge is ≥0.55 under the explicit restricted-zone rule. Authorization, identity, intent and activity between sampled instants are not inferred.

These expected annotations can test ingestion, timestamp linking, retrieval, citation integrity and review. They do not measure any learned model's detection or reasoning accuracy.
