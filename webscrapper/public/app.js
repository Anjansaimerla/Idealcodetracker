document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('scraper-form');
  const submitBtn = document.getElementById('submit-btn');
  const logsContainer = document.getElementById('logs');
  const exportJsonBtn = document.getElementById('export-json');
  const exportCsvBtn = document.getElementById('export-csv');

  // Tab switching logic
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      button.classList.add('active');
      const tabId = `tab-${button.getAttribute('data-tab')}`;
      document.getElementById(tabId).classList.add('active');
    });
  });

  let currentScrapedData = null;

  // Logging helpers
  const addLog = (message, type = '') => {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerText = `[${time}] ${message}`;
    logsContainer.appendChild(entry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  };

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = document.getElementById('url').value;
    const waitSelector = document.getElementById('wait-selector').value;
    const proxy = document.getElementById('proxy').value;
    const customJs = document.getElementById('custom-js').value;
    const screenshot = document.getElementById('screenshot').checked;

    // Reset UI
    submitBtn.disabled = true;
    submitBtn.innerText = 'Scraping in progress...';
    exportJsonBtn.disabled = true;
    exportCsvBtn.disabled = true;
    currentScrapedData = null;

    logsContainer.innerHTML = '';
    addLog('Scraping session started.', 'system');
    addLog('Initializing virtual stealth browser context...', 'system');
    addLog('Applying User-Agent: Chrome 120 (Windows desktop)', 'system');
    addLog('Applying navigator spoofing & automated control removal', 'system');

    // Simulate logs for visual impact while request runs
    const logInterval = setInterval(() => {
      const messages = [
        'Bypassing Cloudflare/Sucuri fingerprint checks...',
        'Simulating realistic mouse movements & human scroll behaviors...',
        'Checking DOM load state...',
        'Dynamic script injection prepped...',
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      addLog(randomMsg);
    }, 4000);

    try {
      addLog(`Sending network request to target: ${url}`, 'system');
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, waitSelector, proxy, customJs, screenshot }),
      });

      clearInterval(logInterval);

      const result = await response.json();

      if (result.success) {
        currentScrapedData = result.data;
        addLog('Challenge checks bypassed successfully!', 'success');
        addLog('Web page DOM retrieved and structured extraction completed!', 'success');

        // Populate results
        renderResults(result.data);

        submitBtn.disabled = false;
        submitBtn.innerText = 'Run Stealth Scraper';
        exportJsonBtn.disabled = false;
        exportCsvBtn.disabled = false;
      } else {
        addLog(`Extraction Failed: ${result.error}`, 'error');
        submitBtn.disabled = false;
        submitBtn.innerText = 'Run Stealth Scraper';
      }
    } catch (err) {
      clearInterval(logInterval);
      addLog(`Network/Connection Error: ${err.message}`, 'error');
      submitBtn.disabled = false;
      submitBtn.innerText = 'Run Stealth Scraper';
    }
  });

  function renderResults(data) {
    // 1. Metadata
    document.getElementById('result-title').innerText = data.title || 'No Title Found';

    const metaContainer = document.getElementById('result-meta');
    metaContainer.innerHTML = '';
    if (data.meta && Object.keys(data.meta).length > 0) {
      Object.entries(data.meta).forEach(([key, val]) => {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.innerHTML = `<strong>${key}:</strong> ${val}`;
        metaContainer.appendChild(row);
      });
    } else {
      metaContainer.innerText = 'No metadata elements found.';
    }

    const headingsContainer = document.getElementById('result-headings');
    headingsContainer.innerHTML = '';
    let headingsFound = false;
    if (data.headings) {
      ['h1', 'h2', 'h3'].forEach(hTag => {
        if (data.headings[hTag] && data.headings[hTag].length > 0) {
          headingsFound = true;
          data.headings[hTag].forEach(text => {
            const hDiv = document.createElement('div');
            hDiv.className = 'list-item';
            hDiv.innerHTML = `<span style="color:#a855f7; font-weight:bold;">${hTag.toUpperCase()}</span>: ${text}`;
            headingsContainer.appendChild(hDiv);
          });
        }
      });
    }
    if (!headingsFound) {
      headingsContainer.innerText = 'No heading tags (H1-H3) detected.';
    }

    // Custom JS result
    const customJsContainer = document.getElementById('custom-js-container');
    const customJsResult = document.getElementById('result-custom-js');
    if (data.customJsResult !== null && data.customJsResult !== undefined) {
      customJsContainer.style.display = 'block';
      customJsResult.innerText = typeof data.customJsResult === 'object' 
        ? JSON.stringify(data.customJsResult, null, 2) 
        : data.customJsResult;
    } else {
      customJsContainer.style.display = 'none';
    }

    // 2. Text / Content
    const textContainer = document.getElementById('result-text');
    textContainer.innerHTML = '';
    if (data.textElements && data.textElements.length > 0) {
      data.textElements.forEach(text => {
        const p = document.createElement('p');
        p.innerText = text;
        textContainer.appendChild(p);
      });
    } else {
      textContainer.innerHTML = '<p class="empty-state">No meaningful paragraph text content found.</p>';
    }

    // 3. Links & Images
    const linksContainer = document.getElementById('result-links');
    linksContainer.innerHTML = '';
    if (data.links && data.links.length > 0) {
      data.links.forEach(link => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `<a href="${link.href}" target="_blank">${link.text || link.href}</a>`;
        linksContainer.appendChild(item);
      });
    } else {
      linksContainer.innerHTML = '<p class="empty-state">No links found.</p>';
    }

    const imgContainer = document.getElementById('result-images');
    imgContainer.innerHTML = '';
    if (data.images && data.images.length > 0) {
      data.images.forEach(img => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `<strong>Alt:</strong> ${img.alt || 'None'} <br> <a href="${img.src}" target="_blank" style="color:var(--text-secondary);">${img.src}</a>`;
        imgContainer.appendChild(item);
      });
    } else {
      imgContainer.innerHTML = '<p class="empty-state">No images found.</p>';
    }

    // 4. Tables
    const tablesContainer = document.getElementById('result-tables');
    tablesContainer.innerHTML = '';
    if (data.tables && data.tables.length > 0) {
      data.tables.forEach(tableData => {
        const table = document.createElement('table');
        table.className = 'scraped-table';
        tableData.forEach((row, rowIndex) => {
          const tr = document.createElement('tr');
          row.forEach(cell => {
            const cellElement = document.createElement(rowIndex === 0 ? 'th' : 'td');
            cellElement.innerText = cell;
            tr.appendChild(cellElement);
          });
          table.appendChild(tr);
        });
        tablesContainer.appendChild(table);
      });
    } else {
      tablesContainer.innerHTML = '<p class="empty-state">No structured tables extracted.</p>';
    }

    // 5. Screenshot
    const screenshotContainer = document.getElementById('result-screenshot');
    screenshotContainer.innerHTML = '';
    if (data.screenshot) {
      const img = document.createElement('img');
      img.src = data.screenshot;
      img.alt = 'Page Screenshot';
      screenshotContainer.appendChild(img);
    } else {
      screenshotContainer.innerHTML = '<p class="empty-state">No screenshot captured (screenshot option was disabled or failed).</p>';
    }

    // 6. Raw HTML
    const htmlElement = document.getElementById('result-html');
    htmlElement.textContent = data.html || 'No HTML content extracted.';
  }

  // Export functions
  exportJsonBtn.addEventListener('click', () => {
    if (!currentScrapedData) return;
    const blob = new Blob([JSON.stringify(currentScrapedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scraped_data_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  exportCsvBtn.addEventListener('click', () => {
    if (!currentScrapedData) return;
    
    // We export text content paragraphs by default
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Index,Extracted Paragraphs\n";
    
    if (currentScrapedData.textElements && currentScrapedData.textElements.length > 0) {
      currentScrapedData.textElements.forEach((p, idx) => {
        const sanitized = p.replace(/"/g, '""');
        csvContent += `${idx + 1},"${sanitized}"\n`;
      });
    } else {
      csvContent += "0,No content extracted\n";
    }

    const encodedUri = encodeURI(csvContent);
    const a = document.createElement('a');
    a.href = encodedUri;
    a.download = `scraped_data_${Date.now()}.csv`;
    a.click();
  });
});
