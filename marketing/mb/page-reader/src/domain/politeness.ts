// Robots.txt rules for one crawler name: the longest matching rule wins, Allow beats Disallow on a tie.
export function isAllowed(robotsTxt: string, agentName: string, path: string): boolean {
  const rules: { allow: boolean; prefix: string }[] = [];
  let applies = false;
  let sawAgentLine = false;
  for (const raw of robotsTxt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const name = key?.trim().toLowerCase() ?? '';
    if (name === 'user-agent') {
      if (!sawAgentLine) applies = false;
      sawAgentLine = true;
      if (value === '*' || value.toLowerCase() === agentName.toLowerCase()) applies = true;
    } else if (name === 'allow' || name === 'disallow') {
      sawAgentLine = false;
      if (applies && value !== '') rules.push({ allow: name === 'allow', prefix: value });
    }
  }
  const hits = rules.filter((r) => path.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length || Number(b.allow) - Number(a.allow));
  return hits[0]?.allow ?? true;
}

// A page that is really a bot check, whatever status it came with.
export const looksLikeChallenge = (status: number, html: string): boolean =>
  status === 403 || status === 429 || (html.length < 20_000 && /Just a moment\.\.\.|cf-chl|Attention Required! \| Cloudflare|captcha/i.test(html));
