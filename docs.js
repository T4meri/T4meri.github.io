const base = (window.SPARK_API_BASE || location.origin).replace(/\/+$/, '');
const target = document.getElementById('base-url');

if (target) target.textContent = `${base}/v1`;

for (const block of document.querySelectorAll('pre')) {
  block.innerHTML = block.innerHTML.replaceAll('https://spark.trysparkai.workers.dev', base);

  const copy = document.createElement('button');
  copy.className = 'doc-copy';
  copy.type = 'button';
  copy.textContent = 'Copy';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(block.querySelector('code').textContent).catch(() => {});
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
  });
  block.appendChild(copy);
}

for (const cell of document.querySelectorAll('.facts-table code')) {
  cell.textContent = cell.textContent.replace('https://spark.trysparkai.workers.dev', base);
}
