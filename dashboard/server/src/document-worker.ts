import mammoth from 'mammoth';

// Plain text only: uploaded HTML, links and embedded objects are never executed.
try {
  const result = await mammoth.extractRawText({ path: process.argv[2] });
  process.stdout.write(result.value);
} catch {
  process.exitCode = 1;
}
