"""Web 获取工具 — HTTP GET + HTML→文本 + 超时重试。"""
import re, time
from urllib.request import Request, urlopen
from urllib.error import URLError
from blm_ai.kernel.tool import Tool, ToolContext

class WebFetchTool(Tool):
    name = 'web_fetch'
    description = 'Fetch URL content. HTML is converted to plain text.'
    parameters = {'type':'object','properties':{'url':{'type':'string'}},'required':['url']}
    read_only = True

    async def execute(self, args: dict, ctx: ToolContext) -> str:
        url = args.get('url','')
        if not url.startswith(('http://','https://')): return 'Error: URL must start with http:// or https://'
        for attempt in range(3):
            try:
                req = Request(url, headers={'User-Agent':'BLM-Agent/1.0'})
                with urlopen(req, timeout=15) as r:
                    data = r.read(); ct = r.headers.get('Content-Type','')
                    text = self._html2text(data.decode('utf-8','replace')) if 'html' in ct else data.decode('utf-8','replace')
                    return text[:50000]
            except URLError as e:
                if attempt == 2: return f'Error fetching URL: {e}'
                time.sleep(2**attempt)
            except Exception as e:
                return f'Error: {e}'

    @staticmethod
    def _html2text(html: str) -> str:
        for tag in ('script','style'): html = re.sub(f'<{tag}[^>]*>.*?</{tag}>', '', html, flags=re.DOTALL|re.I)
        html = re.sub(r'<[^>]+>',' ', html)
        for e,c in [('&nbsp;',' '),('&amp;','&'),('&lt;','<'),('&gt;','>'),('&quot;','"')]: html = html.replace(e,c)
        return re.sub(r'\s+',' ', html).strip()
