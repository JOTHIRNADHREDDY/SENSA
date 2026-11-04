# Review SENSA with saved evidence or a real recording

## Offline reviewer

From a clean clone, run `docker compose --profile reviewer up -d --build reviewer` and open [the local reviewer](http://127.0.0.1:3002/). The initial image build may pull dependencies. Once running, review uses only local assets and makes zero Meta requests. A standalone static bundle can also be built for root-path hosting. [Static hosting instructions](../docs/DEPLOYMENT.md#static-hosting-on-cloudflare-pages)

Search for `possible_carry` or a camera name. Select an episode or a timestamp in an anonymous track to seek the original synthetic clip. Choose a pinned evidence frame to inspect its saved boxes, observation IDs, model runs, frame hash and source registration. Compare the shelf before and after samples. The 6-to-5 change in visible detections is separate from the synthetic inventory reference. The result remains unresolved and there is no human conclusion.

The reviewer serves the approved v8 [summary](../reports/SENSA_Hackathon_Investigation_Summary_FINAL.pdf), [appendix](../reports/SENSA_Hackathon_Technical_Evidence_Appendix_FINAL.pdf) and [portable JSON](../reports/SENSA_Hackathon_Report_FINAL.json) as shipped. The public service has no investigator API or credential. [Deployment and native Caddy option](../docs/DEPLOYMENT.md)

## Real-video evaluation

Use an authorized source from the [video access guide](videos/README.md). Start the investigator app, upload the recording in **Video library**, and wait for frames to appear. Ordinary uploads decode locally first and may show a partial status until model analysis is authorized. Open the original recording, seek to a timestamp, and inspect its sampled frames. Create an investigation and select the recording.

For the parking-lot sample, try “Find visible people and vehicles, describe their movements, and mark uncertain intervals.” For authorized UFPR footage, try “Show visible pedestrian movements and breaks in tracking across the selected recording.” For authorized VIRAT ground footage, try “Find visible interactions around vehicles and show the source frames that support each candidate.” Use anonymous tracks and avoid inferring intent, identity, or wrongdoing.

Start with **Review existing indexed evidence** to inspect what is already available. To reproduce the live parking-lot smoke test, use the supported bounded inspection script. It sends up to three requests only when explicitly authorized and writes its results under ignored `tmp/video-smoke/`.

```powershell
.venv/Scripts/python.exe scripts/video_smoke.py --video demo/videos/parking-lot.webm --authorize-meta
```

Inspect the job's processed interval, person/car localization and available masks, Spark interpretations, anonymous tracks, episode timeline, and source-linked PDF and JSON. The smoke run requests 0–8 seconds at 0.5 fps. The rest of the recording remains outside that Meta inspection, and early camera motion or small objects can affect detections. Outputs are sampled and uncertain. UFPR and VIRAT are candidates and their clips were not evaluated here.

CI uses a shipped synthetic MP4 as an ordinary upload to check the full ingestion, playback ranges, frame provenance and report path without a provider key. The offline reviewer separately contains the saved synthetic model output. [Observed results](../docs/REAL_VIDEO_QA.md)
