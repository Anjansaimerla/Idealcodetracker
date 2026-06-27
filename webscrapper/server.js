const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin and use defaults
puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Human-like delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.post('/api/scrape', async (req, res) => {
  const { url, waitSelector, customJs, proxy, screenshot } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  let browser = null;

  try {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
    ];

    if (proxy) {
      launchArgs.push(`--proxy-server=${proxy}`);
    }

    browser = await puppeteer.launch({
      headless: true, // Run in headless mode (essential for background execution)
      args: launchArgs,
    });

    const page = await browser.newPage();

    // Set standard desktop user agent to avoid default Puppeteer headless UA
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set dynamic viewport size
    await page.setViewport({ width: 1280, height: 800 });

    // Enable JavaScript
    await page.setJavaScriptEnabled(true);

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000, // 60 seconds timeout
    });

    // Simulate human-like mouse movement & scroll to load dynamic content
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight > 3000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Introduce random minor human delay
    await delay(1000 + Math.random() * 2000);

    // Wait for custom selector if provided
    if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 15000 });
    }

    // Execute custom JS if provided
    let customJsResult = null;
    if (customJs) {
      try {
        customJsResult = await page.evaluate(new Function(customJs));
      } catch (err) {
        customJsResult = `Error executing custom script: ${err.message}`;
      }
    }

    // Capture screenshot if requested
    let screenshotBase64 = null;
    if (screenshot) {
      screenshotBase64 = await page.screenshot({
        encoding: 'base64',
        type: 'jpeg',
        quality: 80,
      });
    }

    // Extract structured data from the page
    const scrapedData = await page.evaluate(() => {
      // Basic Metadata
      const title = document.title;
      const meta = {};
      document.querySelectorAll('meta').forEach((el) => {
        const name = el.getAttribute('name') || el.getAttribute('property');
        const content = el.getAttribute('content');
        if (name && content) {
          meta[name] = content;
        }
      });

      // Headings
      const headings = {
        h1: Array.from(document.querySelectorAll('h1')).map((el) => el.innerText.trim()).filter(Boolean),
        h2: Array.from(document.querySelectorAll('h2')).map((el) => el.innerText.trim()).filter(Boolean),
        h3: Array.from(document.querySelectorAll('h3')).map((el) => el.innerText.trim()).filter(Boolean),
      };

      // Main Text Elements
      const textElements = Array.from(document.querySelectorAll('p, span, li, article'))
        .map((el) => el.innerText.trim())
        .filter((text) => text.length > 20) // Only keep meaningful paragraphs
        .slice(0, 100); // Limit to avoid massive payloads

      // Links
      const links = Array.from(document.querySelectorAll('a'))
        .map((el) => ({
          text: el.innerText.trim(),
          href: el.getAttribute('href'),
        }))
        .filter((link) => link.href && link.href.startsWith('http'));

      // Images
      const images = Array.from(document.querySelectorAll('img'))
        .map((el) => ({
          alt: el.getAttribute('alt') || '',
          src: el.getAttribute('src'),
        }))
        .filter((img) => img.src);

      // Simple Table Data Extraction
      const tables = Array.from(document.querySelectorAll('table')).map((table) => {
        const rows = Array.from(table.querySelectorAll('tr'));
        return rows.map((row) =>
          Array.from(row.querySelectorAll('th, td')).map((cell) => cell.innerText.trim())
        );
      });

      // Page body raw HTML
      const html = document.body.innerHTML;

      return {
        title,
        meta,
        headings,
        textElements,
        links,
        images,
        tables,
        html,
      };
    });

    res.json({
      success: true,
      data: {
        ...scrapedData,
        customJsResult,
        screenshot: screenshotBase64 ? `data:image/jpeg;base64,${screenshotBase64}` : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Serve frontend for wildcard route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Stealth Scraper server running on http://localhost:${PORT}`);
});
