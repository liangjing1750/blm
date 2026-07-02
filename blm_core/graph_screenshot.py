from __future__ import annotations

from urllib.parse import quote

from blm_core.docx import DocxImage
from blm_core.export_graphs import ExportGraph


def capture_graph_images(base_url: str, job_id: str, graphs: list[ExportGraph], *, timeout_ms: int = 8000) -> list[DocxImage]:
    """Capture graph DOM surfaces through the Angular export render page.

    The renderer page owns layout fidelity. This function only opens one graph per
    page, waits for the explicit ready flag, and screenshots the registered target.
    """
    if not graphs:
        return []
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:  # pragma: no cover - depends on optional local runtime
        raise RuntimeError("Playwright is not available for static graph export") from exc

    images: list[DocxImage] = []
    with sync_playwright() as playwright:
      browser = _launch_browser(playwright)
      try:
        page = browser.new_page(viewport={"width": 1800, "height": 1200}, device_scale_factor=2)
        for graph in graphs:
          url = f"{base_url.rstrip('/')}/export/render/{quote(job_id)}?graphId={quote(graph.id)}"
          page.goto(url, wait_until="networkidle", timeout=timeout_ms)
          page.wait_for_function("window.__BLM_EXPORT_READY__ === true", timeout=timeout_ms)
          locator = page.locator(graph.selector).first
          locator.wait_for(state="visible", timeout=timeout_ms)
          box = locator.bounding_box()
          if not box or box["width"] <= 0 or box["height"] <= 0:
            continue
          payload = locator.screenshot(type="png", timeout=timeout_ms)
          images.append(DocxImage(
              name=graph.filename,
              content_type="image/png",
              payload=payload,
              width=max(1, int(box["width"])),
              height=max(1, int(box["height"])),
          ))
      finally:
        browser.close()
    return images


def _launch_browser(playwright):
    try:
        return playwright.chromium.launch(channel="chrome", headless=True, timeout=3000)
    except Exception:
        return playwright.chromium.launch(headless=True, timeout=3000)
