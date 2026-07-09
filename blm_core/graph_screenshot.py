from __future__ import annotations

import math
from urllib.parse import quote

from blm_core.docx import DocxImage
from blm_core.export_graphs import ExportGraph

# 单图最大逻辑像素（超此尺寸则缩放渲染）
MAX_VIEWPORT_PX = 3840
# 视口 padding
VIEWPORT_PAD = 40
# 初始渲染视口（足够渲染框架和加载态即可）
INITIAL_VIEWPORT = {"width": 1400, "height": 900}
# device_scale_factor 普通屏即可
DEVICE_SCALE_FACTOR = 1


def capture_graph_images(
    base_url: str, job_id: str, graphs: list[ExportGraph], *, timeout_ms: int = 8000
) -> list[DocxImage]:
    """Capture graph DOM surfaces through the Angular export render page.

    Module intent: each graph is rendered on its own page (export render page
    hides all chrome). This function opens one graph per page load, waits for
    the explicit ready flag, measures the target element, adjusts the viewport
    to fit, and screenshots at the target's natural size.

    Scaling: if the graph bounding box exceeds MAX_VIEWPORT_PX, CSS scale is
    applied to fit the viewport and the image is captured at reduced resolution.
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
            for graph in graphs:
                image = _capture_single_graph(playwright, browser, base_url, job_id, graph, timeout_ms)
                if image:
                    images.append(image)
        finally:
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass
    return images


def _capture_single_graph(
    playwright, browser, base_url: str, job_id: str, graph: ExportGraph, timeout_ms: int
) -> DocxImage | None:
    """Render and screenshot one graph, returning None on failure."""
    page = None
    try:
        page = browser.new_page(viewport=INITIAL_VIEWPORT, device_scale_factor=DEVICE_SCALE_FACTOR)
        page.set_default_timeout(timeout_ms)

        url = f"{base_url.rstrip('/')}/export/render/{quote(job_id)}?graphId={quote(graph.id)}"
        page.goto(url, wait_until="networkidle", timeout=timeout_ms)
        page.wait_for_function("window.__BLM_EXPORT_READY__ === true", timeout=timeout_ms)

        locator = page.locator(graph.selector).first
        locator.wait_for(state="visible", timeout=timeout_ms)

        # 获取元素完整尺寸（含 overflow:visible 溢出部分）
        box = locator.bounding_box()
        if not box or box["width"] <= 0 or box["height"] <= 0:
            return None

        natural_w = max(1, int(box["width"]))
        natural_h = max(1, int(box["height"]))

        # 判断是否需要缩放
        if natural_w > MAX_VIEWPORT_PX or natural_h > MAX_VIEWPORT_PX:
            scale = min(MAX_VIEWPORT_PX / natural_w, MAX_VIEWPORT_PX / natural_h, 1.0)
            page.evaluate(
                """
                (args) => {
                  const el = document.querySelector(args.selector);
                  if (!el) return;
                  el.style.transform = `scale(${args.scale})`;
                  el.style.transformOrigin = 'top left';
                  el.style.width = `${args.naturalW}px`;
                  el.style.height = `${args.naturalH}px`;
                }
                """,
                {"selector": graph.selector, "scale": scale, "naturalW": natural_w, "naturalH": natural_h},
            )
            # 缩放后重新计算渲染尺寸
            render_w = max(1, int(natural_w * scale))
            render_h = max(1, int(natural_h * scale))
        else:
            render_w = natural_w
            render_h = natural_h
            scale = 1.0

        # 设置视口适配元素尺寸
        vp_w = min(MAX_VIEWPORT_PX, render_w + VIEWPORT_PAD * 2)
        vp_h = min(MAX_VIEWPORT_PX, render_h + VIEWPORT_PAD * 2)
        page.set_viewport_size({"width": max(800, vp_w), "height": max(600, vp_h)})

        # 重新获取 locator（DOM 可能已重排）
        updated_locator = page.locator(graph.selector).first
        updated_locator.wait_for(state="visible", timeout=timeout_ms)

        payload = updated_locator.screenshot(type="png", timeout=timeout_ms, animations="disabled")
        if not payload:
            return None

        # 返回截图时使用缩放前的自然尺寸，DOCX/MD 自行控制显示宽度
        return DocxImage(
            name=graph.filename,
            content_type="image/png",
            payload=payload,
            width=natural_w,
            height=natural_h,
        )

    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Graph screenshot failed: graph=%s error=%s", graph.id, exc
        )
        return None
    finally:
        if page:
            try:
                page.close()
            except Exception:
                pass


def _launch_browser(playwright):
    try:
        return playwright.chromium.launch(channel="chrome", headless=True, timeout=3000)
    except Exception:
        return playwright.chromium.launch(headless=True, timeout=3000)
