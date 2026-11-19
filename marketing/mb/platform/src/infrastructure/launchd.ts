export interface LaunchdJob {
  readonly label: string;
  readonly programArguments: readonly string[];
  // Start on a fixed interval (job runners), or keep one program running and restart it if it stops (the web app).
  readonly intervalSeconds?: number;
  readonly keepAlive?: boolean;
  readonly logPath: string;
  readonly workingDirectory?: string;
}

const escapeXml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// launchd starts the job runner on a fixed interval; the runner itself decides what is due.
export function renderLaunchdPlist(job: LaunchdJob): string {
  const args = job.programArguments.map((a) => `    <string>${escapeXml(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${escapeXml(job.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${job.intervalSeconds === undefined ? '' : `  <key>StartInterval</key><integer>${String(job.intervalSeconds)}</integer>\n`}${job.keepAlive === true ? '  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n' : ''}${job.workingDirectory === undefined ? '' : `  <key>WorkingDirectory</key><string>${escapeXml(job.workingDirectory)}</string>\n`}  <key>StandardOutPath</key><string>${escapeXml(job.logPath)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(job.logPath)}</string>
</dict>
</plist>
`;
}
