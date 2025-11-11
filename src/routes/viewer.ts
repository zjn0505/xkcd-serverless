import { RouterType } from 'itty-router';
import viewerHtml from '../../public/viewer.html';

/**
 * Register HTML viewer routes
 */
export function registerViewerRoutes(router: RouterType) {
  /**
   * HTML to check xkcd by id. All languages are shown.
   * with << < > and >> navigation links
   */
  router.get('/view/:comicId', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const comicIdStr = url.pathname.split('/')[2];
      const comicId = parseInt(comicIdStr);
      
      if (isNaN(comicId) || comicId <= 0) {
        return new Response('Invalid comic ID', { status: 400 });
      }

      // Fetch main comic
      const comic = await db.getComic(comicId);
      if (!comic) {
        return new Response('Comic not found', { status: 404 });
      }

      // Fetch latest comic to enable >> navigation
      const latestComic = await db.getLatestComic();
      const latestId = latestComic?.id || comicId;

    // Define all supported languages with their potential source URLs
    const languages: Array<{ code: string; name: string; potentialUrl: string }> = [
      { code: 'zh-cn', name: '简体中文 (Simplified Chinese)', potentialUrl: `https://xkcd.in/comic?lg=cn&id=${comicId}` },
      { code: 'zh-tw', name: '繁體中文 (Traditional Chinese)', potentialUrl: `https://xkcd.tw/${comicId}` },
      { code: 'es', name: 'Español (Spanish)', potentialUrl: 'https://es.xkcd.com/' },
      { code: 'fr', name: 'Français (French)', potentialUrl: `https://xkcd.lapin.org/index.php?number=${comicId}` },
      { code: 'de', name: 'Deutsch (German)', potentialUrl: `https://xkcde.dapete.net/${comicId}/` },
      { code: 'ru', name: 'Русский (Russian)', potentialUrl: `https://xkcd.ru/${comicId}` }
    ];

    // Fetch all localized versions (or show placeholder if not available)
    const localizedComics: Array<{ lang: string; langName: string; comic: any | null; potentialUrl: string }> = [];
    for (const { code, name, potentialUrl } of languages) {
      const localized = await db.getLocalizedComic(comicId, code as any);
      localizedComics.push({ 
        lang: code, 
        langName: name, 
        comic: localized,
        potentialUrl: potentialUrl
      });
    }

      // Build navigation HTML
      const navigationHtml = `
      <a href="/view/1" class="nav-btn" ${comicId === 1 ? 'style="pointer-events:none;background:#bdc3c7"' : ''}>&lt;&lt; First</a>
      <a href="/view/${comicId - 1}" class="nav-btn" ${comicId === 1 ? 'style="pointer-events:none;background:#bdc3c7"' : ''}>&lt; Prev</a>
      <a href="/view/${comicId + 1}" class="nav-btn" ${comicId >= latestId ? 'style="pointer-events:none;background:#bdc3c7"' : ''}>Next &gt;</a>
      <a href="/view/${latestId}" class="nav-btn" ${comicId >= latestId ? 'style="pointer-events:none;background:#bdc3c7"' : ''}>Latest &gt;&gt;</a>
    `;

      // Build comic metadata HTML
      const comicMetaHtml = comic.year && comic.month && comic.day
        ? `<div class="comic-meta">Published: ${comic.year}-${String(comic.month).padStart(2, '0')}-${String(comic.day).padStart(2, '0')}</div>`
        : '';

      // Build comic alt text HTML
      const comicAltHtml = comic.alt
        ? `<div class="comic-alt"><strong>Alt text:</strong> ${comic.alt}</div>`
        : '';

      // Build comic link HTML
      const comicLinkHtml = comic.link
        ? `<a href="${comic.link}" class="source-link" target="_blank">🔗 View on xkcd.com</a>`
        : '';

      // Build localized comics HTML (show all languages, with placeholders for unavailable ones)
      const localizedComicsHtml = `<div class="localized-grid">
${localizedComics.map(({ lang, langName, comic: loc, potentialUrl }) => {
        if (loc) {
          // Comic exists - show full comic
          return `    <div class="comic-section localized">
      <h2>🌍 ${langName}</h2>
      <div class="comic-title">${loc.title}</div>
      <div class="comic-image">
        <img src="${loc.img}" alt="${loc.alt || loc.title}" title="${loc.alt || ''}" />
      </div>
      ${loc.alt ? `<div class="comic-alt"><strong>Alt text:</strong> ${loc.alt}</div>` : ''}
      ${loc.source_url ? `<a href="${loc.source_url}" class="source-link" target="_blank">🔗 View source</a>` : ''}
    </div>`;
        } else {
          // Comic doesn't exist - show placeholder
          return `    <div class="comic-section placeholder">
      <h2>🌍 ${langName}</h2>
      <div class="placeholder-content">
        <p>Translation not available yet</p>
        <a href="${potentialUrl}" class="source-link" target="_blank">🔗 Check if available at source</a>
      </div>
    </div>`;
        }
      }).join('\n')}
</div>`;

      // Replace placeholders in template
      const html = viewerHtml
        .replace(/{{COMIC_ID}}/g, String(comicId))
        .replace(/{{COMIC_TITLE}}/g, comic.title)
        .replace(/{{NAVIGATION}}/g, navigationHtml)
        .replace(/{{COMIC_META}}/g, comicMetaHtml)
        .replace(/{{COMIC_IMG}}/g, comic.img)
        .replace(/{{COMIC_ALT}}/g, comic.alt || comic.title)
        .replace(/{{COMIC_ALT_TEXT}}/g, comicAltHtml)
        .replace(/{{COMIC_LINK}}/g, comicLinkHtml)
        .replace(/{{LOCALIZED_COMICS}}/g, localizedComicsHtml);

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
        }
      });
    } catch (error) {
      console.error('Error in /view/:comicId:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });
}

