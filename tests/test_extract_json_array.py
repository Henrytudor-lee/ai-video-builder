import json
import os
import sys

sys.path.insert(0, "/Volumes/world/素材库/video-prompt-builder")
try:
    import server as server_mod
    extract_json_array = server_mod.extract_json_array
except Exception as e:
    print(f"import server failed: {e}", file=sys.stderr)
    raise

FIXTURE_PATH = "/Volumes/world/素材库/video-prompt-builder/tests/fixtures/extract_json_array_real_raw.txt"

def test_real_raw_parses():
    with open(FIXTURE_PATH) as f:
        raw = f.read()
    result = extract_json_array(raw)
    assert isinstance(result, list), f"expected list, got {type(result)}"
    assert len(result) >= 3, f"expected >= 3 ideas, got {len(result)}"
    for i, idea in enumerate(result):
        assert "title" in idea, f"idea {i} missing title"
        assert "logline" in idea, f"idea {i} missing logline"
        assert "full_script" in idea, f"idea {i} missing full_script"
    print(f"OK: parsed {len(result)} ideas from real raw")

def test_simple_valid_array():
    text = '[{"a":1},{"a":2}]'
    assert extract_json_array(text) == [{"a": 1}, {"a": 2}]
    print("OK: simple valid array")

def test_with_think_block():
    text = '<think>some reasoning</think>\n[{"a":1},{"a":2}]'
    assert extract_json_array(text) == [{"a": 1}, {"a": 2}]
    print("OK: with think block")

def test_with_markdown_fence():
    text = '```json\n[{"a":1}]\n```'
    assert extract_json_array(text) == [{"a": 1}]
    print("OK: with markdown fence")

def test_with_embedded_quote_chinese_content():
    text = '[{"title":"\u738b\u8bb0","full_script":"\u724c\u7167\u4ece\"\u738b\u8bb0\"\u53d8\u6210\u4e86\"\u8001\u738b\""}]'
    result = extract_json_array(text)
    assert len(result) == 1
    assert result[0]["title"] == "\u738b\u8bb0"
    assert "\u738b\u8bb0" in result[0]["full_script"]
    assert "\u8001\u738b" in result[0]["full_script"]
    print("OK: embedded quotes in chinese content")

def test_with_embedded_quote_english_unescaped():
    text = '[{"title":"book","full_script":"he said \"hi\" then left"}]'
    result = extract_json_array(text)
    assert "hi" in result[0]["full_script"]
    print("OK: unescaped english quote fixed")

def test_control_chars_in_string():
    text = '[{"a":"line1\nline2","b":"\t"}]'
    result = extract_json_array(text)
    assert result[0]["a"] == "line1\nline2"
    assert result[0]["b"] == "\t"
    print("OK: control chars escaped in string")

def test_think_then_garbage_then_array():
    text = '<think>blah</think>\nrandom preamble\n[{"x":1}] more garbage'
    assert extract_json_array(text) == [{"x": 1}]
    print("OK: think + preamble + array + suffix")

if __name__ == "__main__":
    test_simple_valid_array()
    test_with_think_block()
    test_with_markdown_fence()
    test_with_embedded_quote_chinese_content()
    test_with_embedded_quote_english_unescaped()
    test_control_chars_in_string()
    test_think_then_garbage_then_array()
    test_real_raw_parses()
    print("\nALL TESTS PASSED")
