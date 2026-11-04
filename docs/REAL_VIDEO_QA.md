# Real-video and offline review verification

SENSA’s public source remains on `main`. This update adds a verified Wikimedia download manifest, a bounded video smoke tool, CI ingestion against an approved synthetic MP4, and evidence controls in the offline reviewer. The approved v8 PDF and JSON bytes remain intact. [Demo workflow](../demo/README.md) · [Dataset access](../demo/videos/README.md)

## Parking-lot run

The original Wikimedia WebM was acquired directly from its source. Its SHA-256 is `ff14641c693dbd1e78b1d22042876b5d3a4068c3301be8d07e504dd592debfaa`. The 67,736,771-byte recording is 316.71 seconds, VP9, 1920 × 1080 at 30 fps. The source page’s public-domain claim has a jurisdictional caveat. The footage, model results and test report are kept in the local workspace. [Commons source](https://commons.wikimedia.org/wiki/File:BLK-HDPTZ12_Security_Camera_Parking_Lot_Surveillance_Video.webm)

| Check | Result |
| --- | --- |
| Upload, file signature, source hash and extraction | PASS. 23 initial frames, 27 total after targeted inspection. |
| Playback and seeking transport | PASS. Two HTTP 206 ranges match original bytes. |
| Native image provenance | PASS. Representative PNGs decode and match their source and frame hashes. |
| SAM 3.1 localization and masks | PASS. Person and car requests succeeded. A stored mask decoded to a PNG with nonempty alpha and matching evidence hash. |
| Muse Spark 1.3 interpretation | PASS. One request succeeded. |
| Model sampling | 0–8 seconds at 0.5 fps. Five native inspection frames, three provider requests, and no automatic paid retry. Remaining footage is outside the inspection. |
| Anonymous associations and episodes | 82 stored detections, 1 person track, 16 object tracks, 10 candidate episodes and 15 event records. Tracks are sampled associations and counts are not physical-object ground truth. |
| Existing-index discovery and report | PASS. Zero additional provider requests. Portable JSON contains 10 episodes, 82 resolved observations and zero unavailable observation IDs. Summary PDF exported. Human conclusion is empty. |

The smoke script initially assumed upload status `succeeded`, prefixed already rooted evidence URLs with a second `/api`, and treated the frame map as a list. The corrected run reused the original upload and saved inspection through the same request key and completed the checks with exit 0. UFPR and VIRAT footage was neither acquired nor tested.

## Reviewer and reproducibility

The offline reviewer reads the approved v8 JSON and serves the shipped synthetic clips and native images. It offers episode search, anonymous track timelines, source seeking, detection boxes, frame/model provenance and the accepted shelf comparison. Local HTTP checks passed for report and media bytes, ranges, denied writes, absent investigator API and blocked real-video downloads. Local visual browser automation was blocked by Work settings.

The release validator passed with report `45c9e337-8fef-4e49-9588-ccb8561c07c0`, case `d2d7067b-7d93-4fd4-8d2d-590a4fc27515` and canonical snapshot SHA-256 `ce4a3e8f37bc26e0608215c6f3fc9cf091419dba64c3cbf55625059df99457f8`. It verified all 442 observations, 13 episodes, 94 episode support IDs and four exact images per PDF. The accepted synthetic comparison remains unresolved.

The local two-worker launch and synthetic upload smoke passed. The Docker CI smoke uses the same approved synthetic MP4 and never needs a Meta key. Public HTTPS service deployment requires an owner-provided host and domain. [Deployment and storage procedures](DEPLOYMENT.md)
