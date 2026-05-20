export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: '缺少 url 参数' });

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
    'agc.gov.sg',
    'www.legislation.gov.uk',
    'legislation.gov.uk',
    'www.federalregister.gov',
    'www.law.cornell.edu',
    'law.cornell.edu',
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
    'www.mas.gov.sg',
    'mas.gov.sg',
  ];

  const parsedUrl = new URL(targetUrl);
  const domain = parsedUrl.hostname;
  const isAllowed = allowedDomains.some(d => domain === d || domain.endsWith('.' + d));

  if (!isAllowed) {
    return res.status(403).json({
      error: `不支持该网站域名：${domain}`,
      hint: '目前支持欧盟EUR-Lex、美国法典、新加坡AGC/MAS、英国legislation.gov.uk等官方法律网站'
    });
  }

  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  ];
  const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': `https://${domain}/`,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `网站返回错误：HTTP ${response.status}，该网站可能有访问限制` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return res.status(415).json({ error: '该页面不是 HTML 格式，暂不支持' });
    }

    const html = await response.text();

    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<\/?(p|div|br|li|h[1-6]|section|article|tr|td|th)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
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
      .replace(/&lsquo;/g, '\u2018')
      .replace(/&rsquo;/g, '\u2019')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/\t/g, ' ')
      .replace(/ {3,}/g, '  ')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    if (text.length > 8000) {
      text = text.slice(0, 8000) + '\n\n[内容已截取前8000字符]';
    }

    return res.status(200).json({ text, url: targetUrl, domain });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(408).json({ error: '请求超时，该网站响应太慢' });
    }
    return res.status(500).json({ error: '抓取失败：' + err.message });
  }
}
