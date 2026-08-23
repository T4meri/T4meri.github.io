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

const tocLinks = [...document.querySelectorAll('.toc a')];
const tocTargets = tocLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);

if (tocTargets.length > 0) {
  let queued = false;

  const spy = () => {
    queued = false;

    let active = tocTargets[0];
    for (const section of tocTargets) {
      if (section.getBoundingClientRect().top <= 180) active = section;
    }

    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
      active = tocTargets[tocTargets.length - 1];
    }

    for (const link of tocLinks) link.classList.toggle('current', link.getAttribute('href') === `#${active.id}`);
  };

  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(spy);
    },
    { passive: true }
  );

  spy();
}
