import json

import httpx
import pytest

from app.providers import AnalysisOutput, Answer, Claim, MetaProvider, ProviderError, parse_sam, validate_claims

MANIFEST = [{"id": "stored-frame", "timestamp": 4.25}]
VALID = "<0f>3<|box;x1=1;y1=2;x2=9;y2=12;w=20;h=20|><|mask;x=0;y=0;data=11,9,~test-payload|>"


def test_frame_analysis_covers_the_end_of_the_source_within_budget(tmp_path, monkeypatch):
    path = tmp_path / "frame.jpg"
    path.write_bytes(b"test-only HTTP image fixture")
    frames = [{"id": f"frame-{i}", "timestamp": i * 2, "path": str(path)} for i in range(13)]
    provider = MetaProvider("unit-test-key")
    captured = []

    def respond(content, schema):
        captured.extend(content)
        return AnalysisOutput(observations=[]), {"usage": {}}

    monkeypatch.setattr(provider, "respond", respond)
    _, metadata = provider.analyze_frames(frames)
    assert len([c for c in captured if c["type"] == "input_image"]) == 8
    assert metadata["source_frame_ids"][0] == "frame-0"
    assert metadata["source_frame_ids"][-1] == "frame-12"
    assert len(set(metadata["source_frame_ids"])) == 8
    assert metadata["source_timestamps"][-1] == 24


def test_sam_source_mapping_and_optional_confidence():
    rows = parse_sam(VALID, MANIFEST, 20, 20)
    assert rows[0]["timestamp"] == 4.25
    assert rows[0]["track_id"] == "3"
    assert rows[0]["frame_id"] == "stored-frame"
    assert rows[0]["box"] == [0.05, 0.1, 0.5, 0.65]
    assert "confidence" not in rows[0]


@pytest.mark.parametrize(
    "output",
    [
        VALID.replace("<0f>", "<99f>"),
        VALID.replace("x2=9", "x2=99"),
        VALID.replace("w=20", "w=40"),
        VALID.replace("<0f>", ""),
        VALID.replace("data=11,9,~", "data=invalid"),
        VALID + "junk",
    ],
)
def test_sam_rejects_malformed_geometry(output):
    with pytest.raises(ProviderError):
        parse_sam(output, MANIFEST, 20, 20)


def test_sam_zero_matches():
    assert parse_sam("", MANIFEST, 20, 20) == []


def test_claim_references_are_case_scoped():
    good = Answer(
        claims=[Claim(text="A visible observation", category="observed", evidence_ids=["e1"])],
        uncertainty="Intervals unknown",
    )
    assert validate_claims(good, [{"id": "e1"}]) == good
    with pytest.raises(ProviderError):
        validate_claims(good, [{"id": "other-case-evidence"}])
    with pytest.raises(ProviderError):
        validate_claims(
            Answer(claims=[Claim(text="Uncited", category="observed", evidence_ids=[])], uncertainty=""), []
        )


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500])
def test_provider_failures_are_not_success(status):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(status, json={"error": "secret payload must not leak"})

    provider = MetaProvider("unit-test-key", httpx.MockTransport(respond))
    with pytest.raises(ProviderError) as error:
        provider.discover()
    assert "secret" not in str(error.value)
    assert len(calls) == 1


def test_missing_credentials():
    with pytest.raises(ProviderError, match="not configured"):
        MetaProvider("").discover()


@pytest.mark.parametrize("payload", [b"not JSON", b"[]", b"null"])
def test_invalid_json_catalogue_is_a_safe_failure(payload):
    provider = MetaProvider("unit-test-key", httpx.MockTransport(lambda r: httpx.Response(200, content=payload)))
    with pytest.raises(ProviderError, match="Malformed"):
        provider.discover()


@pytest.mark.parametrize("cleanup_status", [200, 500])
def test_segment_video_contract_usage_and_cleanup(tmp_path, cleanup_status):
    path = tmp_path / "analysis.mp4"
    path.write_bytes(b"HTTP test fixture, not real media")
    calls = []

    def respond(request):
        calls.append((request.method, request.url.path))
        if request.url.path.endswith("/files"):
            return httpx.Response(200, json={"id": "file-test"})
        if request.method == "DELETE":
            return httpx.Response(cleanup_status, json={"deleted": cleanup_status == 200})
        data = [
            {"type": "response.output_text.delta", "delta": VALID},
            {
                "type": "response.completed",
                "response": {"id": "response-test", "usage": {"video_frames_processed": 50}},
            },
        ]
        return httpx.Response(200, content="\n".join("data: " + json.dumps(d) for d in data))

    provider = MetaProvider("unit-test-key", httpx.MockTransport(respond))
    rows, metadata = provider.segment_video(path, MANIFEST, 20, 20)
    assert rows[0]["timestamp"] == 4.25
    assert metadata["billable_frames_minimum"] == 50
    assert metadata["usage"]["video_frames_processed"] == 50
    assert metadata["remote_file_cleanup"].startswith("succeeded" if cleanup_status == 200 else "failed")
    assert calls == [("POST", "/v1/files"), ("POST", "/v1/responses"), ("DELETE", "/v1/files/file-test")]


def test_valid_reasoning_is_reference_checked():
    answer = {
        "claims": [{"text": "A stored observation", "category": "observed", "evidence_ids": ["e1"]}],
        "uncertainty": "Unobserved intervals remain unknown",
    }
    provider = MetaProvider(
        "unit-test-key",
        httpx.MockTransport(
            lambda r: httpx.Response(
                200,
                json={
                    "id": "test-response",
                    "status": "completed",
                    "output": [{"content": [{"type": "output_text", "text": json.dumps(answer)}]}],
                },
            )
        ),
    )
    result, _ = provider.interpret_evidence("Summarize evidence", [{"id": "e1"}])
    assert result.claims[0].evidence_ids == ["e1"]


def test_timeout_safe_error():
    def respond(request):
        raise httpx.ReadTimeout("sensitive URL", request=request)

    with pytest.raises(ProviderError, match="timed out"):
        MetaProvider("unit-test-key", httpx.MockTransport(respond)).discover()


def test_catalogue_and_malformed_response():
    provider = MetaProvider(
        "unit-test-key", httpx.MockTransport(lambda r: httpx.Response(200, json={"data": [{"id": "sam-3.1"}]}))
    )
    assert provider.discover() == {"sam-3.1"}
    provider = MetaProvider("unit-test-key", httpx.MockTransport(lambda r: httpx.Response(200, json={"invalid": []})))
    with pytest.raises(ProviderError, match="Malformed"):
        provider.discover()


def test_malformed_reasoning_output_and_wrong_case():
    for text in (
        "not json",
        json.dumps(
            {
                "claims": [{"text": "Unsupported", "category": "observed", "evidence_ids": ["wrong-case"]}],
                "uncertainty": "",
            }
        ),
    ):
        provider = MetaProvider(
            "unit-test-key",
            httpx.MockTransport(
                lambda r: httpx.Response(
                    200,
                    json={
                        "id": "test-response",
                        "status": "completed",
                        "output": [{"content": [{"type": "output_text", "text": text}]}],
                    },
                )
            ),
        )
        with pytest.raises(ProviderError):
            provider.interpret_evidence("summarize", [{"id": "known-evidence"}])


def test_interrupted_sam_preserves_unknown_usage_and_cleanup(tmp_path):
    path = tmp_path / "bounded.mp4"
    path.write_bytes(b"explicit HTTP transport fixture")

    def transport(request):
        if request.url.path.endswith("/files"):
            return httpx.Response(200, json={"id": "file-interrupted-test"})
        if request.method == "DELETE":
            return httpx.Response(500, json={"error": "fixture"})
        raise httpx.ReadTimeout("transport fixture", request=request)

    provider = MetaProvider("unit-test-key", httpx.MockTransport(transport))
    with pytest.raises(ProviderError) as error:
        provider.segment_video(path, MANIFEST, 20, 20)
    assert error.value.details["usage_status"] == "unknown"
    assert error.value.details["completion_status"] == "unknown"
    assert error.value.details["remote_file_cleanup"].startswith("failed")
    assert "cost_usd" not in error.value.details


def test_invalid_masks_do_not_supply_shape_or_identity_features():
    from app.vision import mask_shape

    assert mask_shape("<|mask;x=0;y=0;data=2,2,!invalid|>") is None
    assert mask_shape("<|mask;x=0;y=0;data=20000,20000,!invalid|>") is None
