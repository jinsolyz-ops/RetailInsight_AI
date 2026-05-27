import re
import json
import subprocess
from pathlib import Path


HTML_FILE = "index.html"
OUTPUT_FILE = "posts.json"


def extract_js_array(html: str, var_name: str) -> str:
    pattern = rf"const\s+{var_name}\s*=\s*(\[\s*.*?\s*\]);"
    match = re.search(pattern, html, re.DOTALL)

    if not match:
        raise ValueError(f"{var_name} 배열을 찾지 못했습니다.")

    return match.group(1)


def js_array_to_json(js_array: str):
    js_code = f"""
    const data = {js_array};
    console.log(JSON.stringify(data));
    """

    result = subprocess.run(
        ["node", "-e", js_code],
        capture_output=True,
        text=True,
        encoding="utf-8"
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr)

    return json.loads(result.stdout)


def normalize_post(post: dict, brand: str) -> dict:
    return {
        "brand": brand,
        "title": post.get("title"),
        "site": post.get("site"),
        "keyword": post.get("keyword"),
        "post_date": post.get("date"),
        "url": post.get("url"),
        "content": post.get("content"),
        "views": post.get("views"),
        "comments": post.get("comments"),
    }


def main():
    html = Path(HTML_FILE).read_text(encoding="utf-8")

    cu_js = extract_js_array(html, "cuPosts")
    gs_js = extract_js_array(html, "gsPosts")

    cu_posts = js_array_to_json(cu_js)
    gs_posts = js_array_to_json(gs_js)

    posts = []

    posts.extend(normalize_post(post, "cu") for post in cu_posts)
    posts.extend(normalize_post(post, "gs") for post in gs_posts)

    Path(OUTPUT_FILE).write_text(
        json.dumps(posts, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"완료: {len(posts)}개 게시글을 {OUTPUT_FILE}로 저장했습니다.")


if __name__ == "__main__":
    main()