# Real-video sources

The [manifest](../video_manifest.json) records each source’s origin, attribution, terms and known file metadata. Downloaded recordings belong in this ignored directory. Size and SHA-256 are left unspecified when no individual file was acquired.

**Parking-lot CCTV.** Commons credits Supercircuits and claims public-domain status as an automated recording. The page cautions that many jurisdictions lack clear precedent. Open the original-file link and save it locally as `parking-lot.webm`, or use the checksum-verifying downloader. The project links to the original and leaves the 67,736,771-byte video out of Git, release assets and reviewer containers. [Wikimedia Commons source and terms](https://commons.wikimedia.org/wiki/File:BLK-HDPTZ12_Security_Camera_Parking_Lot_Surveillance_Video.webm)

```powershell
.venv/Scripts/python.exe scripts/download_demo_videos.py --source parking-lot --acknowledge-caveat
```

**UFPR-Planalto801.** The lab provides a link to the original footage and requires registration for its annotations. The annotation terms specify eligible academic, non-commercial research. Follow the lab’s instructions and verify permission for the chosen clip and intended use. Cite de Oliveira and colleagues, VISAPP 2024, when using the dataset. [UFPR access and citation](https://web.inf.ufpr.br/vri/databases/ufpr-planalto801/)

**VIRAT ground cameras.** Follow the dataset access page and accept the usage agreement yourself before obtaining any ground-camera clip. The agreement limits onward distribution. The separate aerial collection has different terms. Cite Oh and colleagues, CVPR 2011, with the release version. [VIRAT access](https://viratdata.org/) · [Ground-camera agreement](https://viratdata.org/resources/VIRAT-Video-Data-Set-Protection-Agreement-1-4-11.pdf)

For a manually obtained MP4 or WebM, record its exact filename, byte size, SHA-256, source version, attribution and applicable conditions in your private test receipt. The [review and upload guide](../README.md) lists example prompts and verification steps.
