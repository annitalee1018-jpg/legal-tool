export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: '缺少 url 参数' });
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(url);
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: '无效的 URL 格式' });
  }

  const allowedDomains = [
    'eur-lex.europa.eu',
    'leginfo.legislature.ca.gov',
    'uscode.house.gov',
    'www.hhs.gov',
    'sso.agc.gov.sg',
    'www.legislation.gov.uk',
    'legislation.gov.uk',
    'www.federalregister.gov',
    'www.law.cornell.edu',
    'gdpr-info.eu',
    'ico.org.uk',
    'www.ico.org.uk',
    'pdpc.gov.sg',
    'www.pdpc.gov.sg',
    'mom.gov.sg',
    'www.mom.gov.sg',
    'ftc.gov',
    'www.ftc.gov',
    'sec.gov',
    'www.sec.gov',
  ];

  const parsedUrl = new URL(targetUrl);
  const domain = parsedUrl.hostname;
  const isAllowed = allowedDomains.some(d => domain === d || domain.endsWith('.' + d));

  if (!isAllowed) {
    return res.status(403).json({
      error: `不支持该网站域名：${domain}`,
      hint: '目前支持欧盟EUR-Lex、美国法典、新加坡AGC、英国legislation.gov.uk等官方法律网站'
    });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `网站返回错误：HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return res.status(415).json({ error: '该页面不是 HTML 格式，暂不支持' });
    }

    const html = await response.text();

    // Extract meaningful text from HTML
    let text = html
      // Remove scripts and styles
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      // Keep block-level tag line breaks
      .replace(/<\/?(p|div|br|li|h[1-6]|section|article|tr|td|th)[^>]*>/gi, '\n')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&lsquo;/g, ''')
      .replace(/&rsquo;/g, ''')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      // Clean up whitespace
      .replace(/\t/g, ' ')
      .replace(/ {3,}/g, '  ')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    // Limit to 8000 chars to avoid token overflow
    if (text.length > 8000) {
      text = text.slice(0, 8000) + '\n\n[内容已截取前8000字符，如需完整内容请缩小抓取范围]';
    }

    return res.status(200).json({ text, url: targetUrl, domain });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(408).json({ error: '请求超时，该网站响应太慢' });
    }
    return res.status(500).json({ error: '抓取失败：' + err.message });
  }
}
