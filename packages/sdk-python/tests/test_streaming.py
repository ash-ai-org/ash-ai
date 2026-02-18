"""Unit tests for SSE stream parsing."""

from ash_sdk.streaming import parse_sse_lines, MessageEvent, ErrorEvent, DoneEvent


def test_parse_message_event():
    lines = [
        'event: message',
        'data: {"type":"assistant","message":{"content":"Hello"}}',
        '',
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert len(events) == 1
    assert isinstance(events[0], MessageEvent)
    assert events[0].type == "message"
    assert events[0].data["type"] == "assistant"
    assert events[0].data["message"]["content"] == "Hello"


def test_parse_error_event():
    lines = [
        'event: error',
        'data: {"error":"Something went wrong"}',
        '',
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert len(events) == 1
    assert isinstance(events[0], ErrorEvent)
    assert events[0].error == "Something went wrong"


def test_parse_done_event():
    lines = [
        'event: done',
        'data: {"sessionId":"abc-123"}',
        '',
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert len(events) == 1
    assert isinstance(events[0], DoneEvent)
    assert events[0].session_id == "abc-123"


def test_parse_multiple_events():
    lines = [
        'event: message',
        'data: {"type":"assistant","message":{"content":"A"}}',
        '',
        'event: message',
        'data: {"type":"assistant","message":{"content":"B"}}',
        '',
        'event: done',
        'data: {"sessionId":"s1"}',
        '',
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert len(events) == 3
    assert isinstance(events[0], MessageEvent)
    assert isinstance(events[1], MessageEvent)
    assert isinstance(events[2], DoneEvent)


def test_skip_invalid_json():
    lines = [
        'event: message',
        'data: not-json',
        '',
        'event: done',
        'data: {"sessionId":"s1"}',
        '',
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert len(events) == 1
    assert isinstance(events[0], DoneEvent)


def test_ignore_comment_and_empty_lines():
    lines = [
        ': this is a comment',
        '',
        'event: message',
        'data: {"type":"assistant","message":{"content":"Hi"}}',
        '',
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert len(events) == 1
    assert events[0].data["message"]["content"] == "Hi"
