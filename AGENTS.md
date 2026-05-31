<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Safety Rules (custom)

- If your reasoning becomes repetitive or you detect a loop, immediately stop the current reasoning and resend the same user request from the beginning.
- If output becomes excessively long or appears stuck, restart the task by reprocessing the original user request.
- Never output chain-of-thought or internal reasoning.
- If uncertain or stuck, restart the task instead of continuing with partial or repetitive output.
- Avoid generating placeholder text such as "thinking...", "processing...", or repeated filler.
